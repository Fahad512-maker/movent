<?php

namespace App\Http\Controllers\Api;

use App\Helpers\ApiResponse;
use App\Http\Controllers\Controller;
use App\Models\CompanyPaymentGateway;
use App\Models\Invoice;
use App\Models\Payment;
use App\Models\Project;
use App\Models\Task;
use App\Services\InvoiceGatewayChargeService;
use App\Services\InvoicePaymentService;
use App\Services\PaymentGateways\PaymentGatewayManager;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Str;

class PublicInvoiceController extends Controller
{
    // GET /public/invoices/{token}
    public function show(Request $request, string $token): JsonResponse
    {
        $invoice = Invoice::where('payment_token', $token)
            ->with(['company', 'items', 'client', 'project'])
            ->first();

        if (!$invoice) {
            return ApiResponse::error('Invalid payment link', 404);
        }

        if ($invoice->token_expires_at && $invoice->token_expires_at->isPast()) {
            return ApiResponse::error('Payment link has expired', 410);
        }

        if (in_array($invoice->status, ['cancelled'])) {
            return ApiResponse::error('This invoice is no longer active', 422);
        }

        // Log the public link view
        InvoicePaymentService::logView($invoice, $request->ip());

        $hasPendingPayment = $invoice->payments()->where('status', 'pending')->exists();

        $company = $invoice->company;
        $profile = $company->invoicingProfile();

        [$gateways, $gatewayUnavailableMessage] = $this->resolveInvoiceGateways($invoice);

        // Add bank transfer if the tenant has bank details on file — not a
        // real gateway account, so it carries no id, only the same
        // {id,type,label} shape as the real entries above for the frontend
        // to render uniformly.
        $hasBankDetails = $profile['bank_name'] || $profile['bank_account_number'];
        if ($hasBankDetails) {
            $gateways[] = ['id' => null, 'type' => 'bank_transfer', 'label' => 'Bank Transfer'];
        }

        $bankDetails = null;
        if ($hasBankDetails) {
            $bankDetails = array_filter([
                'bank_name'      => $profile['bank_name'],
                'account_name'   => $profile['bank_account_name'],
                'account_number' => $profile['bank_account_number'],
                'iban'           => $profile['bank_iban'],
                'swift'          => $profile['bank_swift'],
            ]);
        }

        return ApiResponse::success([
            'invoice_number'   => $invoice->invoice_number,
            'company_name'     => $profile['name'],
            'company_logo'     => $profile['logo_path'],
            'customer_name'    => $invoice->customer_name,
            'customer_email'   => $invoice->customer_email,
            'customer_phone'   => $invoice->customer_phone,
            'customer_address' => $invoice->customer_address,
            'subtotal'         => (float) $invoice->subtotal,
            'tax_rate'         => (float) $invoice->tax_rate,
            'tax_amount'       => (float) $invoice->tax_amount,
            'discount_amount'  => (float) $invoice->discount_amount,
            'total_amount'     => (float) $invoice->total_amount,
            'paid_amount'      => (float) $invoice->paid_amount,
            'currency'         => $invoice->currency,
            'status'           => $invoice->status,
            'due_date'         => $invoice->due_date?->toDateString(),
            'notes'            => $invoice->notes,
            'token_expires_at' => $invoice->token_expires_at?->toIso8601String(),
            'items'            => $invoice->items->map(fn($i) => [
                'description' => $i->description,
                'quantity'    => (float) $i->quantity,
                'unit_price'  => (float) $i->unit_price,
                'total'       => (float) $i->total,
            ]),
            'available_gateways'          => $gateways,
            'gateway_unavailable_message' => $gatewayUnavailableMessage,
            'bank_details'                => $bankDetails ?: null,
            'has_pending_payment'         => $hasPendingPayment,
            'project'                     => $this->projectSummary($invoice),
        ]);
    }

    private function projectSummary(Invoice $invoice): ?array
    {
        $project = $invoice->project
            ?: Project::where('company_id', $invoice->company_id)
                ->where('invoice_id', $invoice->id)
                ->first();

        if (!$project) {
            return null;
        }

        $taskStats = Task::where('project_id', $project->id)
            ->selectRaw('COUNT(*) as total, SUM(CASE WHEN status = "completed" THEN 1 ELSE 0 END) as done')
            ->first();
        $totalTasks = (int) ($taskStats?->total ?? 0);
        $doneTasks  = (int) ($taskStats?->done ?? 0);
        $progress   = $totalTasks > 0 ? (int) round(($doneTasks / $totalTasks) * 100) : (int) ($project->progress ?? 0);

        $projectInvoices = Invoice::where('company_id', $project->company_id)
            ->where(fn ($q) => $q->where('project_id', $project->id)->orWhere('id', $project->invoice_id))
            ->orderBy('created_at')
            ->get(['id', 'invoice_number', 'total_amount', 'paid_amount', 'status', 'due_date', 'currency', 'project_id']);
        $totalInvoiced = (float) $projectInvoices->sum('total_amount');
        $totalPaid     = (float) $projectInvoices->sum('paid_amount');
        $isMainInvoice = (int) $project->invoice_id === (int) $invoice->id;
        if ($projectInvoices->count() <= 1) {
            $isMainInvoice = true;
        }

        $portalActive = (bool) ($invoice->client?->portal_access && $invoice->client?->user_id);
        $showFull = $isMainInvoice || $portalActive;

        return [
            'id'                 => $project->id,
            'name'               => $project->name,
            'reference'          => $project->reference,
            'status'             => $project->status,
            'progress'           => $progress,
            'is_main_invoice'    => $isMainInvoice,
            'invoice_count'      => $projectInvoices->count(),
            'portal_active'      => $portalActive,
            'view_mode'          => $showFull ? 'full' : 'progress',
            'start_date'         => $showFull ? $project->start_date?->toDateString() : null,
            'deadline'           => $showFull ? $project->deadline?->toDateString() : null,
            'total_invoiced'     => $showFull ? $totalInvoiced : null,
            'total_paid'         => $showFull ? $totalPaid : null,
            'outstanding'        => $showFull ? max(0, round($totalInvoiced - $totalPaid, 2)) : null,
            'invoices'           => $showFull ? $projectInvoices->map(fn ($i) => [
                'id'             => $i->id,
                'invoice_number' => $i->invoice_number,
                'status'         => $i->status,
                'total_amount'   => (float) $i->total_amount,
                'paid_amount'    => (float) $i->paid_amount,
                'outstanding'    => max(0, round((float) $i->total_amount - (float) $i->paid_amount, 2)),
                'currency'       => $i->currency,
                'due_date'       => $i->due_date?->toDateString(),
                'is_current'     => (int) $i->id === (int) $invoice->id,
            ])->values() : [],
        ];
    }

    // The gateway account(s) this invoice's public/client pay page should
    // offer: the invoice's own explicit selection (filtered to still-active
    // accounts) if one was ever made, else the tenant's per-type defaults
    // (today's effective behavior, preserved for invoices created before
    // this feature existed). Returns [accounts, unavailableMessage] — the
    // message is only set when the invoice HAD a selection but none of it is
    // active anymore (distinct from "company has no gateway configured at
    // all", which the invoice-create flow warns about separately).
    private function resolveInvoiceGateways(Invoice $invoice): array
    {
        $allowed = $invoice->paymentGatewayAccounts;

        if ($allowed->isEmpty()) {
            $rows = CompanyPaymentGateway::resolveActiveGateways($invoice->company)
                ->groupBy('gateway')
                ->map(fn($rows) => $rows->firstWhere('is_default', true) ?? $rows->first());

            return [$this->formatGatewayAccounts($rows), null];
        }

        $active = $allowed->where('is_active', true);

        if ($active->isEmpty()) {
            return [[], 'No active payment gateway is available for this invoice. Please contact support.'];
        }

        return [$this->formatGatewayAccounts($active), null];
    }

    private function formatGatewayAccounts($rows): array
    {
        return $rows->map(fn($g) => [
            'id'    => $g->id,
            'type'  => $g->gateway,
            'label' => $g->label ?: (CompanyPaymentGateway::GATEWAYS[$g->gateway] ?? $g->gateway),
        ])->values()->toArray();
    }

    // POST /public/invoices/{token}/pay
    public function pay(Request $request, string $token): JsonResponse
    {
        $invoice = Invoice::where('payment_token', $token)
            ->with('company')
            ->first();

        if (!$invoice) {
            return ApiResponse::error('Invalid payment link', 404);
        }

        if ($invoice->token_expires_at && $invoice->token_expires_at->isPast()) {
            return ApiResponse::error('Payment link has expired', 410);
        }

        if ($invoice->status === 'paid') {
            return ApiResponse::error('Invoice is already paid', 422);
        }

        if (in_array($invoice->status, ['cancelled'])) {
            return ApiResponse::error('This invoice is no longer active', 422);
        }

        // Prevent duplicate submissions — one unresolved claim per invoice at a
        // time; the company admin must confirm or reject it before another
        // attempt can be submitted.
        if ($invoice->payments()->where('status', 'pending')->exists()) {
            return ApiResponse::error('A payment is already awaiting confirmation for this invoice.', 422);
        }

        $onlineGatewayKeys = array_keys(CompanyPaymentGateway::GATEWAYS);
        $allowedGateways   = array_merge(['bank_transfer'], $onlineGatewayKeys);
        $outstanding       = round((float) $invoice->total_amount - (float) $invoice->paid_amount, 2);

        $data = $request->validate([
            'gateway'     => 'required|in:' . implode(',', $allowedGateways),
            'gateway_ref' => 'nullable|string|max:255',
            'notes'       => 'nullable|string|max:500',
            'amount'      => "nullable|numeric|min:0.01|max:{$outstanding}",
        ]);

        // Log payment attempt in audit trail before creating (safe even if creation fails)
        InvoicePaymentService::logPayment(
            $invoice,
            new Payment([
                'invoice_id'  => $invoice->id,
                'amount'      => $data['amount'] ?? ((float) $invoice->total_amount - (float) $invoice->paid_amount),
                'method'      => in_array($data['gateway'], $onlineGatewayKeys) ? 'gateway' : 'bank_transfer',
                'gateway'     => in_array($data['gateway'], $onlineGatewayKeys) ? $data['gateway'] : null,
                'status'      => 'pending',
            ]),
            'public_link',
            $request->ip()
        );

        $isOnlineGateway = in_array($data['gateway'], $onlineGatewayKeys);
        $dbMethod        = $isOnlineGateway ? 'gateway' : 'bank_transfer';
        $dbGateway       = $isOnlineGateway ? $data['gateway'] : null;
        $amount          = $data['amount'] ?? $outstanding;

        // No receipt yet — a receipt implies money actually received. It's
        // generated once the company admin confirms this claim (see
        // Admin\PaymentController::confirm()), not at submission time.
        $payment = Payment::create([
            'invoice_id'     => $invoice->id,
            'amount'         => $amount,
            'method'         => $dbMethod,
            'gateway'        => $dbGateway,
            'gateway_ref'    => $data['gateway_ref'] ?? null,
            'notes'          => $data['notes'] ?? null,
            'status'         => 'pending',
            'payment_date'   => now()->toDateString(),
        ]);

        // Invoice status/paid_amount is NOT touched here — it only changes
        // once the company admin verifies and confirms this payment claim
        // (InvoicePaymentService::applyToInvoice runs from confirm() instead).

        // Audit log with actual payment ID
        InvoicePaymentService::logPayment($invoice, $payment, 'public_link', $request->ip());

        // Notify the company admin (email + in-app activity feed) that a
        // payment claim is awaiting their verification.
        InvoicePaymentService::notifyAdmin($invoice, $payment);

        return ApiResponse::success([
            'payment_id'      => $payment->id,
            'amount'          => $amount,
            'invoice_status'  => $invoice->status,
        ], 'Payment request submitted. Awaiting verification.');
    }

    // POST /public/invoices/{token}/gateways/{gateway}/initiate
    // Starts a real hosted checkout (Stripe/PayPal/Authorize.net) — unlike
    // pay() this does not create a "please verify me" claim; the payment is
    // only ever marked confirmed by the gateway's webhook (or, for immediate
    // UX, the customer's return-callback — both paths are idempotent).
    public function initiate(Request $request, string $token, string $gateway): JsonResponse
    {
        if (!array_key_exists($gateway, CompanyPaymentGateway::GATEWAYS)) {
            return ApiResponse::error('Unknown payment gateway', 422);
        }

        $invoice = Invoice::where('payment_token', $token)->with('company')->first();

        if (!$invoice) {
            return ApiResponse::error('Invalid payment link', 404);
        }
        if ($invoice->token_expires_at && $invoice->token_expires_at->isPast()) {
            return ApiResponse::error('Payment link has expired', 410);
        }
        if ($invoice->status === 'paid') {
            return ApiResponse::error('Invoice is already paid', 422);
        }
        if (in_array($invoice->status, ['cancelled'])) {
            return ApiResponse::error('This invoice is no longer active', 422);
        }

        $existingPending = $invoice->payments()->where('status', 'pending')->latest('id')->first();
        if ($existingPending && $existingPending->gateway !== $gateway) {
            return ApiResponse::error('A payment is already awaiting confirmation for this invoice.', 422);
        }

        $company = $invoice->company;
        $companyGatewayId = $request->input('company_gateway_id') ? (int) $request->input('company_gateway_id') : null;
        $gatewayRow = $this->resolveGatewayForInvoice($invoice, $gateway, $companyGatewayId);
        if (!$gatewayRow) {
            return ApiResponse::error('This payment gateway is not available for this invoice.', 422);
        }

        $amount = round((float) $invoice->total_amount - (float) $invoice->paid_amount, 2);
        if ($amount <= 0) {
            return ApiResponse::error('Invoice is already paid', 422);
        }

        $frontendUrl = rtrim(config('app.frontend_url'), '/');
        $returnUrl   = "{$frontendUrl}/pay/invoice/{$token}/return/{$gateway}";
        $cancelUrl   = "{$frontendUrl}/pay/invoice/{$token}?cancelled=1";

        try {
            $gatewayMode = $gatewayRow->config['mode'] ?? 'sandbox';

            $payment = $existingPending ?? Payment::create([
                'invoice_id'          => $invoice->id,
                'amount'              => $amount,
                'method'              => 'gateway',
                'gateway'             => $gateway,
                'company_gateway_id'  => $gatewayRow->id,
                'gateway_mode'        => $gatewayMode,
                'status'              => 'pending',
                'payment_date'        => now()->toDateString(),
            ]);

            $checkout = PaymentGatewayManager::driver($gateway)
                ->createCheckout($invoice, $amount, $gatewayRow->config, $returnUrl, $cancelUrl);

            $payment->update(['gateway_session_id' => $checkout->sessionId, 'gateway_mode' => $gatewayMode]);

            InvoicePaymentService::logPayment($invoice, $payment, 'public_link_gateway_checkout', $request->ip());

            return ApiResponse::success(array_merge($checkout->toArray(), ['payment_id' => $payment->id]), 'Checkout started');
        } catch (\Throwable $e) {
            Log::error('Payment gateway checkout initiation failed', [
                'gateway' => $gateway, 'invoice_id' => $invoice->id, 'error' => $e->getMessage(),
            ]);

            // A pending row that never got a real gateway session represents
            // no actual payment attempt — leaving it "pending" would wrongly
            // block every retry behind the "awaiting confirmation" screen
            // (see show()'s has_pending_payment) and this same 422 check
            // above. Mark it failed instead (not delete, so the attempt and
            // its error are still visible in the audit trail) so the
            // customer can immediately try again.
            if (isset($payment) && $payment->status === 'pending' && !$payment->gateway_session_id) {
                $payment->update(['status' => 'failed', 'notes' => Str::limit($e->getMessage(), 500)]);
            }

            return ApiResponse::error('Could not start payment. Please try again or choose another payment method.', 500);
        }
    }

    // Shared lookup for the inline-payment endpoints below — same
    // token/expiry/status guards initiate() already applies.
    private function invoiceForGatewayAction(string $token): Invoice
    {
        $invoice = Invoice::where('payment_token', $token)->with('company')->first();

        if (!$invoice) {
            throw new \RuntimeException('Invalid payment link');
        }
        if ($invoice->token_expires_at && $invoice->token_expires_at->isPast()) {
            throw new \RuntimeException('Payment link has expired');
        }

        return $invoice;
    }

    // GET /public/invoices/{token}/gateways/{gateway}/init — public-safe
    // credentials for mounting Stripe Elements / PayPal Buttons / Authorize.net
    // Accept.js inline on this page (no redirect, unlike initiate() above).
    public function initGateway(Request $request, string $token, string $gateway): JsonResponse
    {
        try {
            $invoice = $this->invoiceForGatewayAction($token);
            $companyGatewayId = $request->query('company_gateway_id') ? (int) $request->query('company_gateway_id') : null;
            return ApiResponse::success(InvoiceGatewayChargeService::publicInit($invoice, $gateway, $companyGatewayId));
        } catch (\RuntimeException $e) {
            return ApiResponse::error($e->getMessage(), 422);
        }
    }

    // POST /public/invoices/{token}/gateways/paypal/create-order
    public function createPaypalOrder(Request $request, string $token): JsonResponse
    {
        try {
            $invoice = $this->invoiceForGatewayAction($token);
            $companyGatewayId = $request->input('company_gateway_id') ? (int) $request->input('company_gateway_id') : null;
            return ApiResponse::success(InvoiceGatewayChargeService::createPaypalOrder($invoice, $companyGatewayId));
        } catch (\RuntimeException $e) {
            return ApiResponse::error($e->getMessage(), 422);
        }
    }

    // POST /public/invoices/{token}/gateways/{gateway}/charge — inline charge,
    // finalized synchronously from this request's own response (no webhook
    // involved), mirroring Api\Admin\SubscriptionPaymentController::process().
    public function chargeGateway(Request $request, string $token, string $gateway): JsonResponse
    {
        $data = $request->validate(match ($gateway) {
            'stripe'        => ['payment_method_id' => 'required|string'],
            'paypal'        => ['paypal_order_id' => 'required|string'],
            'authorize_net' => ['opaque_data_descriptor' => 'required|string', 'opaque_data_value' => 'required|string'],
            default         => [],
        });

        try {
            $invoice = $this->invoiceForGatewayAction($token);
            $companyGatewayId = $request->input('company_gateway_id') ? (int) $request->input('company_gateway_id') : null;
            $result  = InvoiceGatewayChargeService::charge(
                $invoice, $gateway, $data, 'public_link_gateway_inline', null, $request->ip(), $companyGatewayId
            );
            return ApiResponse::success($result, 'Payment successful');
        } catch (\RuntimeException $e) {
            return ApiResponse::error($e->getMessage(), 422);
        }
    }

    // GET /public/invoices/{token}/return/{gateway}
    // Immediate-UX confirmation when the customer's browser lands back from
    // the gateway's hosted page. Not the source of truth — the gateway's
    // webhook (see Api\Webhooks\PaymentWebhookController) finalizes the
    // payment authoritatively and idempotently either way, so a customer who
    // closes the tab before this loads is still confirmed once the webhook
    // arrives.
    public function returnFromGateway(Request $request, string $token, string $gateway): JsonResponse
    {
        if (!array_key_exists($gateway, CompanyPaymentGateway::GATEWAYS)) {
            return ApiResponse::error('Unknown payment gateway', 422);
        }

        $invoice = Invoice::where('payment_token', $token)->with('company')->first();
        if (!$invoice) {
            return ApiResponse::error('Invalid payment link', 404);
        }

        if ($invoice->status === 'paid') {
            return ApiResponse::success(['status' => 'paid'], 'Invoice already paid');
        }

        $fallbackRow = PaymentGatewayManager::activeRowFor($invoice->company, $gateway);
        if (!$fallbackRow) {
            return ApiResponse::error('This payment gateway is not available for this invoice.', 422);
        }

        // PayPal requires an explicit capture step after approval. Stripe
        // Checkout Sessions auto-settle on Stripe's side, but we still check
        // the session's own status directly here as an immediate-UX fallback
        // — the webhook is the authoritative path, but in an environment
        // where it can't reach this app (e.g. local/sandbox dev with no
        // public URL), this is what actually finalizes the payment.
        // Authorize.net's Accept Hosted auto-settles with no equivalent
        // return-time lookup available, so there's nothing further to call
        // for it here — just report current status.
        //
        // The specific account is read off the payment row itself
        // (company_gateway_id, set when the checkout was initiated) rather
        // than re-resolved by type — necessary once a tenant can have
        // multiple accounts of the same gateway type. Falls back to the
        // type's default account for older pending payments predating that
        // column.
        if ($gateway === 'paypal') {
            $orderId = $request->query('token');
            $payment = $invoice->payments()->where('gateway', 'paypal')->where('gateway_session_id', $orderId)->first();

            if ($payment && $payment->status === 'pending') {
                $gatewayRow = $payment->company_gateway_id
                    ? (PaymentGatewayManager::accountById($invoice->company, $payment->company_gateway_id) ?? $fallbackRow)
                    : $fallbackRow;
                $driver = PaymentGatewayManager::driver('paypal');
                $result = $driver->captureOrder($orderId, $gatewayRow->config);
                if ($result['success'] ?? false) {
                    InvoicePaymentService::finalizeGatewaySuccess($payment, $result['transaction_id']);
                }
            }
        }

        if ($gateway === 'stripe') {
            $sessionId = $request->query('session_id');
            $payment   = $invoice->payments()->where('gateway', 'stripe')->where('gateway_session_id', $sessionId)->first();

            if ($payment && $payment->status === 'pending') {
                $gatewayRow = $payment->company_gateway_id
                    ? (PaymentGatewayManager::accountById($invoice->company, $payment->company_gateway_id) ?? $fallbackRow)
                    : $fallbackRow;
                $driver  = PaymentGatewayManager::driver('stripe');
                $session = $driver->getCheckoutSession($sessionId, $gatewayRow->config);
                if (($session['payment_status'] ?? '') === 'paid') {
                    InvoicePaymentService::finalizeGatewaySuccess($payment, $session['payment_intent'] ?? $sessionId);
                }
            }
        }

        $invoice->refresh();

        return ApiResponse::success(['status' => $invoice->status], 'Payment status');
    }

    // Account-aware resolution shared by initiate()/chargeGateway()-adjacent
    // endpoints that don't go through InvoiceGatewayChargeService — same
    // rules as that service's private gatewayRow(): explicit account id must
    // belong to this tenant, be active, match the requested type, and (if
    // the invoice has its own explicit selection) be one of the invoice's
    // allowed accounts. Falls back to the type's default account when no id
    // is given.
    private function resolveGatewayForInvoice(Invoice $invoice, string $gateway, ?int $companyGatewayId): ?CompanyPaymentGateway
    {
        if ($companyGatewayId === null) {
            return PaymentGatewayManager::activeRowFor($invoice->company, $gateway);
        }

        $row = PaymentGatewayManager::accountById($invoice->company, $companyGatewayId);
        if (!$row || $row->gateway !== $gateway) {
            return null;
        }

        $allowed = $invoice->paymentGatewayAccounts;
        if ($allowed->isNotEmpty() && !$allowed->contains('id', $row->id)) {
            return null;
        }

        return $row;
    }
}
