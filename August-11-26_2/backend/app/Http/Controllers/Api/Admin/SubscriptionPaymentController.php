<?php

namespace App\Http\Controllers\Api\Admin;

use App\Helpers\ApiResponse;
use App\Http\Controllers\Controller;
use App\Models\PaymentGateway;
use App\Models\SubscriptionPayment;
use App\Services\PaymentGatewayCharger;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Http;

class SubscriptionPaymentController extends Controller
{
    private PaymentGatewayCharger $charger;

    public function __construct(PaymentGatewayCharger $charger)
    {
        $this->charger = $charger;
    }

    private function admin()
    {
        return auth('admin')->user();
    }

    private function platformGateway(string $name): PaymentGateway
    {
        return $this->charger->platformGateway($name);
    }

    // GET /api/admin/subscription/order-summary — reconstructs the "Order
    // Summary" the /payment page shows from the admin's actual saved
    // package/seat/company allotment, for whenever localStorage.pending_order
    // (set once, client-side, at registration) isn't available — e.g. the
    // "Complete Payment" resume flow lands here on a session that never saw
    // the original registration page, or the browser storage was cleared.
    // Deliberately reported as mode='standard' (no custom module/dependency
    // breakdown) since that per-module selection isn't persisted anywhere to
    // reconstruct — the plan/seats/companies/price/trial figures below ARE
    // all real, saved values, just not the exact custom-selection breakdown.
    public function orderSummary(): JsonResponse
    {
        $admin   = $this->admin()->load('package');
        $package = $admin->package;

        if (!$package) {
            return ApiResponse::error('No package found for this account.', 404);
        }

        $seats     = $admin->max_users_per_company ?? $package->max_users_per_company;
        $companies = $admin->max_companies ?? $package->max_companies;

        return ApiResponse::success([
            'package_name'           => $package->name,
            'mode'                   => 'standard',
            'modules'                => [],
            'required_dependencies'  => [],
            'seats'                  => $seats ? "{$seats} Users" : 'Unlimited',
            'companies'              => $companies ? "{$companies} " . ($companies == 1 ? 'Company' : 'Companies') : 'Unlimited',
            'total_pkr'              => (float) ($package->price_pkr ?? 0),
            'total_usd'              => (float) ($package->price_usd ?? 0),
            'currency'               => 'USD',
            'trial_days'             => $package->trial_days ?? 14,
        ]);
    }

    // GET /api/admin/payment-gateways — list active gateways for the "choose
    // a payment method" step, mirroring Api\PublicController::activeGateways()
    // for the pre-registration flow (that one is unauthenticated; this one is
    // for already-logged-in Company Admins, e.g. the module-purchase checkout).
    public function activeGateways(): JsonResponse
    {
        $gateways = PaymentGateway::where('is_active', true)
            ->orderBy('id')
            ->get(['id', 'name', 'display_name', 'is_active']);

        if ($gateways->isEmpty()) {
            return ApiResponse::success([], 'No payment gateways configured');
        }

        return ApiResponse::success($gateways);
    }

    // =========================================================================
    // GET /api/admin/subscription/payment-init?gateway=stripe
    // Returns safe public credentials (never exposes secret keys)
    // =========================================================================
    public function init(Request $request): JsonResponse
    {
        $data    = $request->validate(['gateway' => 'required|in:stripe,paypal,authorize_net']);
        $gateway = $data['gateway'];

        try {
            $gw = $this->platformGateway($gateway);
        } catch (\RuntimeException $e) {
            return ApiResponse::error($e->getMessage(), 422);
        }

        $config = $gw->config ?? [];
        $mode   = $config['mode'] ?? 'sandbox';

        $public = match ($gateway) {
            'stripe' => [
                'publishable_key' => $config['publishable_key'] ?? '',
                'mode'            => $mode,
            ],
            'paypal' => [
                'client_id' => $config['client_id'] ?? '',
                'mode'      => $mode,
            ],
            'authorize_net' => [
                'api_login_id' => $config['api_login_id'] ?? '',
                'client_key'   => $config['client_key']   ?? '',
                'mode'         => $mode,
            ],
        };

        return ApiResponse::success($public);
    }

    // =========================================================================
    // POST /api/admin/subscription/paypal/create-order
    // Creates a PayPal order and returns the order ID to frontend
    // =========================================================================
    public function createPaypalOrder(Request $request): JsonResponse
    {
        $data = $request->validate([
            'amount'   => 'required|numeric|min:0.01',
            'currency' => 'required|string|size:3',
        ]);

        try {
            $gw = $this->platformGateway('paypal');
        } catch (\RuntimeException $e) {
            return ApiResponse::error($e->getMessage(), 422);
        }

        $config  = $gw->config ?? [];
        $mode    = $config['mode'] ?? 'sandbox';
        $baseUrl = $mode === 'live'
            ? 'https://api-m.paypal.com'
            : 'https://api-m.sandbox.paypal.com';

        $tokenRes = Http::withBasicAuth($config['client_id'] ?? '', $config['client_secret'] ?? '')
            ->asForm()
            ->post("{$baseUrl}/v1/oauth2/token", ['grant_type' => 'client_credentials']);

        if ($tokenRes->failed()) {
            $msg = $tokenRes->json('error_description') ?? 'PayPal authentication failed. Check credentials in Super Admin → Payment Gateways.';
            return ApiResponse::error($msg, 422);
        }

        $orderRes = Http::withToken($tokenRes->json('access_token'))
            ->post("{$baseUrl}/v2/checkout/orders", [
                'intent'         => 'CAPTURE',
                'purchase_units' => [[
                    'amount' => [
                        'currency_code' => strtoupper($data['currency']),
                        'value'         => number_format((float) $data['amount'], 2, '.', ''),
                    ],
                ]],
            ]);

        if ($orderRes->failed()) {
            \Illuminate\Support\Facades\Log::error('PayPal createOrder failed', [
                'status'  => $orderRes->status(),
                'body'    => $orderRes->json(),
                'amount'  => $data['amount'],
                'currency'=> $data['currency'],
            ]);
            $msg = $orderRes->json('details.0.description')
                ?? $orderRes->json('message')
                ?? 'Failed to create PayPal order';
            return ApiResponse::error($msg, 422);
        }

        return ApiResponse::success(['order_id' => $orderRes->json('id')]);
    }

    // =========================================================================
    // POST /api/admin/subscription/process
    // Processes payment for Stripe or Authorize.Net; captures PayPal orders
    // =========================================================================
    public function process(Request $request): JsonResponse
    {
        $data = $request->validate([
            'gateway'                => 'required|in:stripe,paypal,authorize_net',
            'amount'                 => 'required|numeric|min:0.01',
            'currency'               => 'required|string|size:3',
            // Stripe
            'payment_method_id'      => 'required_if:gateway,stripe|nullable|string',
            // PayPal
            'paypal_order_id'        => 'required_if:gateway,paypal|nullable|string',
            // Authorize.Net
            'opaque_data_descriptor' => 'required_if:gateway,authorize_net|nullable|string',
            'opaque_data_value'      => 'required_if:gateway,authorize_net|nullable|string',
        ]);

        try {
            $gw = $this->platformGateway($data['gateway']);
        } catch (\RuntimeException $e) {
            return ApiResponse::error($e->getMessage(), 422);
        }

        $config = $gw->config ?? [];

        try {
            $gatewayRef = $this->charger->charge($data['gateway'], $config, $data);
        } catch (\RuntimeException $e) {
            return ApiResponse::error($e->getMessage(), 422);
        }

        $admin = $this->admin();

        SubscriptionPayment::create([
            'admin_id'     => $admin->id,
            'package_id'   => $admin->package_id,
            'amount'       => $data['amount'],
            'currency'     => strtoupper($data['currency']),
            'gateway'      => $data['gateway'],
            'gateway_ref'  => $gatewayRef,
            'status'       => 'paid',
            'period_start' => now(),
            'period_end'   => now()->addMonth(),
        ]);

        $admin->update([
            'subscription_status'  => 'active',
            'subscription_ends_at' => now()->addMonth(),
        ]);

        return ApiResponse::success([
            'status'      => 'success',
            'gateway'     => $data['gateway'],
            'gateway_ref' => $gatewayRef,
        ], 'Payment successful. Subscription activated.');
    }
}
