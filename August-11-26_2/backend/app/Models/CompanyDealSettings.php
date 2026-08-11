<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

// Tenant-level configuration for the Lead-Won -> Deal eligibility -> Project
// creation workflow — one row per Company Admin account, mirroring
// CompanyPaymentGateway's tenant-scoping pattern.
class CompanyDealSettings extends Model
{
    protected $fillable = [
        'company_admin_id', 'project_creation_trigger', 'auto_create_project',
        'require_seller_confirmation', 'require_finance_verification',
        'allow_admin_override', 'allow_partial_payment_start',
        'default_advance_percentage', 'minimum_advance_percentage',
        'notify_seller_on_payment', 'notify_ops_on_project_created',
    ];

    protected $casts = [
        'auto_create_project'           => 'boolean',
        'require_seller_confirmation'   => 'boolean',
        'require_finance_verification'  => 'boolean',
        'allow_admin_override'          => 'boolean',
        'allow_partial_payment_start'   => 'boolean',
        'default_advance_percentage'    => 'decimal:2',
        'minimum_advance_percentage'    => 'decimal:2',
        'notify_seller_on_payment'      => 'boolean',
        'notify_ops_on_project_created' => 'boolean',
    ];

    public const TRIGGERS = [
        'full_payment'      => 'Full Invoice Payment',
        'deposit_received'  => 'Required Deposit Received',
        'kickoff_amount'    => 'Required Kickoff Amount Received',
        'manual_finance'    => 'Manual Finance Approval',
        'admin_approval'    => 'Admin Approval After Payment',
    ];

    public function companyAdmin(): BelongsTo
    {
        return $this->belongsTo(CompanyAdmin::class);
    }

    // The tenant's settings row, or the documented defaults if none has ever
    // been saved — every caller should go through this rather than querying
    // the table directly, so "no row yet" and "explicitly default" behave
    // identically.
    public static function forAdmin(int $companyAdminId): self
    {
        return static::firstOrNew(
            ['company_admin_id' => $companyAdminId],
            [
                'project_creation_trigger'      => 'kickoff_amount',
                'auto_create_project'           => false,
                'require_seller_confirmation'   => true,
                'require_finance_verification'  => true,
                'allow_admin_override'          => true,
                'allow_partial_payment_start'   => false,
                'notify_seller_on_payment'      => true,
                'notify_ops_on_project_created' => true,
            ]
        );
    }
}
