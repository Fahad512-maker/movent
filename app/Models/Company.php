<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Company extends Model
{
    protected $fillable = [
        'admin_id', 'name', 'industry', 'email', 'phone', 'address',
        'timezone', 'currency', 'logo_path', 'storage_folder', 'is_active',
        'invoice_prefix', 'invoice_tax_rate', 'invoice_payment_terms', 'invoice_notes',
        'bank_name', 'bank_account_name', 'bank_account_number', 'bank_iban', 'bank_swift',
    ];

    protected $casts = [
        'is_active'            => 'boolean',
        'invoice_tax_rate'     => 'float',
        'invoice_payment_terms'=> 'integer',
    ];

    public function admin(): BelongsTo
    {
        return $this->belongsTo(CompanyAdmin::class, 'admin_id');
    }

    /**
     * The business identity/invoice defaults/bank details shown to clients
     * (invoice PDFs, emails, the public payment page) — tenant-level
     * (Settings' Company/Invoice/Bank tabs), same across every company this
     * admin owns. Falls back to this company's own columns for any field the
     * admin hasn't set yet (e.g. a brand-new admin who hasn't opened Settings),
     * so nothing shows up blank.
     */
    public function invoicingProfile(): array
    {
        $admin = $this->admin;

        return [
            'name'                  => $admin?->business_name         ?: $this->name,
            'logo_path'             => $admin?->logo_path              ?: $this->logo_path,
            // The currency Company Admin configures in Settings (tenant-wide,
            // company_admins.currency) is authoritative for every invoice this
            // admin issues, regardless of which of their companies it's under
            // — this company's own (legacy, pre-tenant-refactor) `currency`
            // column is only ever a fallback for an admin who hasn't opened
            // Settings yet.
            'currency'              => $admin?->currency               ?: ($this->currency ?? 'USD'),
            'invoice_prefix'        => $admin?->invoice_prefix         ?: ($this->invoice_prefix ?? 'INV'),
            'invoice_tax_rate'      => $admin?->invoice_tax_rate       ?? ($this->invoice_tax_rate ?? 0),
            'invoice_payment_terms' => $admin?->invoice_payment_terms  ?? ($this->invoice_payment_terms ?? 30),
            'invoice_notes'         => $admin?->invoice_notes          ?: $this->invoice_notes,
            'bank_name'             => $admin?->bank_name              ?: $this->bank_name,
            'bank_account_name'     => $admin?->bank_account_name      ?: $this->bank_account_name,
            'bank_account_number'   => $admin?->bank_account_number    ?: $this->bank_account_number,
            'bank_iban'             => $admin?->bank_iban              ?: $this->bank_iban,
            'bank_swift'            => $admin?->bank_swift             ?: $this->bank_swift,
        ];
    }

    public function users(): HasMany
    {
        return $this->hasMany(User::class);
    }

    public function modules(): HasMany
    {
        return $this->hasMany(CompanyModule::class);
    }

    public function leads(): HasMany
    {
        return $this->hasMany(Lead::class);
    }

    public function clients(): HasMany
    {
        return $this->hasMany(Client::class);
    }

    public function invoices(): HasMany
    {
        return $this->hasMany(Invoice::class);
    }

    public function projects(): HasMany
    {
        return $this->hasMany(Project::class);
    }

    public function employees(): HasMany
    {
        return $this->hasMany(Employee::class);
    }

    public function documents(): HasMany
    {
        return $this->hasMany(Document::class);
    }

    public function chatThreads(): HasMany
    {
        return $this->hasMany(ChatThread::class);
    }

    public function notifications(): HasMany
    {
        return $this->hasMany(Notification::class);
    }

    public function compliancePolicies(): HasMany
    {
        return $this->hasMany(CompliancePolicy::class);
    }

    public function riskAssessments(): HasMany
    {
        return $this->hasMany(RiskAssessment::class);
    }

    public function complianceIncidents(): HasMany
    {
        return $this->hasMany(ComplianceIncident::class);
    }

    public function complianceViolations(): HasMany
    {
        return $this->hasMany(ComplianceViolation::class);
    }

    public function auditTrails(): HasMany
    {
        return $this->hasMany(AuditTrail::class);
    }

    public function systemAuditLogs(): HasMany
    {
        return $this->hasMany(SystemAuditLog::class);
    }

    public function supportTickets(): HasMany
    {
        return $this->hasMany(SupportTicket::class);
    }

    public function recruitments(): HasMany
    {
        return $this->hasMany(Recruitment::class);
    }
}
