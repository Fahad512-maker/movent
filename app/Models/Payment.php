<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class Payment extends Model
{
    protected $fillable = [
        'invoice_id', 'recorded_by', 'receipt_number', 'amount', 'currency', 'converted_amount',
        'converted_currency', 'exchange_rate', 'method', 'gateway', 'company_gateway_id',
        'gateway_ref', 'gateway_session_id', 'gateway_mode', 'status', 'payment_date', 'notes',
    ];

    protected $casts = [
        'amount'            => 'decimal:2',
        'converted_amount'  => 'decimal:2',
        'exchange_rate'     => 'decimal:8',
        'payment_date'      => 'date',
    ];

    public function invoice(): BelongsTo
    {
        return $this->belongsTo(Invoice::class);
    }

    public function recordedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'recorded_by');
    }

    public function companyGateway(): BelongsTo
    {
        return $this->belongsTo(CompanyPaymentGateway::class, 'company_gateway_id');
    }
}
