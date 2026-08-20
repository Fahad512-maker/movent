<?php

namespace App\Http\Controllers\Api\Admin;

use App\Helpers\ApiResponse;
use App\Http\Controllers\Controller;
use App\Http\Controllers\Api\Admin\Concerns\ScopesToActiveCompany;
use App\Mail\InvoiceMail;
use App\Models\Client;
use App\Models\Company;
use App\Models\CompanyPaymentGateway;
use App\Models\Invoice;
use App\Models\InvoiceItem;
use App\Models\Lead;
use App\Models\Project;
use App\Rules\ValidPhoneNumber;
use App\Services\InvoiceNotificationService;
use App\Services\PaymentProjectStartService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Mail;

class InvoiceController extends Controller
{
    use ScopesToActiveCompany;

    private function admin() { return auth('admin')->user(); }

    private function companyIds(): array
    {
        return $this->admin()->companies()->pluck('id')->toArray();
    }

    private function nextNumber(int $companyId): string
    {
        $year   = now()->year;
        $prefix = \App\Models\Company::find($companyId)?->invoicingProfile()['invoice_prefix'] ?? 'INV';

        // Find the highest sequence used globally this year for this prefix
        $last = Invoice::whereYear('created_at', $year)
            ->where('invoice_number', 'like', "{$prefix}-{$year}-%")
            ->latest('id')
            ->value('invoice_number');

        $seq = $last ? ((int) substr($last, -4)) + 1 : 1;

        // Loop until we land on a number not yet taken (handles gaps and race conditions)
        do {
            $number = sprintf('%s-%d-%04d', $prefix, $year, $seq++);
        } while (Invoice::where('invoice_number', $number)->exists());

        return $number;
    }

    // Restricts submitted gateway_account_ids to ones that actually belong to
    // this invoice's tenant and are currently active — silently drops
    // anything else (a stale/removed account id in an old request shouldn't
    // block saving the rest of the invoice) rather than erroring.
    private function validGatewayAccountIds(int $companyId, array $ids): array
    {
        if (empty($ids)) {
            return [];
        }

        $adminId = Company::find($companyId)?->admin_id;
        if (!$adminId) {
            return [];
        }

        return CompanyPaymentGateway::where('company_admin_id', $adminId)
            ->where('is_active', true)
            ->whereIn('id', $ids)
            ->pluck('id')
            ->toArray();
    }

    private function hasActivePaymentGateway(int $companyId): bool
    {
        $company = Company::find($companyId);

        return $company
            ? CompanyPaymentGateway::resolveActiveGateways($company)->isNotEmpty()
            : false;
    }

    private function computeTotals(array &$items, float $taxRate, float $discount): array
    {
        $subtotal = 0;
        foreach ($items as &$item) {
            $item['total'] = round((float) $item['quantity'] * (float) $item['unit_price'], 2);
            $subtotal += $item['total'];
        }
        unset($item);
        $taxAmt = round($subtotal * $taxRate / 100, 2);
        return [
            'subtotal'        => $subtotal,
            'tax_amount'      => $taxAmt,
            'total_amount'    => $subtotal + $taxAmt - $discount,
        ];
    }

    // GET /admin/invoices
    public function index(Request $request): JsonResponse
    {
        // Company-Wise Dashboard Filtering — scoped to the active company.
        $q = Invoice::where('company_id', $this->activeCompanyId())
            ->with(['client:id,name,company_name,email'])
            ->latest();

        if ($request->filled('status'))    $q->where('status', $request->status);
        if ($request->filled('client_id')) $q->where('client_id', $request->client_id);
        if ($request->filled('from'))      $q->whereDate('created_at', '>=', $request->from);
        if ($request->filled('to'))        $q->whereDate('created_at', '<=', $request->to);
        if ($request->filled('search')) {
            $s = $request->search;
            $q->where(fn($x) =>
                $x->where('invoice_number', 'like', "%{$s}%")
                  ->orWhereHas('client', fn($c) => $c->where('name', 'like', "%{$s}%"))
            );
        }

        return ApiResponse::success($q->get());
    }

    // POST /admin/invoices
    public function store(Request $request): JsonResponse
    {
        $ids = $this->companyIds();

        $data = $request->validate([
            'company_id'          => 'required|integer|in:' . implode(',', $ids),
            'client_id'           => 'nullable|exists:clients,id',
            'lead_id'             => 'nullable|exists:leads,id',
            'project_id'          => 'nullable|exists:projects,id',
            'project_title'       => 'nullable|string|max:255',
            'project_reference'   => 'nullable|string|max:100',
            'send_now'            => 'nullable|boolean',
            'due_date'            => 'nullable|date',
            'currency'            => 'nullable|string|max:10',
            'tax_rate'            => 'nullable|numeric|min:0|max:100',
            'discount_amount'     => 'nullable|numeric|min:0',
            'notes'               => 'nullable|string|max:2000',
            'customer_name'       => 'nullable|string|max:255',
            'customer_email'      => 'nullable|email|max:255',
            'customer_phone'      => ['nullable', 'string', 'max:50', new ValidPhoneNumber],
            'customer_address'    => 'nullable|string|max:500',
            'items'               => 'required|array|min:1',
            'items.*.description' => 'required|string|max:500',
            'items.*.quantity'    => 'required|numeric|min:0.01',
            'items.*.unit_price'  => 'required|numeric|min:0',
            'gateway_account_ids'   => 'nullable|array',
            'gateway_account_ids.*' => 'integer',
            // Deal-facing fields — what this invoice is FOR, and whether it
            // counts toward the Deal's kickoff-payment requirement.
            'invoice_purpose'                  => 'nullable|string|max:255',
            'payment_type'                     => 'nullable|string|max:30',
            'required_payment_amount'          => 'nullable|numeric|min:0',
            'counts_toward_project_activation' => 'nullable|boolean',
        ]);

        if (!$this->hasActivePaymentGateway((int) $data['company_id'])) {
            return ApiResponse::error('Please activate a payment gateway before creating an invoice.', 422);
        }

        // Ensure client belongs to the company (only when a client is specified)
        if (!empty($data['client_id'])) {
            Client::where('company_id', $data['company_id'])->findOrFail($data['client_id']);
        }
        $lead = null;
        if (!empty($data['lead_id'])) {
            $lead = Lead::where('company_id', $data['company_id'])->findOrFail($data['lead_id']);
        }

        if (!empty($data['project_id'])) {
            Project::where('company_id', $data['company_id'])->findOrFail($data['project_id']);
        }

        $taxRate  = (float) ($data['tax_rate']        ?? 0);
        $discount = (float) ($data['discount_amount'] ?? 0);
        $totals   = $this->computeTotals($data['items'], $taxRate, $discount);

        $sendNow = !empty($data['send_now']) && !empty($data['client_id']);

        $invoice = Invoice::create([
            'company_id'      => $data['company_id'],
            'client_id'       => $data['client_id'] ?? null,
            'lead_id'         => $data['lead_id'] ?? null,
            'project_id'         => $data['project_id']         ?? null,
            'project_title'      => $data['project_title']      ?? null,
            'project_reference'  => $data['project_reference']  ?? null,
            'invoice_number'  => $this->nextNumber($data['company_id']),
            'subtotal'        => $totals['subtotal'],
            'tax_rate'        => $taxRate,
            'tax_amount'      => $totals['tax_amount'],
            'discount_amount' => $discount,
            'total_amount'    => $totals['total_amount'],
            'paid_amount'     => 0,
            // The currency Company Admin configured in Settings is
            // authoritative — never a bare 'USD' literal — so every invoice
            // this admin issues, across any of their companies, lines up with
            // what they actually set (see Company::invoicingProfile()).
            'currency'        => $data['currency'] ?? $this->admin()->currency ?? 'USD',
            'status'          => $sendNow ? 'sent' : 'draft',
            'sent_at'         => $sendNow ? now() : null,
            'due_date'        => $data['due_date']        ?? null,
            'notes'           => $data['notes']           ?? null,
            'customer_name'   => $data['customer_name']   ?? null,
            'customer_email'  => $data['customer_email']  ?? null,
            'customer_phone'  => $data['customer_phone']  ?? null,
            'customer_address'=> $data['customer_address']?? null,
            'invoice_purpose'                  => $data['invoice_purpose']          ?? null,
            'payment_type'                      => $data['payment_type']             ?? null,
            'required_payment_amount'           => $data['required_payment_amount']  ?? null,
            'counts_toward_project_activation'  => $data['counts_toward_project_activation'] ?? true,
            // The sub-user side writes created_by; Admin isn't a `users` row,
            // so it records itself here instead. Both are what
            // PaymentProjectStartService hands the project it auto-creates.
            'created_by_admin_id'               => $this->admin()->id,
        ]);

        foreach ($data['items'] as $i => $item) {
            InvoiceItem::create([
                'invoice_id'  => $invoice->id,
                'description' => $item['description'],
                'quantity'    => $item['quantity'],
                'unit_price'  => $item['unit_price'],
                'total'       => $item['total'],
                'sort_order'  => $i,
            ]);
        }

        // "New Project" mode (project_title set, no existing project_id) —
        // raise the real Project now, status 'unpaid', promoted to 'draft' by
        // PaymentProjectStartService once a qualifying payment lands.
        if (!empty($invoice->project_title) && empty($invoice->project_id)) {
            PaymentProjectStartService::createUnpaidPlaceholder($invoice);
        }

        $invoice->paymentGatewayAccounts()->sync(
            $this->validGatewayAccountIds($data['company_id'], $data['gateway_account_ids'] ?? [])
        );

        // Created straight into 'sent' (send_now) — so it is already visible in
        // the portal and this is its first send. A draft created here notifies
        // later instead, when send()/sendEmail() flips it.
        if ($sendNow) {
            InvoiceNotificationService::notifyClientInvoiceSent($invoice);
        }

        if ($lead) {
            \App\Services\DealEligibilityService::recomputeFulfillmentStatus($lead);
        }

        return ApiResponse::success(
            $invoice->load(['client:id,name,company_name,email,phone,address', 'items']),
            'Invoice created',
            201
        );
    }

    // GET /admin/invoices/{invoice}
    public function show(Invoice $invoice): JsonResponse
    {
        if (!in_array($invoice->company_id, $this->companyIds())) {
            return ApiResponse::error('Not found', 404);
        }

        $invoice->load(['client', 'items', 'payments', 'lead:id,deal_reference,proposed_project_title,fulfillment_status']);
        $data = $invoice->toArray();
        $data['gateway_account_ids'] = $invoice->paymentGatewayAccounts()->pluck('company_payment_gateways.id')->toArray();

        return ApiResponse::success($data);
    }

    // PUT /admin/invoices/{invoice}
    public function update(Request $request, Invoice $invoice): JsonResponse
    {
        if (!in_array($invoice->company_id, $this->companyIds())) {
            return ApiResponse::error('Not found', 404);
        }
        if (in_array($invoice->status, ['paid', 'cancelled'])) {
            return ApiResponse::error('Cannot edit a paid or cancelled invoice', 422);
        }

        $data = $request->validate([
            'due_date'            => 'nullable|date',
            'currency'            => 'nullable|string|max:10',
            'tax_rate'            => 'nullable|numeric|min:0|max:100',
            'discount_amount'     => 'nullable|numeric|min:0',
            'notes'               => 'nullable|string|max:2000',
            'items'               => 'required|array|min:1',
            'items.*.description' => 'required|string|max:500',
            'items.*.quantity'    => 'required|numeric|min:0.01',
            'items.*.unit_price'  => 'required|numeric|min:0',
            'gateway_account_ids'   => 'nullable|array',
            'gateway_account_ids.*' => 'integer',
            'invoice_purpose'                  => 'nullable|string|max:255',
            'payment_type'                      => 'nullable|string|max:30',
            'required_payment_amount'           => 'nullable|numeric|min:0',
            'counts_toward_project_activation'  => 'nullable|boolean',
        ]);

        $taxRate  = (float) ($data['tax_rate']        ?? $invoice->tax_rate);
        $discount = (float) ($data['discount_amount'] ?? $invoice->discount_amount);
        $totals   = $this->computeTotals($data['items'], $taxRate, $discount);

        $invoice->update([
            'subtotal'        => $totals['subtotal'],
            'tax_rate'        => $taxRate,
            'tax_amount'      => $totals['tax_amount'],
            'discount_amount' => $discount,
            'total_amount'    => $totals['total_amount'],
            'due_date'        => $data['due_date'] ?? $invoice->due_date,
            'currency'        => $data['currency'] ?? $invoice->currency,
            'notes'           => $data['notes']    ?? $invoice->notes,
            'invoice_purpose'                  => $data['invoice_purpose']                  ?? $invoice->invoice_purpose,
            'payment_type'                      => $data['payment_type']                     ?? $invoice->payment_type,
            'required_payment_amount'           => $data['required_payment_amount']          ?? $invoice->required_payment_amount,
            'counts_toward_project_activation'  => $data['counts_toward_project_activation']  ?? $invoice->counts_toward_project_activation,
        ]);

        $invoice->items()->delete();
        foreach ($data['items'] as $i => $item) {
            InvoiceItem::create([
                'invoice_id'  => $invoice->id,
                'description' => $item['description'],
                'quantity'    => $item['quantity'],
                'unit_price'  => $item['unit_price'],
                'total'       => $item['total'],
                'sort_order'  => $i,
            ]);
        }

        // Only touch the gateway selection if the request actually included
        // the field — an update that omits it (e.g. an older client) should
        // leave the invoice's existing selection alone, not silently wipe it.
        if ($request->has('gateway_account_ids')) {
            $invoice->paymentGatewayAccounts()->sync(
                $this->validGatewayAccountIds($invoice->company_id, $data['gateway_account_ids'] ?? [])
            );
        }

        if ($invoice->lead_id) {
            \App\Services\DealEligibilityService::recomputeFulfillmentStatus($invoice->lead);
        }

        return ApiResponse::success(
            $invoice->load(['client', 'items', 'payments']),
            'Invoice updated'
        );
    }

    // PATCH /admin/invoices/{invoice}/send
    public function send(Invoice $invoice): JsonResponse
    {
        if (!in_array($invoice->company_id, $this->companyIds())) {
            return ApiResponse::error('Not found', 404);
        }
        if ($invoice->status !== 'draft') {
            return ApiResponse::error('Only draft invoices can be sent', 422);
        }

        $invoice->update(['status' => 'sent', 'sent_at' => now()]);
        // Draft-only guard above means this is always the first send.
        InvoiceNotificationService::notifyClientInvoiceSent($invoice);

        return ApiResponse::success(['status' => 'sent'], 'Invoice marked as sent');
    }

    // PATCH /admin/invoices/{invoice}/cancel
    public function cancel(Invoice $invoice): JsonResponse
    {
        if (!in_array($invoice->company_id, $this->companyIds())) {
            return ApiResponse::error('Not found', 404);
        }
        if (in_array($invoice->status, ['paid', 'cancelled'])) {
            return ApiResponse::error('Cannot cancel a ' . $invoice->status . ' invoice', 422);
        }

        $invoice->update(['status' => 'cancelled']);
        return ApiResponse::success(['status' => 'cancelled'], 'Invoice cancelled');
    }

    // POST /admin/invoices/{invoice}/generate-link
    public function generateLink(Request $request, Invoice $invoice): JsonResponse
    {
        if (!in_array($invoice->company_id, $this->companyIds())) {
            return ApiResponse::error('Not found', 404);
        }
        if ($invoice->status === 'cancelled') {
            return ApiResponse::error('Cannot share a cancelled invoice', 422);
        }

        $data = $request->validate([
            'expiry_days'      => 'nullable|integer|min:1|max:365',
            'customer_name'    => 'nullable|string|max:255',
            'customer_email'   => 'nullable|email|max:255',
            'customer_phone'   => ['nullable', 'string', 'max:50', new ValidPhoneNumber],
            'customer_address' => 'nullable|string|max:500',
        ]);

        // Update customer details if provided
        $customerFields = array_filter([
            'customer_name'    => $data['customer_name']    ?? null,
            'customer_email'   => $data['customer_email']   ?? null,
            'customer_phone'   => $data['customer_phone']   ?? null,
            'customer_address' => $data['customer_address'] ?? null,
        ], fn($v) => $v !== null);

        if ($customerFields) {
            $invoice->update($customerFields);
        }

        // Auto-mark draft as sent when sharing — same convention as
        // Api\User\InvoiceController::generateLink(). Previously this
        // hard-rejected a draft invoice instead, which meant "Create & Copy
        // Link" (the frontend's shared button for both guards) silently
        // never sent/notified the client when Company Admin used it, even
        // though the identical action worked for a Seller.
        if ($invoice->status === 'draft') {
            $invoice->update(['status' => 'sent', 'sent_at' => now()]);
            InvoiceNotificationService::notifyClientInvoiceSent($invoice);
        }

        $token = $invoice->generatePublicToken($data['expiry_days'] ?? null);

        return ApiResponse::success([
            'payment_token'    => $token,
            'token_expires_at' => $invoice->fresh()->token_expires_at?->toIso8601String(),
            'payment_url'      => config('app.frontend_url') . '/pay/invoice/' . $token,
        ], 'Payment link generated');
    }

    // DELETE /admin/invoices/{invoice}/generate-link
    public function revokeLink(Invoice $invoice): JsonResponse
    {
        if (!in_array($invoice->company_id, $this->companyIds())) {
            return ApiResponse::error('Not found', 404);
        }

        $invoice->revokePublicToken();

        return ApiResponse::success(null, 'Payment link revoked');
    }

    // GET /admin/clients/{client}/invoices
    public function forClient(Client $client): JsonResponse
    {
        if (!in_array($client->company_id, $this->companyIds())) {
            return ApiResponse::error('Not found', 404);
        }

        $invoices = Invoice::where('client_id', $client->id)
            ->with(['items', 'payments'])
            ->latest()
            ->get();

        return ApiResponse::success([
            'invoices' => $invoices,
            'stats'    => [
                'total_invoiced'    => $invoices->sum('total_amount'),
                'total_paid'        => $invoices->sum('paid_amount'),
                'total_outstanding' => $invoices->sum(fn($i) => max((float)$i->total_amount - (float)$i->paid_amount, 0)),
                'overdue_count'     => $invoices->where('status', 'overdue')->count(),
            ],
        ]);
    }

    // POST /admin/invoices/{invoice}/send-email
    public function sendEmail(Request $request, Invoice $invoice): JsonResponse
    {
        if (!in_array($invoice->company_id, $this->companyIds())) {
            return ApiResponse::error('Not found', 404);
        }

        $data = $request->validate([
            'email'       => 'required|email|max:255',
            'expiry_days' => 'nullable|integer|min:1|max:365',
        ], [
            'email.required' => 'Customer email is required to send invoice.',
            'email.email'    => 'Customer email is required to send invoice.',
        ]);

        // Generate or reuse public payment link
        if (!$invoice->payment_token || ($invoice->token_expires_at && $invoice->token_expires_at->isPast())) {
            $invoice->generatePublicToken($data['expiry_days'] ?? 30);
            $invoice->refresh();
        }

        $paymentUrl  = config('app.frontend_url') . '/pay/invoice/' . $invoice->payment_token;
        $companyName = $invoice->company->invoicingProfile()['name'];

        // Only flip to 'sent' AFTER the email genuinely goes out — previously
        // this happened before Mail::send(), so a failed send left the
        // invoice incorrectly marked 'sent' with nothing ever delivered.
        try {
            Mail::to($data['email'])->send(new InvoiceMail($invoice, $paymentUrl, $companyName));
        } catch (\Throwable $e) {
            Log::error('[admin-invoice] email send failed', ['invoice_id' => $invoice->id, 'error' => $e->getMessage()]);
            return ApiResponse::error('Invoice created, but email could not be sent. Please try sending again.', 422);
        }

        // Portal-enabled clients also get an in-portal notification on top of
        // the email above — only on this first send, when the invoice actually
        // becomes visible in the portal. Lead-only and guest/external invoices
        // have no portal inbox, so for them the email is the whole delivery.
        if ($invoice->status === 'draft') {
            $invoice->update(['status' => 'sent', 'sent_at' => now()]);
            InvoiceNotificationService::notifyClientInvoiceSent($invoice);
        }

        if ($invoice->lead_id) {
            Lead::find($invoice->lead_id)?->logActivity('note_added',
                "Invoice {$invoice->invoice_number} sent to {$data['email']}", $this->admin()->name ?? 'Admin');
        }

        return ApiResponse::success([
            'payment_url' => $paymentUrl,
            'sent_to'     => $data['email'],
        ], 'Invoice sent successfully');
    }
}
