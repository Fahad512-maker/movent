<?php

namespace App\Http\Controllers\Api\Admin;

use App\Helpers\ApiResponse;
use App\Http\Controllers\Controller;
use App\Models\CompanyPaymentGateway;
use App\Models\Payment;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;

// Company profile, invoice defaults, bank details, and payment gateways are
// all tenant-level (this Company Admin account) — one shared configuration
// used by every company the admin owns, not set up separately per company.
// Individual companies (see Api\Admin\ClientController::updateCompany) still
// have their own `name` for internal management/listing purposes; this
// controller is specifically the invoicing/business identity shown to
// clients (invoice PDFs, emails, the public payment page).
class SettingsController extends Controller
{
    private function admin()
    {
        return auth('admin')->user();
    }

    // =========================================================================
    // GET /api/admin/settings
    // =========================================================================
    public function show(): JsonResponse
    {
        $admin = $this->admin();
        $companyName = $admin->business_name
            ?: $admin->companies()->orderByDesc('updated_at')->orderByDesc('id')->value('name')
            ?: $admin->name;

        // Flat list of gateway ACCOUNTS (a tenant can hold more than one of
        // the same gateway type, e.g. 2 Stripe accounts) rather than one
        // fixed slot per type. `gateway_types` still enumerates the 3
        // supported types (for the "Add account" type picker).
        $gateways = CompanyPaymentGateway::where('company_admin_id', $admin->id)
            ->orderBy('gateway')->orderByDesc('is_default')->orderBy('id')
            ->get()
            ->map(fn($row) => [
                'id'           => $row->id,
                'gateway_type' => $row->gateway,
                'label'        => $row->label ?: (CompanyPaymentGateway::GATEWAYS[$row->gateway] ?? $row->gateway),
                'mode'         => $row->config['mode'] ?? 'sandbox',
                'is_active'    => $row->is_active,
                'is_default'   => $row->is_default,
                'config'       => $this->maskConfig($row->gateway, $row->config ?? []),
            ])
            ->values();

        return ApiResponse::success([
            'company' => [
                'name'     => $companyName,
                'industry' => $admin->industry,
                'email'    => $admin->business_email,
                'phone'    => $admin->business_phone,
                'address'  => $admin->address,
                'timezone' => $admin->timezone,
                'currency' => $admin->currency,
                'logo_url' => $admin->logo_path
                    ? Storage::url($admin->logo_path)
                    : null,
            ],
            'invoice' => [
                'prefix'        => $admin->invoice_prefix        ?? 'INV',
                'tax_rate'      => (float) ($admin->invoice_tax_rate ?? 0),
                'payment_terms' => (int)   ($admin->invoice_payment_terms ?? 30),
                'notes'         => $admin->invoice_notes         ?? '',
            ],
            'bank' => [
                'bank_name'      => $admin->bank_name           ?? '',
                'account_name'   => $admin->bank_account_name   ?? '',
                'account_number' => $admin->bank_account_number ?? '',
                'iban'           => $admin->bank_iban            ?? '',
                'swift'          => $admin->bank_swift           ?? '',
            ],
            'gateways'      => $gateways,
            'gateway_types' => CompanyPaymentGateway::GATEWAYS,
        ]);
    }

    // Mask secret fields so they are not sent to frontend in plaintext
    private function maskConfig(string $gateway, array $config): array
    {
        $secretFields = [
            'paypal'        => ['client_secret'],
            'stripe'        => ['secret_key', 'webhook_secret'],
            'authorize_net' => ['transaction_key', 'signature_key'],
        ];
        $secrets = $secretFields[$gateway] ?? [];
        foreach ($secrets as $field) {
            if (!empty($config[$field])) {
                $config[$field] = '••••••••';
            }
        }
        return $config;
    }

    // =========================================================================
    // PUT /api/admin/settings/company
    // =========================================================================
    public function updateCompany(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'industry' => ['nullable', 'string', 'max:100'],
            'email'    => ['nullable', 'email', 'max:255'],
            'phone'    => ['nullable', 'string', 'max:30'],
            'address'  => ['nullable', 'string', 'max:500'],
            'timezone' => ['nullable', 'string', 'max:60'],
            'currency' => ['nullable', 'in:PKR,USD,EUR,GBP,AED,SAR'],
        ]);

        $admin = $this->admin();

        $admin->update([
            'industry'       => $validated['industry'] ?? null,
            'business_email' => $validated['email']    ?? null,
            'business_phone' => $validated['phone']    ?? null,
            'address'        => $validated['address']  ?? null,
            'timezone'       => $validated['timezone']  ?? 'Asia/Karachi',
            'currency'       => $validated['currency']  ?? 'USD',
        ]);

        return ApiResponse::success(null, 'Company profile updated');
    }

    // =========================================================================
    // PUT /api/admin/settings/invoice
    // =========================================================================
    public function updateInvoice(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'prefix'        => ['required', 'string', 'max:20', 'regex:/^[A-Z0-9\-]+$/'],
            'tax_rate'      => ['required', 'numeric', 'min:0', 'max:100'],
            'payment_terms' => ['required', 'integer', 'min:0', 'max:365'],
            'notes'         => ['nullable', 'string', 'max:1000'],
        ]);

        $this->admin()->update([
            'invoice_prefix'        => strtoupper($validated['prefix']),
            'invoice_tax_rate'      => $validated['tax_rate'],
            'invoice_payment_terms' => $validated['payment_terms'],
            'invoice_notes'         => $validated['notes'] ?? null,
        ]);

        return ApiResponse::success(null, 'Invoice settings updated');
    }

    // =========================================================================
    // PUT /api/admin/settings/bank
    // =========================================================================
    public function updateBank(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'bank_name'      => ['nullable', 'string', 'max:100'],
            'account_name'   => ['nullable', 'string', 'max:150'],
            'account_number' => ['nullable', 'string', 'max:50'],
            'iban'           => ['nullable', 'string', 'max:50'],
            'swift'          => ['nullable', 'string', 'max:20'],
        ]);

        $this->admin()->update([
            'bank_name'           => $validated['bank_name']      ?? null,
            'bank_account_name'   => $validated['account_name']   ?? null,
            'bank_account_number' => $validated['account_number'] ?? null,
            'bank_iban'           => $validated['iban']           ?? null,
            'bank_swift'          => $validated['swift']          ?? null,
        ]);

        return ApiResponse::success(null, 'Bank details updated');
    }

    // Ownership-checked lookup shared by every id-based gateway endpoint
    // below — a Company Admin may only ever touch their own tenant's rows.
    private function ownedGateway(int $id): ?CompanyPaymentGateway
    {
        return CompanyPaymentGateway::where('company_admin_id', $this->admin()->id)
            ->where('id', $id)
            ->first();
    }

    // Merge config — don't overwrite secrets if the frontend sent back the
    // masked placeholder instead of a real value.
    private function mergeConfig(array $oldConfig, array $newConfig): array
    {
        foreach ($newConfig as $k => $v) {
            if ($v === '••••••••') {
                $newConfig[$k] = $oldConfig[$k] ?? '';
            }
        }
        return $newConfig;
    }

    // =========================================================================
    // POST /api/admin/settings/gateways — add a new gateway ACCOUNT
    // =========================================================================
    public function storeGateway(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'gateway_type' => ['required', 'string', 'in:' . implode(',', array_keys(CompanyPaymentGateway::GATEWAYS))],
            'label'        => ['required', 'string', 'max:100'],
            'is_active'    => ['required', 'boolean'],
            'is_default'   => ['nullable', 'boolean'],
            'config'       => ['nullable', 'array'],
        ]);

        $adminId = $this->admin()->id;

        $row = CompanyPaymentGateway::create([
            'company_admin_id' => $adminId,
            'gateway'           => $validated['gateway_type'],
            'label'             => $validated['label'],
            'is_active'         => $validated['is_active'],
            'is_default'        => false,
            'config'            => $validated['config'] ?? [],
        ]);

        // The first account ever added for a gateway type becomes that
        // type's default automatically — there's nothing else for it to
        // compete with, and requiring a separate "Set as Default" click for
        // a brand-new type would leave every gateway-resolving read path
        // (invoice auto-select, public pay page, webhook fallback) with no
        // default until the admin remembers to do that manually.
        $isFirstOfType = CompanyPaymentGateway::where('company_admin_id', $adminId)
            ->where('gateway', $validated['gateway_type'])
            ->where('id', '!=', $row->id)
            ->doesntExist();

        if (!empty($validated['is_default']) || $isFirstOfType) {
            $this->makeDefault($row);
        }

        return ApiResponse::success(['id' => $row->id], $validated['label'] . ' added');
    }

    // =========================================================================
    // PUT /api/admin/settings/gateways/{id} — edit an existing account
    // =========================================================================
    public function updateGateway(Request $request, int $id): JsonResponse
    {
        $row = $this->ownedGateway($id);
        if (!$row) {
            return ApiResponse::error('Gateway account not found', 404);
        }

        $validated = $request->validate([
            'label'     => ['required', 'string', 'max:100'],
            'is_active' => ['required', 'boolean'],
            'config'    => ['nullable', 'array'],
        ]);

        $row->update([
            'label'     => $validated['label'],
            'is_active' => $validated['is_active'],
            'config'    => $this->mergeConfig($row->config ?? [], $validated['config'] ?? []),
        ]);

        return ApiResponse::success(null, $row->label . ' settings saved');
    }

    // =========================================================================
    // PATCH /api/admin/settings/gateways/{id}/toggle
    // =========================================================================
    public function toggleGateway(Request $request, int $id): JsonResponse
    {
        $row = $this->ownedGateway($id);
        if (!$row) {
            return ApiResponse::error('Gateway account not found', 404);
        }

        $validated = $request->validate(['is_active' => ['required', 'boolean']]);
        $row->update(['is_active' => $validated['is_active']]);

        return ApiResponse::success(null, $row->label . ($validated['is_active'] ? ' enabled' : ' disabled'));
    }

    // =========================================================================
    // PATCH /api/admin/settings/gateways/{id}/default — make this account the
    // default for its gateway type (unsets any sibling default of that type)
    // =========================================================================
    public function setDefaultGateway(int $id): JsonResponse
    {
        $row = $this->ownedGateway($id);
        if (!$row) {
            return ApiResponse::error('Gateway account not found', 404);
        }

        $this->makeDefault($row);

        return ApiResponse::success(null, $row->label . ' set as default');
    }

    private function makeDefault(CompanyPaymentGateway $row): void
    {
        CompanyPaymentGateway::where('company_admin_id', $row->company_admin_id)
            ->where('gateway', $row->gateway)
            ->where('id', '!=', $row->id)
            ->update(['is_default' => false]);

        $row->update(['is_default' => true]);
    }

    // =========================================================================
    // DELETE /api/admin/settings/gateways/{id}
    // =========================================================================
    public function destroyGateway(int $id): JsonResponse
    {
        $row = $this->ownedGateway($id);
        if (!$row) {
            return ApiResponse::error('Gateway account not found', 404);
        }

        $usedInPaidInvoice = Payment::where('company_gateway_id', $id)
            ->where('status', 'confirmed')
            ->exists();

        if ($usedInPaidInvoice) {
            $row->update(['is_active' => false]);
            return ApiResponse::error(
                'Cannot delete a gateway account used in paid invoices — it has been deactivated instead.',
                422
            );
        }

        $row->delete();

        return ApiResponse::success(null, 'Gateway account deleted');
    }

    // =========================================================================
    // POST /api/admin/settings/gateways/{id}/test
    // =========================================================================
    public function testGateway(int $id): JsonResponse
    {
        $row = $this->ownedGateway($id);
        if (!$row) {
            return ApiResponse::error('Gateway account not found', 404);
        }

        if (!$row->is_active) {
            return ApiResponse::error('Gateway is not enabled. Enable it and save credentials first.', 422);
        }

        $gateway = $row->gateway;
        $config  = $row->config ?? [];

        $required = [
            'stripe'        => ['publishable_key', 'secret_key'],
            'paypal'        => ['client_id', 'client_secret'],
            'authorize_net' => ['api_login_id', 'transaction_key'],
        ];

        foreach (($required[$gateway] ?? []) as $field) {
            if (empty($config[$field])) {
                return ApiResponse::error("Missing required field: {$field}. Save your credentials first.", 422);
            }
        }

        $result = $this->validateCredentialFormat($gateway, $config);
        if (!$result['success']) {
            return ApiResponse::error($result['message'], 422);
        }

        return ApiResponse::success(null, $result['message']);
    }

    private function validateCredentialFormat(string $gateway, array $config): array
    {
        $mode = $config['mode'] ?? 'sandbox';

        switch ($gateway) {
            case 'stripe':
                $pk = $config['publishable_key'] ?? '';
                $sk = $config['secret_key'] ?? '';
                if (!str_starts_with($pk, 'pk_')) {
                    return ['success' => false, 'message' => 'Invalid Publishable Key — must start with pk_test_ or pk_live_'];
                }
                if (!str_starts_with($sk, 'sk_')) {
                    return ['success' => false, 'message' => 'Invalid Secret Key — must start with sk_test_ or sk_live_'];
                }
                if ($mode === 'sandbox' && !str_starts_with($pk, 'pk_test_')) {
                    return ['success' => false, 'message' => 'Sandbox mode selected but key is not a test key (pk_test_...)'];
                }
                return ['success' => true, 'message' => 'Stripe credentials valid (' . $mode . ' mode)'];

            case 'paypal':
                if (strlen($config['client_id'] ?? '') < 10) {
                    return ['success' => false, 'message' => 'PayPal Client ID appears too short'];
                }
                return ['success' => true, 'message' => 'PayPal credentials valid (' . $mode . ' mode)'];

            case 'authorize_net':
                if (strlen($config['api_login_id'] ?? '') < 3) {
                    return ['success' => false, 'message' => 'API Login ID appears invalid'];
                }
                if (strlen($config['transaction_key'] ?? '') < 8) {
                    return ['success' => false, 'message' => 'Transaction Key appears invalid (expected 16 chars)'];
                }
                return ['success' => true, 'message' => 'Authorize.Net credentials valid (' . $mode . ' mode)'];
        }

        return ['success' => true, 'message' => 'Credentials look valid'];
    }

    // =========================================================================
    // POST /api/admin/settings/logo
    // =========================================================================
    public function uploadLogo(Request $request): JsonResponse
    {
        $request->validate([
            'logo' => ['required', 'image', 'mimes:jpg,jpeg,png,webp', 'max:2048'],
        ]);

        $admin = $this->admin();

        if ($admin->logo_path && Storage::exists($admin->logo_path)) {
            Storage::delete($admin->logo_path);
        }

        $path = $request->file('logo')->store(
            'company-admins/' . $admin->id . '/logo',
            'public'
        );

        $admin->update(['logo_path' => $path]);

        return ApiResponse::success(['logo_url' => Storage::url($path)], 'Logo uploaded');
    }

    // =========================================================================
    // GET /api/admin/settings/deal-workflow — Lead-Won -> Deal eligibility ->
    // Project creation configuration (tenant-level, same scoping as gateways).
    // =========================================================================
    public function dealWorkflowSettings(): JsonResponse
    {
        $settings = \App\Models\CompanyDealSettings::forAdmin($this->admin()->id);

        return ApiResponse::success([
            'project_creation_trigger' => $settings->project_creation_trigger,
            'allow_admin_override'     => (bool) $settings->allow_admin_override,
            'triggers'                 => \App\Models\CompanyDealSettings::TRIGGERS,
        ]);
    }

    // =========================================================================
    // PUT /api/admin/settings/deal-workflow
    // =========================================================================
    public function updateDealWorkflowSettings(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'project_creation_trigger' => ['required', 'string', 'in:' . implode(',', array_keys(\App\Models\CompanyDealSettings::TRIGGERS))],
            'allow_admin_override'     => ['required', 'boolean'],
        ]);

        \App\Models\CompanyDealSettings::updateOrCreate(
            ['company_admin_id' => $this->admin()->id],
            $validated
        );

        return ApiResponse::success(null, 'Deal workflow settings saved');
    }
}
