<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\SoftDeletes;

class Employee extends Model
{
    use SoftDeletes;

    protected $fillable = [
        'company_id', 'user_id', 'employee_code', 'name', 'email', 'phone',
        'department', 'designation', 'employment_type', 'salary', 'join_date', 'status',
    ];

    protected $casts = [
        'salary'    => 'decimal:2',
        'join_date' => 'date',
    ];

    public function company(): BelongsTo
    {
        return $this->belongsTo(Company::class);
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function attendances(): HasMany
    {
        return $this->hasMany(Attendance::class);
    }

    public function leaveRequests(): HasMany
    {
        return $this->hasMany(LeaveRequest::class);
    }

    public function payrolls(): HasMany
    {
        return $this->hasMany(Payroll::class);
    }

    public function notes(): HasMany
    {
        return $this->hasMany(EmployeeNote::class);
    }

    // Reuses the existing generic Document model (linked_to_type/linked_to_id
    // polymorphic columns) — no dedicated hr_documents table.
    public function documents(): HasMany
    {
        return $this->hasMany(Document::class, 'linked_to_id')->where('linked_to_type', 'Employee');
    }
}
