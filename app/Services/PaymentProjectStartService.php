<?php

namespace App\Services;

use App\Mail\ProjectStartRequiresFullPaymentMail;
use App\Models\Client;
use App\Models\Company;
use App\Models\CompanyDealSettings;
use App\Models\Invoice;
use App\Models\Lead;
use App\Models\Notification;
use App\Models\Project;
use App\Models\ProjectTeamMember;
use App\Models\User;
use App\Models\UserCompanyPermission;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Mail;

/**
 * Reacts to a client's invoice payment by starting the project — the "Deal
 * workflow" half of App\Services\InvoicePaymentService, kept separate so the
 * payment service stays about money and this stays about project kickoff.
 *
 * Driven entirely by the tenant's Deal Workflow setting, which offers exactly
 * two mutually exclusive options (CompanyDealSettings::TRIGGERS):
 *
 * AFTER PARTIAL PAYMENT (project_creation_trigger = 'partial_payment')
 *   Any payment — part or full — starts the project: a draft Project is created
 *   carrying only its name. Everything else is filled in by hand afterwards,
 *   and it stays a draft until Company Admin (or a sub-user holding
 *   canActivateProjects) activates it.
 *
 * AFTER FULL PAYMENT (project_creation_trigger = 'full_payment', the default)
 *   The same draft project, but only once the invoice is settled in full. A part
 *   payment starts nothing and instead emails the client that the project begins
 *   after the balance is cleared.
 */
class PaymentProjectStartService
{
    public static function handle(Invoice $invoice): void
    {
        try {
            $settings = self::settingsFor($invoice);
            if (!$settings) {
                return;
            }

            if ($settings->startsOnPartialPayment()) {
                self::createDraftProject($invoice);
                return;
            }

            // Full-payment mode: settled invoices start the project; a shortfall
            // gets the client a nudge instead.
            if ($invoice->status === 'paid') {
                self::createDraftProject($invoice);
            } elseif ($invoice->status === 'partially_paid') {
                self::emailClientFullPaymentRequired($invoice);
            }
        } catch (\Throwable $e) {
            // Never let project kickoff break the payment it rode in on — same
            // swallow-and-log posture as InvoicePaymentService::notifyStakeholders().
            Log::warning('[project-start] invoice ' . $invoice->id . ': ' . $e->getMessage());
        }
    }

    /**
     * Deal settings are keyed to the Company Admin who owns the company, the
     * same tenant scoping CompanyPaymentGateway uses.
     */
    private static function settingsFor(Invoice $invoice): ?CompanyDealSettings
    {
        $adminId = Company::find($invoice->company_id)?->admin_id;

        return $adminId ? CompanyDealSettings::forAdmin($adminId) : null;
    }

    private static function createDraftProject(Invoice $invoice): ?Project
    {
        // Idempotency: invoices.project_id is the "already started" flag, and it
        // is the same predicate notifyStakeholders() tests for its handoff nudge.
        // Every payment path can therefore call this freely — a second payment
        // on the same invoice will not raise a second project.
        if ($invoice->project_id) {
            return null;
        }

        $creator = self::activeUser($invoice->created_by, $invoice->company_id);

        $project = Project::create([
            'company_id' => $invoice->company_id,
            'client_id'  => $invoice->client_id,
            'lead_id'    => $invoice->lead_id,
            // projects.invoice_id = the invoice this project ORIGINATED from,
            // the opposite direction to invoices.project_id set just below.
            'invoice_id' => $invoice->id,
            'reference'  => self::nextProjectReference(),
            'name'       => self::projectName($invoice),
            'status'     => 'draft',
            'source'     => $invoice->status === 'paid'
                ? 'paid_invoice_auto_start'
                : 'partial_paid_invoice_auto_start',
            // Whichever guard raised the invoice, so "Created By" names the
            // real person instead of sitting blank.
            'created_by'          => $creator?->id,
            'created_by_admin_id' => $invoice->created_by_admin_id,
        ]);

        // Complete the back-link, exactly as the manual handoff does.
        $invoice->update(['project_id' => $project->id]);

        self::assignOwner($project, $invoice, $creator);

        // No project folders yet: this is still a name-only stub, and folders
        // are created when someone activates it — see
        // Api\*\ProjectController::activate().

        self::notifyDraftAwaitingActivation($project, $invoice);

        return $project;
    }

    /**
     * Who this auto-started project belongs to. Before this, an auto-created
     * project landed with created_by, seller_id and project_manager_id all
     * null — it belonged to nobody, showed "Unassigned", and never appeared
     * in the project list of the person whose deal it was.
     *
     * First choice is the invoice's own creator, which covers every sub-user
     * who can raise one — a Seller, a Project Manager, or a Manager holding
     * the invoicing permission.
     *
     * A Company Admin-raised invoice has no such user: Admin isn't a `users`
     * row, and project_manager_id/seller_id are `users` FKs, so the Admin
     * literally cannot be assigned. Rather than leave the project ownerless,
     * it falls to whoever the DEAL belongs to — the lead's current owner
     * (transferred_to, else assigned_to) or the client's account manager.
     * That is the person the Admin raised the invoice on behalf of. The same
     * fallback catches an invoice whose creator has since been deactivated;
     * assigning work to a disabled account would hide the project from
     * everyone.
     */
    private static function ownerFor(Invoice $invoice, ?User $creator): ?User
    {
        if ($creator) {
            return $creator;
        }

        $lead = $invoice->lead_id ? Lead::find($invoice->lead_id) : null;

        $candidates = [
            // A transferred lead's CURRENT owner is transferred_to; the
            // original assignee is only the fallback.
            $lead?->transferred_to,
            $lead?->assigned_to,
            $invoice->client_id ? Client::where('id', $invoice->client_id)->value('account_manager') : null,
        ];

        foreach ($candidates as $candidateId) {
            if ($owner = self::activeUser($candidateId, $invoice->company_id)) {
                return $owner;
            }
        }

        return null;
    }

    private static function activeUser(?int $userId, int $companyId): ?User
    {
        return $userId
            ? User::where('id', $userId)
                ->where('company_id', $companyId)
                ->where('is_active', true)
                ->first(['id', 'name', 'role_type'])
            : null;
    }

    /**
     * Hands the freshly created project to its owner.
     *
     * A Seller owner goes through ProjectSellerAssignmentService::assign() —
     * the same path Admin's "Assign Seller" action and the manual handoff
     * use — so seller_id, the project_seller_assignments history row, the
     * audit log, the project chat membership and the "Project assigned to
     * you" notification all happen exactly as they would for a hand-assigned
     * seller. NotificationService's own self-skip means the seller who raised
     * the invoice themselves isn't notified twice (they already get the
     * draft-awaiting-activation one); a seller who inherited an Admin-raised
     * invoice IS told, since nothing else would have told them.
     *
     * Any other owner (Project Manager, Manager) just takes project_manager_id,
     * exactly as Api\User\ProjectController::store() defaults the creator to
     * PM when they don't name someone else.
     *
     * Either way the owner also needs a ProjectTeamMember row, or
     * visibleProjects()'s team-membership leg never actually grants them
     * access to the project they own — the same reason store() writes that
     * row straight after creating a project.
     */
    private static function assignOwner(Project $project, Invoice $invoice, ?User $creator): void
    {
        $owner = self::ownerFor($invoice, $creator);

        if (!$owner) {
            return;
        }

        try {
            $sellerService = app(ProjectSellerAssignmentService::class);
            $seller = $owner->role_type === 'seller'
                ? $sellerService->assignableSeller($project->company_id, $owner->id)
                : null;

            if ($seller) {
                $sellerService->assign(
                    $project,
                    $seller,
                    "Auto-assigned from invoice {$invoice->invoice_number}",
                    $creator?->id,
                    $creator ? null : $invoice->created_by_admin_id,
                    $creator?->name ?? 'Company Admin'
                );
                $project->refresh();
            }

            // assign() already fills project_manager_id when it was empty;
            // this covers every other owner, and a Seller whose account no
            // longer passes assignableSeller() (display only either way —
            // isPM()/isInternalStaff() hard-exclude role_type='seller').
            if (!$project->project_manager_id) {
                $project->update(['project_manager_id' => $owner->id]);
            }

            ProjectTeamMember::updateOrCreate(
                ['project_id' => $project->id, 'user_id' => $project->project_manager_id],
                ['role_in_project' => 'project_manager', 'assigned_by' => $creator?->id]
            );
        } catch (\Throwable $e) {
            // Same swallow-and-log posture as handle() — a project that got
            // created must never be undone by a follow-up write failing.
            Log::warning('[project-start] project ' . $project->id . ' owner assign: ' . $e->getMessage());
        }
    }

    /**
     * Tell the people who need to act that the client has paid and a draft
     * project is now sitting there waiting to be activated.
     *
     * Distinct from InvoicePaymentService::notifyStakeholders(), which announces
     * the PAYMENT and links to the invoice: this announces the PROJECT and links
     * to it, so the recipient lands where the Activate button actually is.
     * Recipients are therefore whoever can act on it —
     *
     *   • the Seller who raised the invoice (invoice.created_by), so the person
     *     who closed the deal knows their client paid;
     *   • every sub-user holding canActivateProjects, i.e. exactly the people
     *     who can both SEE the draft (see visibleProjects()) and activate it;
     *   • every Company Admin, who is always structurally allowed to activate.
     *
     * Each write is individually guarded — one bad recipient must not cost the
     * others their notification, nor break the project creation that called this.
     */
    private static function notifyDraftAwaitingActivation(Project $project, Invoice $invoice): void
    {
        $activatorIds = UserCompanyPermission::where('company_id', $invoice->company_id)
            ->where('module_key', 'project_management')
            ->where('permission_key', 'canActivateProjects')
            ->pluck('user_id');

        $recipients = collect([$invoice->created_by])
            ->merge($activatorIds)
            ->filter()
            ->unique();

        $who     = $invoice->client?->name ?? $invoice->customer_name ?? 'The client';
        $paidAll = $invoice->status === 'paid';
        $title   = $paidAll ? 'Client paid in full — project ready to activate'
                            : 'Client made a payment — project ready to activate';
        $body    = "{$who} paid invoice {$invoice->invoice_number}. Draft project \"{$project->name}\" was created and is waiting to be activated.";

        foreach ($recipients as $uid) {
            try {
                Notification::create([
                    'user_id'    => $uid,
                    'company_id' => $invoice->company_id,
                    'type'       => 'project_draft_awaiting_activation',
                    'title'      => $title,
                    'body'       => $body,
                    'data'       => [
                        'project_id' => $project->id,
                        'invoice_id' => $invoice->id,
                        'link'       => "/projects/{$project->id}",
                    ],
                ]);
            } catch (\Throwable) {
            }
        }

        // Company Admin isn't a `users` row, so a plain Notification::create()
        // can't reach them — same reason notifyStakeholders() routes through
        // NotificationService for admins.
        try {
            NotificationService::notifyCompanyAdmins($invoice->company_id, null, [
                'module'      => 'project_management',
                'type'        => 'project_draft_awaiting_activation',
                'title'       => $title,
                'message'     => $body,
                'entity_type' => 'Project',
                'entity_id'   => $project->id,
                'url'         => "/admin/projects/{$project->id}",
            ]);
        } catch (\Throwable) {
        }
    }

    /**
     * Only the name is stored, so it has to be the most meaningful one
     * available. project_title is the title the seller typed on the invoice
     * itself ("New Project" mode); after that the deal's own proposed title,
     * then what the invoice said it was for, and finally a named fallback so a
     * project is never created blank.
     */
    private static function projectName(Invoice $invoice): string
    {
        $candidates = [
            $invoice->project_title,
            $invoice->lead?->proposed_project_title,
            $invoice->invoice_purpose,
        ];

        foreach ($candidates as $candidate) {
            if (is_string($candidate) && trim($candidate) !== '') {
                return trim($candidate);
            }
        }

        $who = $invoice->client?->name ?? $invoice->customer_name;

        return $who ? "Project — {$who}" : "Project — {$invoice->invoice_number}";
    }

    // Mirrors Api\User\ProjectController::nextProjectReference() — same
    // PRJ-{year}-{seq} series, so an auto-started project is indistinguishable
    // from a hand-created one in the reference sequence.
    //
    // withTrashed() on BOTH queries is essential, not defensive: Project is
    // soft-deleting, so a deleted project's row — and its reference — stays in
    // the table behind projects_reference_unique. Without it the uniqueness
    // probe reports "free" for a reference the index still holds, the loop exits
    // on the first candidate, and the INSERT dies on a duplicate key.
    private static function nextProjectReference(): string
    {
        $year = now()->year;
        $last = Project::withTrashed()
            ->whereYear('created_at', $year)
            ->where('reference', 'like', "PRJ-{$year}-%")
            ->latest('id')
            ->value('reference');

        $seq = $last ? ((int) substr($last, -4)) + 1 : 1;

        do {
            $reference = sprintf('PRJ-%d-%04d', $year, $seq++);
        } while (Project::withTrashed()->where('reference', $reference)->exists());

        return $reference;
    }

    private static function emailClientFullPaymentRequired(Invoice $invoice): void
    {
        $email = $invoice->client?->email ?? $invoice->customer_email;
        if (!$email) {
            return;
        }

        $company     = Company::find($invoice->company_id);
        $companyName = $company?->invoicingProfile()['name'] ?? config('app.name');

        Mail::to($email)->send(new ProjectStartRequiresFullPaymentMail($invoice, $companyName));
    }
}
