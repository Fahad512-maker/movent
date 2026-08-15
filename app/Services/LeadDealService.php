<?php

namespace App\Services;

use App\Models\Invoice;
use App\Models\Lead;
use App\Models\Notification;
use Illuminate\Database\QueryException;

/**
 * Auto-closes a Lead's pipeline the moment its invoice is paid in full — the
 * "invoice paid -> lead Won" counterpart to marking a lead Won by hand via
 * Api\*\LeadController::updateStatus() (which stays the only path for typed-in
 * deal fields like required_kickoff_amount/service_category). A no-op for a
 * Lead that's already Won or Lost — an invoice settling after the deal fell
 * through, or after Won was already recorded another way, must not re-fire.
 */
class LeadDealService
{
    public static function markWonFromPayment(Lead $lead, Invoice $invoice): void
    {
        if ($invoice->status !== 'paid') {
            return;
        }
        if (in_array($lead->status, ['won', 'lost'], true)) {
            return;
        }

        $old = $lead->status;

        $data = [
            'status'                 => 'won',
            'won_at'                 => now(),
            'converted_at'           => $lead->converted_at ?? now(),
            'proposed_project_title' => $lead->proposed_project_title ?: "{$lead->name} — Project",
        ];

        // Same not-atomic-read-then-pick-next-free retry as the manual
        // mark-won path in Api\*\LeadController::updateStatus() — two
        // invoices settling in the same instant must not collide on one
        // deal_reference and lose the whole update.
        $attempts = 0;
        while (true) {
            $data['deal_reference'] = self::nextDealReference();
            try {
                $lead->update($data);
                break;
            } catch (QueryException $e) {
                $isDealRefCollision = (int) $e->getCode() === 23000
                    && str_contains($e->getMessage(), 'leads_deal_reference_unique');
                if (!$isDealRefCollision || ++$attempts >= 5) {
                    throw $e;
                }
            }
        }

        // Reflects the invoice/payment state that triggered this, rather than
        // hardcoding 'awaiting_invoice' as the manual mark-won path does for a
        // Deal that has no invoice yet — this one always already has one.
        DealEligibilityService::recomputeFulfillmentStatus($lead);

        $lead->logActivity('deal_created', "Deal {$lead->deal_reference} created — {$lead->proposed_project_title}",
            'System', ['deal_reference' => $lead->deal_reference]);
        $lead->logActivity('won', "Status changed from {$old} to won — invoice {$invoice->invoice_number} paid in full",
            'System', ['from' => $old, 'to' => 'won']);

        if ($lead->assigned_to) {
            Notification::create([
                'user_id'    => $lead->assigned_to,
                'company_id' => $lead->company_id,
                'type'       => 'lead_won',
                'title'      => 'Lead won!',
                'body'       => "Lead \"{$lead->name}\" was automatically marked Won — invoice {$invoice->invoice_number} was paid in full.",
                'data'       => ['lead_id' => $lead->id, 'link' => "/leads/{$lead->id}"],
            ]);
        }
    }

    // Mirrors Api\*\LeadController::nextDealReference() exactly — same
    // DEAL-{year}-{seq} series, same table, so uniqueness holds regardless of
    // which path generated it.
    private static function nextDealReference(): string
    {
        $year = now()->year;
        $maxSeq = Lead::withTrashed()
            ->where('deal_reference', 'like', "DEAL-{$year}-%")
            ->pluck('deal_reference')
            ->map(fn ($reference) => (int) substr($reference, -4))
            ->max();

        $seq = $maxSeq ? $maxSeq + 1 : 1;

        do {
            $reference = sprintf('DEAL-%d-%04d', $year, $seq++);
        } while (Lead::withTrashed()->where('deal_reference', $reference)->exists());

        return $reference;
    }
}
