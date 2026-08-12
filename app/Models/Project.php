<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\SoftDeletes;

class Project extends Model
{
    use SoftDeletes;

    protected $fillable = [
        'reference',
        'company_id', 'client_id', 'lead_id', 'invoice_id', 'project_manager_id', 'created_by', 'created_by_admin_id',
        // seller_id/source: set when a Seller creates this as a sales handoff
        // (see Api\User\ProjectController::store()) — seller_id is who
        // initiated it, independent of whoever ends up as project_manager_id.
        'seller_id', 'source',
        'seller_assigned_by', 'seller_assigned_by_admin_id', 'seller_assigned_at',
        'name', 'description', 'status', 'priority', 'budget', 'start_date',
        'deadline', 'storage_folder', 'completed_at',
        'completed_by', 'completed_by_admin_id',
        'closed_at', 'closed_by', 'closed_by_admin_id', 'close_reason',
        'reopened_at', 'reopened_by', 'reopened_by_admin_id', 'reopen_reason',
    ];

    protected $casts = [
        'budget'       => 'decimal:2',
        'start_date'   => 'date',
        'deadline'     => 'date',
        'completed_at' => 'datetime',
        'closed_at'    => 'datetime',
        'reopened_at'  => 'datetime',
        'seller_assigned_at' => 'datetime',
    ];

    // A 'draft' project is the name-only stub auto-created when a client's
    // invoice payment starts one (App\Services\PaymentProjectStartService). It
    // isn't work yet — nobody has filled it in or activated it — so the Client
    // Portal must never surface one. Keeping the rule here means every
    // Api\Client\* query states the same thing the same way.
    public function scopeNotDraft($query)
    {
        return $query->where('status', '!=', 'draft');
    }

    // A draft isn't work yet, so nothing that PRODUCES work may happen on it:
    // no tasks, timesheets, files, deliverables, comments or chat messages
    // (see the isDraft() guards across Api\User\* and Api\Admin\*). Setting
    // the project UP is still allowed — editing it, naming a PM, assigning a
    // team or seller, linking invoices — since that is exactly what someone
    // does before pressing Activate. Everything blocked here opens up the
    // moment the project becomes active; no separate switch to flip.
    public function isDraft(): bool
    {
        return $this->status === 'draft';
    }

    // One wording for every guard, so a draft explains itself the same way
    // wherever the user runs into it.
    public const DRAFT_BLOCKED_MESSAGE = 'This project is still a draft. Activate it first — tasks, timesheets, files, comments and chat all open up once it is active.';

    public function company(): BelongsTo
    {
        return $this->belongsTo(Company::class);
    }

    public function client(): BelongsTo
    {
        return $this->belongsTo(Client::class);
    }

    public function lead(): BelongsTo
    {
        return $this->belongsTo(Lead::class);
    }

    public function invoice(): BelongsTo
    {
        return $this->belongsTo(Invoice::class);
    }

    // Every invoice billed under this project (deposit/milestone/final/change
    // request), keyed off invoices.project_id — distinct from invoice()
    // above, which is only the single invoice this project originated from.
    public function invoices(): HasMany
    {
        return $this->hasMany(Invoice::class, 'project_id');
    }

    public function projectManager(): BelongsTo
    {
        return $this->belongsTo(User::class, 'project_manager_id');
    }

    public function createdBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }

    public function seller(): BelongsTo
    {
        return $this->belongsTo(User::class, 'seller_id');
    }

    public function sellerAssignedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'seller_assigned_by');
    }

    public function sellerAssignedByAdmin(): BelongsTo
    {
        return $this->belongsTo(CompanyAdmin::class, 'seller_assigned_by_admin_id');
    }

    public function sellerAssignments(): HasMany
    {
        return $this->hasMany(ProjectSellerAssignment::class)->orderByDesc('created_at');
    }

    public function createdByAdmin(): BelongsTo
    {
        return $this->belongsTo(CompanyAdmin::class, 'created_by_admin_id');
    }

    public function completedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'completed_by');
    }

    public function completedByAdmin(): BelongsTo
    {
        return $this->belongsTo(CompanyAdmin::class, 'completed_by_admin_id');
    }

    public function closedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'closed_by');
    }

    public function closedByAdmin(): BelongsTo
    {
        return $this->belongsTo(CompanyAdmin::class, 'closed_by_admin_id');
    }

    public function reopenedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'reopened_by');
    }

    public function reopenedByAdmin(): BelongsTo
    {
        return $this->belongsTo(CompanyAdmin::class, 'reopened_by_admin_id');
    }

    public function tasks(): HasMany
    {
        return $this->hasMany(Task::class);
    }

    public function teamMembers(): HasMany
    {
        return $this->hasMany(ProjectTeamMember::class);
    }

    public function deliverables(): HasMany
    {
        return $this->hasMany(Deliverable::class);
    }

    public function folders(): HasMany
    {
        return $this->hasMany(ProjectFolder::class);
    }

    public function documents(): HasMany
    {
        return $this->hasMany(Document::class, 'linked_to_id');
    }

    public function compliancePolicies(): HasMany
    {
        return $this->hasMany(CompliancePolicy::class);
    }

    public function riskAssessments(): HasMany
    {
        return $this->hasMany(RiskAssessment::class);
    }

    public function complianceItems(): HasMany
    {
        return $this->hasMany(ComplianceItem::class);
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

    public function activities(): HasMany
    {
        return $this->hasMany(ProjectActivity::class)->orderByDesc('created_at');
    }

    // Mirrors Task::logActivity() — causer_name is a plain string so it works
    // uniformly whether the actor is a sub-user or a Company Admin (neither
    // of which needs a real users.id FK to be identified in this log).
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
