<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\HasOne;
use Illuminate\Database\Eloquent\SoftDeletes;
use Illuminate\Foundation\Auth\User as Authenticatable;
use Laravel\Sanctum\HasApiTokens;

class User extends Authenticatable
{
    use HasApiTokens, SoftDeletes;

    protected $fillable = [
        'company_id', 'name', 'email', 'password', 'google_id', 'role_type', 'custom_role_label', 'phone',
        'avatar_path', 'is_active', 'status', 'socket_id', 'is_online', 'created_by',
        'invite_token', 'invite_expires_at', 'must_change_password', 'last_login_at',
    ];

    protected $hidden = ['password', 'remember_token'];

    protected $casts = [
        'is_active'            => 'boolean',
        'is_online'            => 'boolean',
        'must_change_password' => 'boolean',
        'last_login_at'        => 'datetime',
        'invite_expires_at'    => 'datetime',
        'password'             => 'hashed',
    ];

    public function company(): BelongsTo
    {
        return $this->belongsTo(Company::class);
    }

    public function createdBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }

    public function permissions(): HasMany
    {
        return $this->hasMany(UserPermission::class);
    }

    public function companyAssignments(): HasMany
    {
        return $this->hasMany(CompanyUserAssignment::class);
    }

    // Company-membership check that also covers a multi-company user — true
    // for either the legacy primary company_id column OR an ACTIVE
    // company_user_assignments row for $companyId. A user assigned to more
    // than one company keeps this same company_id column pointed at just
    // one of them (whichever was picked as "default" when they were added),
    // so any "who belongs to company X" query that checks that column alone
    // silently drops them from every OTHER company they're actually active
    // in. Mirrors the pattern already used by
    // ProjectSellerAssignmentService::assignableSeller() and
    // Api\Admin\ProjectController::projectUsers()'s Seller block.
    public function scopeOfCompany($query, int $companyId)
    {
        return $query->where(function ($q) use ($companyId) {
            $q->where('company_id', $companyId)
                ->orWhereHas('companyAssignments', fn ($a) => $a
                    ->where('company_id', $companyId)
                    ->where('status', 'active'));
        });
    }

    public function userCompanyPermissions(): HasMany
    {
        return $this->hasMany(UserCompanyPermission::class);
    }

    public function assignedLeads(): HasMany
    {
        return $this->hasMany(Lead::class, 'assigned_to');
    }

    public function assignedTasks(): HasMany
    {
        return $this->hasMany(Task::class, 'assigned_to');
    }

    public function timesheets(): HasMany
    {
        return $this->hasMany(Timesheet::class);
    }

    public function notifications(): HasMany
    {
        return $this->hasMany(Notification::class);
    }

    public function sentMessages(): HasMany
    {
        return $this->hasMany(ChatMessage::class, 'sender_id');
    }

    public function chatParticipants(): HasMany
    {
        return $this->hasMany(ChatParticipant::class);
    }

    public function employee(): HasOne
    {
        return $this->hasOne(Employee::class);
    }
}
