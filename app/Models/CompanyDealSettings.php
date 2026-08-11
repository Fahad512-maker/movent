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
        'company_admin_id', 'project_creation_trigger', 'allow_admin_override',
    ];

    protected $casts = [
        'allow_admin_override' => 'boolean',
    ];

    /**
     * The whole Deal Workflow: when does a client's payment create the project?
     * These two are mutually exclusive and are the only options — see
     * 2026_08_11_170000_simplify_company_deal_settings.php for what was removed
     * and why.
     */
    public const TRIGGERS = [
        'full_payment'    => 'After Full Payment — create the project once the invoice is paid in full',
        'partial_payment' => 'After Partial Payment — create the project as soon as any payment is received',
    ];

    /**
     * True when any payment, part or full, is enough to start the project.
     * Read by App\Services\PaymentProjectStartService (auto-creation) and by
     * Api\User\ProjectController::store() (the manual paid-invoice handoff), so
     * both answer the question the same way.
     */
    public function startsOnPartialPayment(): bool
    {
        return $this->project_creation_trigger === 'partial_payment';
    }

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
                // The safer of the two: nothing starts until the invoice is settled.
                'project_creation_trigger' => 'full_payment',
                'allow_admin_override'     => true,
            ]
        );
    }
}
