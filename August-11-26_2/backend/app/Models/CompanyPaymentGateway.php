<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class CompanyPaymentGateway extends Model
{
    protected $fillable = ['company_admin_id', 'company_id', 'gateway', 'label', 'is_active', 'is_default', 'config'];

    protected $casts = [
        'is_active'  => 'boolean',
        'is_default' => 'boolean',
        // Secrets at rest — transparently encrypted/decrypted with APP_KEY.
        'config'     => 'encrypted:array',
    ];

    public const GATEWAYS = [
        'paypal'        => 'PayPal',
        'stripe'        => 'Stripe',
        'authorize_net' => 'Authorize.net',
    ];

    // Tenant-level ownership (current model) — a gateway configured here
    // applies to every company under this Company Admin account.
    public function companyAdmin(): BelongsTo
    {
        return $this->belongsTo(CompanyAdmin::class);
    }

    // Legacy per-company ownership — kept only for rows written before the
    // tenant-level migration; new rows always leave this null. See
    // resolveActiveGateways() for the fallback read path.
    public function company(): BelongsTo
    {
        return $this->belongsTo(Company::class);
    }

    /**
     * The gateways a given company should offer for invoice payments: tenant
     * (Company Admin) level rows if any exist, else the old per-company rows
     * as a fallback for tenants not yet migrated to an explicit tenant-level
     * configuration. May contain multiple rows of the same gateway type
     * (multi-account) — callers that need exactly one per type should use
     * defaultAccountForType() or filter explicitly.
     */
    public static function resolveActiveGateways(Company $company)
    {
        $tenantRows = self::where('company_admin_id', $company->admin_id)
            ->where('is_active', true)
            ->get();

        if ($tenantRows->isNotEmpty()) {
            return $tenantRows;
        }

        return self::where('company_id', $company->id)
            ->where('is_active', true)
            ->get();
    }

    public function scopeActive($query)
    {
        return $query->where('is_active', true);
    }

    // The single account a tenant's gateway of this type resolves to when no
    // more specific account was chosen — used by the backward-compatible
    // webhook route and by the legacy per-invoice fallback (invoices with no
    // explicit gateway selection of their own).
    public static function defaultAccountForType(Company $company, string $gateway): ?self
    {
        $rows = self::resolveActiveGateways($company)->where('gateway', $gateway);

        return $rows->firstWhere('is_default', true) ?? $rows->first();
    }
}
