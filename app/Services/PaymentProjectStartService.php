<?php

namespace App\Services;

use App\Mail\ProjectStartRequiresFullPaymentMail;
use App\Models\Company;
use App\Models\CompanyDealSettings;
use App\Models\Invoice;
use App\Models\Project;
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

        // A pure guest / external invoice has no counterparty to own the work.
        if (!$invoice->client_id && !$invoice->lead_id) {
            return null;
        }

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
        ]);

        // Complete the back-link, exactly as the manual handoff does.
        $invoice->update(['project_id' => $project->id]);

        // No project folders and no team members yet: this is a name-only stub.
        // Both get created when someone activates it and fills in the details —
        // see Api\*\ProjectController::activate().

        return $project;
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
