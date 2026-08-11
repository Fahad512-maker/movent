<?php

namespace App\Services\PaymentGateways;

use App\Models\Invoice;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

// Stripe Checkout Sessions (hosted page) — https://stripe.com/docs/api/checkout/sessions
class StripeGateway implements GatewayContract
{
    // Signed webhook events older than this are rejected, even with a valid
    // signature, to block replay of a captured request.
    private const WEBHOOK_TOLERANCE_SECONDS = 300;

    public function createCheckout(Invoice $invoice, float $amount, array $config, string $returnUrl, string $cancelUrl): CheckoutResult
    {
        $secretKey = $config['secret_key'] ?? '';
        $currency  = strtolower($invoice->currency ?: 'usd');

        $response = Http::withToken($secretKey)
            ->asForm()
            ->post('https://api.stripe.com/v1/checkout/sessions', [
                'mode'                                             => 'payment',
                'success_url'                                      => $returnUrl . '?session_id={CHECKOUT_SESSION_ID}',
                'cancel_url'                                       => $cancelUrl,
                'client_reference_id'                              => (string) $invoice->id,
                'metadata'                                         => ['invoice_id' => $invoice->id],
                'line_items'                                       => [[
                    'quantity'   => 1,
                    'price_data' => [
                        'currency'     => $currency,
                        'unit_amount'  => (int) round($amount * 100),
                        'product_data' => ['name' => "Invoice {$invoice->invoice_number}"],
                    ],
                ]],
            ]);

        if (!$response->successful()) {
            Log::warning('Stripe checkout session creation failed', ['status' => $response->status(), 'invoice_id' => $invoice->id]);
            throw new \RuntimeException($response->json('error.message') ?? 'Stripe checkout could not be started');
        }

        $session = $response->json();

        return new CheckoutResult(
            sessionId: $session['id'],
            navigation: 'redirect',
            action: $session['url'],
        );
    }

    /**
     * Look up a Checkout Session's authoritative status directly — used as
     * an immediate-UX fallback on the customer's return from Stripe's hosted
     * page (see PublicInvoiceController::returnFromGateway()), for
     * environments where Stripe's webhook can't reach this app (e.g. a local
     * dev/sandbox instance with no public URL). Never trust this over the
     * webhook when both are available — finalizeGatewaySuccess() is
     * idempotent either way, so whichever arrives first wins.
     */
    public function getCheckoutSession(string $sessionId, array $config): array
    {
        $response = Http::withToken($config['secret_key'] ?? '')
            ->get("https://api.stripe.com/v1/checkout/sessions/{$sessionId}");

        return $response->successful() ? $response->json() : [];
    }

    public function parseWebhook(Request $request, array $config): WebhookEvent
    {
        $secret    = $config['webhook_secret'] ?? '';
        $signature = $request->header('Stripe-Signature', '');
        $payload   = $request->getContent();

        if (!$secret || !$this->verifySignature($payload, $signature, $secret)) {
            return new WebhookEvent(verified: false);
        }

        $event = json_decode($payload, true);
        $type  = $event['type'] ?? '';
        $obj   = $event['data']['object'] ?? [];

        if ($type === 'checkout.session.completed' && ($obj['payment_status'] ?? '') === 'paid') {
            return new WebhookEvent(
                verified: true,
                eventId: $event['id'] ?? null,
                outcome: 'succeeded',
                gatewaySessionId: $obj['id'] ?? null,
                transactionId: $obj['payment_intent'] ?? ($obj['id'] ?? null),
            );
        }

        if (in_array($type, ['checkout.session.expired', 'checkout.session.async_payment_failed'])) {
            return new WebhookEvent(
                verified: true,
                eventId: $event['id'] ?? null,
                outcome: 'failed',
                gatewaySessionId: $obj['id'] ?? null,
                failureReason: $type,
            );
        }

        // Signature was valid but this isn't an event type we act on (e.g.
        // charge.refunded) — acknowledge without treating it as success/failure.
        return new WebhookEvent(verified: true, eventId: $event['id'] ?? null, outcome: 'ignored');
    }

    private function verifySignature(string $payload, string $header, string $secret): bool
    {
        $parts = [];
        foreach (explode(',', $header) as $part) {
            [$k, $v] = array_pad(explode('=', $part, 2), 2, null);
            $parts[$k] = $v;
        }

        $timestamp = $parts['t'] ?? null;
        $v1        = $parts['v1'] ?? null;
        if (!$timestamp || !$v1) return false;

        if (abs(time() - (int) $timestamp) > self::WEBHOOK_TOLERANCE_SECONDS) return false;

        $expected = hash_hmac('sha256', "{$timestamp}.{$payload}", $secret);

        return hash_equals($expected, $v1);
    }
}
