<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

// One row per time a project's final package was delivered to the client —
// see the migration comment for how this differs from the per-task
// `Deliverable` model.
class ProjectDeliverySubmission extends Model
{
    protected $fillable = [
        'project_id', 'file_path', 'file_name', 'file_type', 'file_size',
        'delivered_by_admin_id', 'delivered_at',
    ];

    protected $casts = [
        'delivered_at' => 'datetime',
    ];

    public function project(): BelongsTo
    {
        return $this->belongsTo(Project::class);
    }

    public function deliveredByAdmin(): BelongsTo
    {
        return $this->belongsTo(CompanyAdmin::class, 'delivered_by_admin_id');
    }
}
