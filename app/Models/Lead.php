<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\HasOne;
use Illuminate\Database\Eloquent\SoftDeletes;

class Lead extends Model
{
    use SoftDeletes;

    protected $fillable = [
        'company_id', 'assigned_to', 'name', 'email', 'phone', 'company_name',
        'source', 'status', 'priority', 'estimated_value', 'notes',
        'next_followup_date', 'next_followup_time', 'lost_reason',
        'transferred_to', 'transferred_at', 'converted_at', 'created_by',
        // Deal fields — a Won lead doubles as a lightweight "Deal" (see
        // App\Services\DealEligibilityService); no separate deals table.
        'deal_reference', 'proposed_project_title', 'service_category',
        'scope_summary', 'detailed_scope', 'quotation_reference',
        'required_kickoff_amount', 'required_kickoff_percentage',
        'expected_start_date', 'expected_end_date', 'fulfillment_status', 'won_at',
    ];

    protected $casts = [
        'estimated_value'   => 'decimal:2',
        'transferred_at'    => 'datetime',
        'converted_at'      => 'datetime',
        'next_followup_date' => 'date',
        'required_kickoff_amount'     => 'decimal:2',
        'required_kickoff_percentage' => 'decimal:2',
        'expected_start_date'         => 'date',
        'expected_end_date'           => 'date',
        'won_at'                      => 'datetime',
    ];

    public function company(): BelongsTo
    {
        return $this->belongsTo(Company::class);
    }

    public function assignedTo(): BelongsTo
    {
        return $this->belongsTo(User::class, 'assigned_to');
    }

    public function transferredTo(): BelongsTo
    {
        return $this->belongsTo(User::class, 'transferred_to');
    }

    public function createdBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }

    public function client(): HasOne
    {
        return $this->hasOne(Client::class, 'lead_id');
    }

    public function followUps(): HasMany
    {
        return $this->hasMany(FollowUp::class);
    }

    public function activities(): HasMany
    {
        return $this->hasMany(LeadActivity::class)->orderByDesc('created_at');
    }

    public function transfers(): HasMany
    {
        return $this->hasMany(LeadTransfer::class)->orderByDesc('created_at');
    }

    // Every invoice raised against this Deal (see invoices.lead_id) — used
    // by DealEligibilityService to sum verified payments toward the
    // kickoff-amount requirement.
    public function invoices(): HasMany
    {
        return $this->hasMany(Invoice::class);
    }

    // The Project(s) handed off from this Deal (see projects.lead_id).
    public function projects(): HasMany
    {
        return $this->hasMany(Project::class);
    }

    public function logActivity(string $type, string $description, ?string $causerName = null, array $meta = []): void
    {
        $this->activities()->create([
            'company_id'  => $this->company_id,
            'causer_name' => $causerName,
            'type'        => $type,
            'description' => $description,
            'meta'        => $meta ?: null,
        ]);
    }
}
