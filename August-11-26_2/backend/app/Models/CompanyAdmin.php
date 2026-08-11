<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Foundation\Auth\User as Authenticatable;
use Laravel\Sanctum\HasApiTokens;

class CompanyAdmin extends Authenticatable
{
    use HasApiTokens;
    protected $fillable = [
        'package_id', 'name', 'email', 'password', 'google_id', 'phone', 'avatar_path',
        'subscription_status', 'trial_ends_at', 'subscription_ends_at',
        'is_active', 'last_login_at', 'max_users_per_company', 'max_companies',
        'notifications_last_read_at', 'tasks_last_read_at', 'projects_last_read_at', 'read_audit_log_ids',
        // Tenant-wide business/invoicing identity (Settings' Company/Invoice/
        // Bank tabs) — distinct from name/email/phone above, which are this
        // admin's own login identity, and from companies.name, which still
        // identifies individual companies for internal management.
        'business_name', 'industry', 'business_email', 'business_phone', 'address',
        'timezone', 'currency', 'logo_path',
        'invoice_prefix', 'invoice_tax_rate', 'invoice_payment_terms', 'invoice_notes',
        'bank_name', 'bank_account_name', 'bank_account_number', 'bank_iban', 'bank_swift',
    ];

    protected $hidden = ['password', 'remember_token'];

    protected $casts = [
        'trial_ends_at'        => 'datetime',
        'subscription_ends_at' => 'datetime',
        'last_login_at'        => 'datetime',
        'notifications_last_read_at' => 'datetime',
        'tasks_last_read_at'   => 'datetime',
        'projects_last_read_at' => 'datetime',
        'read_audit_log_ids'   => 'array',
        'is_active'            => 'boolean',
        'password'             => 'hashed',
        'invoice_tax_rate'     => 'float',
        'invoice_payment_terms'=> 'integer',
    ];

    public function package(): BelongsTo
    {
        return $this->belongsTo(Package::class);
    }

    public function companies(): HasMany
    {
        return $this->hasMany(Company::class, 'admin_id');
    }

    public function subscriptionPayments(): HasMany
    {
        return $this->hasMany(SubscriptionPayment::class, 'admin_id');
    }

    // Tenant-level payment gateways — shared across every company under this
    // Company Admin account (see CompanyPaymentGateway::resolveActiveGateways()).
    public function paymentGateways(): HasMany
    {
        return $this->hasMany(CompanyPaymentGateway::class, 'company_admin_id');
    }
}
