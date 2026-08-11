<?php

namespace App\Http\Controllers\Api\Admin;

use App\Helpers\ApiResponse;
use App\Http\Controllers\Controller;
use App\Models\Invoice;
use App\Models\Notification;
use App\Models\Payment;
use App\Services\DealEligibilityService;
use App\Services\InvoicePaymentService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class PaymentController extends Controller
{
    private function companyIds(): array
    {
        return auth('admin')->user()->companies()->pluck('id')->toArray();
    }

    // Recomputes the linked Deal's (Lead's) fulfillment_status after
    // anything that could move net_paid_amount — payment recorded/confirmed/
    // removed. If it just crossed INTO eligible_for_project, tells the
    // seller they can now create the project (spec §15); if it dropped back
    // below the requirement (e.g. a payment was removed), the seller is
    // told eligibility was lost. The actor here is always a Company Admin
    // (not a `users` row), never the seller themselves, so there's no
    // self-notification case to skip — unlike the User-guard mirror below.
    private function recomputeDealEligibility(?Invoice $invoice): void
    {
        if (!$invoice || !$invoice->lead_id) {
            return;
        }

        $lead   = $invoice->lead;
        if (!$lead) return;

        $before = $lead->fulfillment_status;
        $after  = DealEligibilityService::recomputeFulfillmentStatus($lead);

        if ($before === $after || !$lead->assigned_to) {
            return;
        }

        if ($after === 'eligible_for_project') {
            Notification::create([
                'user_id'    => $lead->assigned_to,
                'company_id' => $lead->company_id,
                'type'       => 'deal_eligible_for_project',
                'title'      => 'Deal eligible for project creation',
                'body'       => "The required payment for \"{$lead->proposed_project_title}\" has been received. You may now create the Project.",
                'data'       => ['lead_id' => $lead->id, 'link' => "/leads/{$lead->id}"],
            ]);
        } elseif ($before === 'eligible_for_project' && in_array($after, ['partially_paid', 'awaiting_payment'])) {
            Notification::create([
                'user_id'    => $lead->assigned_to,
                'company_id' => $lead->company_id,
                'type'       => 'deal_eligibility_lost',
                'title'      => 'Project eligibility changed',
                'body'       => "Payment eligibility for {$lead->deal_reference} has changed because a payment was refunded, reversed, or removed.",
                'data'       => ['lead_id' => $lead->id, 'link' => "/leads/{$lead->id}"],
            ]);
        } elseif ($after === 'partially_paid') {
            $net       = DealEligibilityService::netPaidAmount($lead);
            $required  = DealEligibilityService::requiredAmount($lead);
            $remaining = max(0, round($required - $net, 2));
            Notification::create([
                'user_id'    => $lead->assigned_to,
                'company_id' => $lead->company_id,
                'type'       => 'deal_partial_payment',
                'title'      => 'Partial payment received',
                'body'       => number_format($net, 2) . " received. " . number_format($remaining, 2) . " remains before project activation.",
                'data'       => ['lead_id' => $lead->id, 'link' => "/leads/{$lead->id}"],
            ]);
        }
    }

    // GET /admin/payments
    public function index(Request $request): JsonResponse
    {
        $companyIds = $this->companyIds();

        $query = Payment::whereHas('invoice', fn($q) => $q->whereIn('company_id', $companyIds))
            ->with(['invoice:id,invoice_number,client_id,currency', 'invoice.client:id,name'])
            ->orderByDesc('payment_date')
            ->orderByDesc('id');

        if ($request->filled('search')) {
            $s = $request->search;
            $query->whereHas('invoice', fn($iq) =>
                $iq->where('invoice_number', 'like', "%{$s}%")
                   ->orWhereHas('client', fn($cq) => $cq->where('name', 'like', "%{$s}%"))
            );
        }

        if ($request->filled('method') && $request->method !== 'all') {
            $query->where('method', $request->method);
        }

        if ($request->filled('from')) {
            $query->whereDate('payment_date', '>=', $request->from);
        }

        if ($request->filled('to')) {
            $query->whereDate('payment_date', '<=', $request->to);
        }

        $payments = $query->get();

        $summary = [
            'total'      => (float) $payments->sum('amount'),
            'count'      => $payments->count(),
            'by_method'  => $payments->groupBy('method')
                ->map(fn($g) => (float) $g->sum('amount'))
                ->toArray(),
        ];

        return ApiResponse::success([
            'payments' => $payments,
            'summary'  => $summary,
        ]);
    }

    // POST /admin/invoices/{invoice}/payments
    public function store(Request $request, Invoice $invoice): JsonResponse
    {
        if (!in_array($invoice->company_id, $this->companyIds())) {
            return ApiResponse::error('Not found', 404);
        }
        if (in_array($invoice->status, ['paid', 'cancelled'])) {
            return ApiResponse::error('Invoice is already ' . $invoice->status, 422);
        }

        $outstanding = (float) $invoice->total_amount - (float) $invoice->paid_amount;

        $data = $request->validate([
            'amount'       => "required|numeric|min:0.01|max:{$outstanding}",
            'method'       => 'nullable|in:bank_transfer,cash,card,cheque,gateway',
            'payment_date' => 'nullable|date',
            'notes'        => 'nullable|string|max:500',
            'gateway'      => 'nullable|string|max:50',
            'gateway_ref'  => 'nullable|string|max:255',
        ]);

        $receiptNumber = InvoicePaymentService::nextReceiptNumber($invoice->company_id);

        $payment = Payment::create([
            'invoice_id'     => $invoice->id,
            'receipt_number' => $receiptNumber,
            'amount'         => $data['amount'],
            'method'         => $data['method']       ?? null,
            'payment_date'   => $data['payment_date'] ?? now()->toDateString(),
            'notes'          => $data['notes']        ?? null,
            'gateway'        => $data['gateway']      ?? null,
            'gateway_ref'    => $data['gateway_ref']  ?? null,
            'status'         => 'confirmed',
        ]);

        // Was an inline copy of applyToInvoice()'s arithmetic, which meant this
        // path silently skipped both its rounding and (once added) the Deal
        // Workflow project-kickoff hook. Delegating keeps every payment path on
        // one implementation.
        InvoicePaymentService::applyToInvoice($invoice, $payment);

        InvoicePaymentService::logPayment($invoice, $payment, 'admin');
        $this->recomputeDealEligibility($invoice);

        return ApiResponse::success([
            'payment' => $payment,
            'invoice' => [
                'status'       => $invoice->status,
                'paid_amount'  => $invoice->paid_amount,
                'total_amount' => $invoice->total_amount,
            ],
        ], 'Payment recorded');
    }

    // PATCH /admin/payments/{payment}/confirm
    // Confirms a customer-submitted payment claim (public link/bank transfer/
    // gateway reference) — this is the point the invoice actually becomes
    // paid/partially_paid, a receipt is issued, and stakeholders are notified.
    public function confirm(Payment $payment): JsonResponse
    {
        $invoice = $payment->invoice;
        if (!in_array($invoice->company_id, $this->companyIds())) {
            return ApiResponse::error('Not found', 404);
        }
        if ($payment->status !== 'pending') {
            return ApiResponse::error('Only a pending payment can be confirmed', 422);
        }

        $payment->update([
            'status'         => 'confirmed',
            'receipt_number' => $payment->receipt_number ?? InvoicePaymentService::nextReceiptNumber($invoice->company_id),
        ]);

        InvoicePaymentService::applyToInvoice($invoice, $payment);
        InvoicePaymentService::logDecision($invoice, $payment, 'confirmed');
        InvoicePaymentService::notifyStakeholders($invoice, $payment, auth('admin')->user()->id);
        InvoicePaymentService::logClientActivity($invoice, $payment);
        InvoicePaymentService::logLeadActivity($invoice, $payment);
        $this->recomputeDealEligibility($invoice);

        return ApiResponse::success([
            'payment' => $payment->fresh(),
            'invoice' => [
                'status'       => $invoice->status,
                'paid_amount'  => $invoice->paid_amount,
                'total_amount' => $invoice->total_amount,
            ],
        ], 'Payment confirmed');
    }

    // PATCH /admin/payments/{payment}/reject
    // Rejects a customer-submitted payment claim — invoice status/paid_amount
    // is untouched (it was never applied for a pending claim in the first
    // place), the claim is just marked failed for the audit trail.
    public function reject(Request $request, Payment $payment): JsonResponse
    {
        $invoice = $payment->invoice;
        if (!in_array($invoice->company_id, $this->companyIds())) {
            return ApiResponse::error('Not found', 404);
        }
        if ($payment->status !== 'pending') {
            return ApiResponse::error('Only a pending payment can be rejected', 422);
        }

        $data = $request->validate(['reason' => 'nullable|string|max:500']);

        $payment->update([
            'status' => 'failed',
            'notes'  => trim(($payment->notes ? $payment->notes . ' — ' : '') . ($data['reason'] ?? 'Rejected by admin')),
        ]);

        InvoicePaymentService::logDecision($invoice, $payment, 'rejected');
        InvoicePaymentService::notifyPaymentFailed($invoice, $payment, $data['reason'] ?? null, auth('admin')->user()->id);

        return ApiResponse::success(['payment' => $payment->fresh()], 'Payment rejected');
    }

    // DELETE /admin/payments/{payment}
    public function destroy(Payment $payment): JsonResponse
    {
        $invoice = $payment->invoice;
        if (!in_array($invoice->company_id, $this->companyIds())) {
            return ApiResponse::error('Not found', 404);
        }

        $payment->delete();

        // Only confirmed payments count toward paid_amount — pending/failed
        // claims never affected it in the first place (see confirm()/reject()).
        $newPaid = (float) $invoice->payments()->where('status', 'confirmed')->sum('amount');
        $invoice->paid_amount = $newPaid;

        if ($newPaid <= 0) {
            $invoice->status = $invoice->sent_at ? 'sent' : 'draft';
        } elseif ($newPaid < (float) $invoice->total_amount) {
            $invoice->status = 'partially_paid';
        } else {
            $invoice->status = 'paid';
        }
        $invoice->save();

        $this->recomputeDealEligibility($invoice);

        return ApiResponse::success(null, 'Payment removed');
    }
}
