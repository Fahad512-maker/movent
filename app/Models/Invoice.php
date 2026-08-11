<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Support\Str;

class Invoice extends Model
{
    protected $fillable = [
        'company_id', 'client_id', 'lead_id', 'project_id', 'project_title', 'project_reference', 'created_by', 'sent_by', 'invoice_number', 'subtotal',
        'tax_rate', 'tax_amount', 'discount_amount', 'total_amount', 'paid_amount',
        'currency', 'status', 'due_date', 'notes', 'sent_at',
        'payment_token', 'token_expires_at',
        'customer_name', 'customer_email', 'customer_phone', 'customer_address',
        // Deal-facing fields — what this invoice is FOR, in terms a client
        // understands, even before a Project exists (see spec §5).
        'invoice_purpose', 'payment_type', 'required_payment_amount', 'counts_toward_project_activation',
    ];

    protected $casts = [
        'subtotal'          => 'decimal:2',
        'tax_rate'          => 'decimal:2',
        'tax_amount'        => 'decimal:2',
        'discount_amount'   => 'decimal:2',
        'total_amount'      => 'decimal:2',
        'paid_amount'       => 'decimal:2',
        'due_date'          => 'date',
        'sent_at'           => 'datetime',
        'token_expires_at'  => 'datetime',
        'required_payment_amount'          => 'decimal:2',
        'counts_toward_project_activation' => 'boolean',
    ];

    public function generatePublicToken(?int $expiryDays = null): string
    {
        $token = Str::random(48);

        $this->update([
            'payment_token'    => $token,
            'token_expires_at' => $expiryDays ? now()->addDays($expiryDays) : null,
        ]);

        return $token;
    }

    public function revokePublicToken(): void
    {
        $this->update(['payment_token' => null, 'token_expires_at' => null]);
    }

    public function isTokenValid(): bool
    {
        if (!$this->payment_token) return false;
        if ($this->token_expires_at && $this->token_expires_at->isPast()) return false;
        return true;
    }

    public function company(): BelongsTo
    {
        return $this->belongsTo(Company::class);
    }

    public function client(): BelongsTo
    {
        return $this->belongsTo(Client::class);
    }

    public function createdBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }

    public function sentBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'sent_by');
    }

    public function lead(): BelongsTo
    {
        return $this->belongsTo(Lead::class);
    }

    // Which project this invoice is billed under — opposite direction from
    // Project::invoice() (the project's originating invoice). A project can
    // have many invoices via this column; an invoice belongs to at most one.
    public function project(): BelongsTo
    {
        return $this->belongsTo(Project::class);
    }

    public function items(): HasMany
    {
        return $this->hasMany(InvoiceItem::class);
    }

    public function payments(): HasMany
    {
        return $this->hasMany(Payment::class);
    }

    public function reminders(): HasMany
    {
        return $this->hasMany(InvoiceReminder::class);
    }

    public function projects(): HasMany
    {
        return $this->hasMany(Project::class);
    }

    // The specific gateway account(s) this invoice is restricted to. Empty
    // means no explicit selection was ever made — every read path treats
    // that as "fall back to the tenant's per-type defaults" (today's
    // behavior), so invoices created before this feature keep working.
    public function paymentGatewayAccounts(): BelongsToMany
    {
        return $this->belongsToMany(
            CompanyPaymentGateway::class,
            'invoice_payment_gateways',
            'invoice_id',
            'company_gateway_id'
        );
    }
}
