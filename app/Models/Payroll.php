<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class Payroll extends Model
{
    protected $table = 'payroll';

    protected $fillable = [
        'employee_id', 'month_year', 'basic_salary', 'allowances', 'deductions',
        'net_pay', 'status', 'processed_by', 'paid_at',
    ];

    protected $casts = [
        'basic_salary' => 'decimal:2',
        'allowances'   => 'decimal:2',
        'deductions'   => 'decimal:2',
        'net_pay'      => 'decimal:2',
        'paid_at'      => 'datetime',
    ];

    public function employee(): BelongsTo
    {
        return $this->belongsTo(Employee::class);
    }

    public function processedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'processed_by');
    }
}
