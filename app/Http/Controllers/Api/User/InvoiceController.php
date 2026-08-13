<?php

namespace App\Http\Controllers\Api\User;

use App\Helpers\ApiResponse;
use App\Http\Controllers\Controller;
use App\Mail\InvoiceMail;
use App\Models\Client;
use App\Models\Company;
use App\Models\CompanyPaymentGateway;
use App\Models\Invoice;
use App\Models\InvoiceItem;
use App\Models\Lead;
use App\Models\Notification;
use App\Models\Payment;
use App\Models\Project;
use App\Services\InvoiceNotificationService;
use App\Models\SystemAuditLog;
use App\Models\UserCompanyPermission;
use App\Support\PermissionDebug;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Mail;

class InvoiceController extends Controller
{
    private function user() { return auth('sanctum')->user(); }

    private function can(string $permKey): bool
    {
        $user = $this->user();
        $result = UserCompanyPermission::where('user_id', $user->id)
            ->where('company_id', $user->company_id)
            ->where('module_key', 'invoice')
            ->where('permission_key', $permKey)
            ->exists();
        PermissionDebug::log($user->id, $user->company_id, $user->role_type, 'invoice', $permKey, $result);
        return $result;
    }

    // Surfaces in Company Admin's notification bell (Api\Admin\NotificationController
    // reads SystemAuditLog unfiltered by action — Admin has no Notification rows).
    private function auditLog(Invoice $invoice, string $action, string $preview): void
    {
        $user = $this->user();
        SystemAuditLog::create([
            'company_id'  => $invoice->company_id,
            'user_id'     => $user->id,
            'action'      => $action,
            'module_key'  => 'invoice',
            'entity_type' => 'Invoice',
            'entity_id'   => $invoice->id,
            'new_values'  => ['preview' => $preview, 'author' => $user->name ?? 'User'],
        ]);
    }

    // GET /user/reports/invoices
    public function report(Request $request): JsonResponse
    {
        if (!$this->can('canViewInvoiceReports')) {
            return ApiResponse::error('Permission denied', 403);
        }

        $companyId = $this->user()->company_id;
        $year      = (int) ($request->year ?? now()->year);

        $base = Invoice::where('company_id', $companyId)
                       ->where('created_by', $this->user()->id);

        $all = (clone $base)->get(['status', 'total_amount', 'paid_amount', 'due_date']);

        $summary = [
            'total_invoiced'    => $all->sum('total_amount'),
            'total_paid'        => $all->sum('paid_amount'),
            'total_outstanding' => $all->sum(fn($i) => max(0, $i->total_amount - $i->paid_amount)),
            'total_count'       => $all->count(),
            'paid_count'        => $all->where('status', 'paid')->count(),
            'unpaid_count'      => $all->whereIn('status', ['draft', 'sent', 'partially_paid'])->count(),
            'overdue_count'     => $all->where('status', 'overdue')->count(),
            'cancelled_count'   => $all->where('status', 'cancelled')->count(),
        ];

        $byStatus = $all->groupBy('status')->map(fn($g) => [
            'count'  => $g->count(),
            'amount' => $g->sum('total_amount'),
        ])->toArray();

        $monthly = [];
        for ($m = 1; $m <= 12; $m++) $monthly[$m] = ['invoiced' => 0, 'paid' => 0, 'count' => 0];
        (clone $base)->whereYear('created_at', $year)->get(['total_amount', 'paid_amount', 'created_at'])
            ->each(function ($inv) use (&$monthly) {
                $m = (int) date('n', strtotime($inv->created_at));
                $monthly[$m]['invoiced'] += $inv->total_amount;
                $monthly[$m]['paid']     += $inv->paid_amount;
                $monthly[$m]['count']++;
            });
        $monthlyArr = array_values(array_map(
            fn($m, $d) => array_merge(['month' => $m], $d),
            array_keys($monthly), $monthly
        ));

        $topClients = (clone $base)->with('client:id,name,company_name')
            ->whereNotNull('client_id')
            ->get(['client_id', 'total_amount', 'paid_amount', 'status'])
            ->groupBy('client_id')
            ->map(fn($g) => [
                'client_id'   => $g->first()->client_id,
                'name'        => $g->first()->client?->name ?? 'Unknown',
                'company'     => $g->first()->client?->company_name,
                'total'       => $g->sum('total_amount'),
                'paid'        => $g->sum('paid_amount'),
                'outstanding' => $g->sum(fn($i) => max(0, $i->total_amount - $i->paid_amount)),
                'count'       => $g->count(),
            ])
            ->sortByDesc('total')->values()->take(10);

        $recentPayments = Payment::whereHas('invoice', fn($q) => $q->where('company_id', $companyId)->where('created_by', $this->user()->id))
            ->with('invoice:id,invoice_number,client_id', 'invoice.client:id,name')
            ->latest()->limit(10)
            ->get(['id', 'invoice_id', 'amount', 'method', 'payment_date'])
            ->map(fn($p) => [
                'id'             => $p->id,
                'amount'         => $p->amount,
                'method'         => $p->method,
                'payment_date'   => $p->payment_date,
                'invoice_number' => $p->invoice?->invoice_number,
                'client_name'    => $p->invoice?->client?->name ?? '—',
            ]);

        return ApiResponse::success([
            'summary'         => $summary,
            'by_status'       => $byStatus,
            'monthly'         => $monthlyArr,
            'top_clients'     => $topClients,
            'recent_payments' => $recentPayments,
            'year'            => $year,
        ]);
    }

    private function nextNumber(int $companyId): string
    {
        $year   = now()->year;
        $prefix = \App\Models\Company::find($companyId)?->invoicingProfile()['invoice_prefix'] ?? 'INV';

        $last = Invoice::whereYear('created_at', $year)
            ->where('invoice_number', 'like', "{$prefix}-{$year}-%")
            ->latest('id')
            ->value('invoice_number');

        $seq = $last ? ((int) substr($last, -4)) + 1 : 1;

        do {
            $number = sprintf('%s-%d-%04d', $prefix, $year, $seq++);
        } while (Invoice::where('invoice_number', $number)->exists());

        return $number;
    }

    // GET /user/invoices/{id}
    public function show(int $id): JsonResponse
    {
        if (!$this->can('canViewInvoices')) {
            return ApiResponse::error('Permission denied', 403);
        }

        $user    = $this->user();
        $invoice = Invoice::where('id', $id)
            ->where('company_id', $user->company_id)
            ->where('created_by', $user->id)
            ->with(['client:id,name,company_name,email,phone,address', 'items', 'payments', 'lead:id,deal_reference,proposed_project_title,fulfillment_status'])
            ->first();

        if (!$invoice) {
            return ApiResponse::error('Invoice not found', 404);
        }

        $data = $invoice->toArray();
        $data['gateway_account_ids'] = $invoice->paymentGatewayAccounts()->pluck('company_payment_gateways.id')->toArray();

        return ApiResponse::success($data);
    }

    // GET /user/invoices/gateway-accounts — active tenant gateway accounts
    // for the invoice-create/edit form's "Payment Gateways for this Invoice"
    // checkbox list. No secrets — just enough to render the list and know
    // which one(s) are each type's default.
    public function gatewayAccounts(): JsonResponse
    {
        if (!$this->can('canViewInvoices') && !$this->can('canCreateInvoices')) {
            return ApiResponse::error('Permission denied', 403);
        }

        $user = $this->user();
        $company = Company::find($user->company_id);

        $accounts = CompanyPaymentGateway::resolveActiveGateways($company)
            ->map(fn($g) => [
                'id'          => $g->id,
                'gateway_type'=> $g->gateway,
                'label'       => $g->label ?: (CompanyPaymentGateway::GATEWAYS[$g->gateway] ?? $g->gateway),
                'is_default'  => (bool) $g->is_default,
            ])
            ->values();

        return ApiResponse::success([
            'accounts'                 => $accounts,
            'can_select_gateway'       => $this->can('canSelectInvoiceGateway'),
        ]);
    }

    // GET /user/invoices
    public function index(Request $request): JsonResponse
    {
        if (!$this->can('canViewInvoices')) {
            return ApiResponse::error('Permission denied', 403);
        }

        $companyId = $this->user()->company_id;

        $q = Invoice::where('company_id', $companyId)
            ->where('created_by', $this->user()->id)
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

    // POST /user/invoices
    public function store(Request $request): JsonResponse
    {
        if (!$this->can('canCreateInvoices')) {
            return ApiResponse::error('You do not have permission to create invoices', 403);
        }

        $user      = $this->user();
        $companyId = $user->company_id;

        $data = $request->validate([
            'client_id'           => 'nullable|exists:clients,id',
            'lead_id'             => 'nullable|exists:leads,id',
            'project_id'          => 'nullable|exists:projects,id',
            'project_title'       => 'nullable|string|max:255',
            'project_reference'   => 'nullable|string|max:100',
            'due_date'            => 'nullable|date',
            'currency'            => 'nullable|string|max:10',
            'tax_rate'            => 'nullable|numeric|min:0|max:100',
            'discount_amount'     => 'nullable|numeric|min:0',
            'notes'               => 'nullable|string|max:2000',
            'customer_name'       => 'nullable|string|max:255',
            'customer_email'      => 'nullable|email|max:255',
            'customer_phone'      => 'nullable|string|max:50',
            'customer_address'    => 'nullable|string|max:500',
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

        if (!empty($data['client_id'])) {
            Client::where('company_id', $companyId)->findOrFail($data['client_id']);
        }

        $lead = null;
        if (!empty($data['lead_id'])) {
            $lead = Lead::where('company_id', $companyId)->findOrFail($data['lead_id']);
        }

        if (!empty($data['project_id'])) {
            Project::where('company_id', $companyId)->findOrFail($data['project_id']);
        }

        $taxRate  = (float) ($data['tax_rate']        ?? 0);
        $discount = (float) ($data['discount_amount'] ?? 0);

        $subtotal = 0;
        $items    = $data['items'];
        foreach ($items as &$item) {
            $item['total'] = round((float) $item['quantity'] * (float) $item['unit_price'], 2);
            $subtotal += $item['total'];
        }
        unset($item);

        $taxAmt = round($subtotal * $taxRate / 100, 2);

        $invoice = Invoice::create([
            'company_id'       => $companyId,
            'client_id'        => $data['client_id']       ?? null,
            'lead_id'          => $lead?->id,
            'project_id'       => $data['project_id']       ?? null,
            'project_title'    => $data['project_title']    ?? null,
            'project_reference'=> $data['project_reference']?? null,
            'created_by'       => $user->id,
            'invoice_number'   => $this->nextNumber($companyId),
            'subtotal'         => $subtotal,
            'tax_rate'         => $taxRate,
            'tax_amount'       => $taxAmt,
            'discount_amount'  => $discount,
            'total_amount'     => $subtotal + $taxAmt - $discount,
            'paid_amount'      => 0,
            // The currency Company Admin configured in Settings is
            // authoritative — never a bare 'USD' literal (see
            // Company::invoicingProfile()).
            'currency'         => $data['currency']        ?? \App\Models\Company::find($companyId)?->invoicingProfile()['currency'] ?? 'USD',
            'status'           => 'draft',
            'due_date'         => $data['due_date']        ?? null,
            'notes'            => $data['notes']           ?? null,
            'customer_name'    => $data['customer_name']   ?? null,
            'customer_email'   => $data['customer_email']  ?? null,
            'customer_phone'   => $data['customer_phone']  ?? null,
            'customer_address' => $data['customer_address']?? null,
            'invoice_purpose'                  => $data['invoice_purpose']         ?? null,
            'payment_type'                       => $data['payment_type']            ?? null,
            'required_payment_amount'            => $data['required_payment_amount'] ?? null,
            'counts_toward_project_activation'   => $data['counts_toward_project_activation'] ?? true,
        ]);

        foreach ($items as $i => $item) {
            InvoiceItem::create([
                'invoice_id'  => $invoice->id,
                'description' => $item['description'],
                'quantity'    => $item['quantity'],
                'unit_price'  => $item['unit_price'],
                'total'       => $item['total'],
                'sort_order'  => $i,
            ]);
        }

        // Only a user holding canSelectInvoiceGateway may restrict/override
        // which gateway account(s) this invoice accepts — otherwise, per
        // spec, silently fall back to the company's default gateway(s) by
        // simply leaving the pivot empty (every gateway-resolving read path
        // already treats "no explicit selection" as "use the tenant's
        // per-type defaults").
        if (!empty($data['gateway_account_ids']) && $this->can('canSelectInvoiceGateway')) {
            $validIds = CompanyPaymentGateway::where('company_admin_id', Company::find($companyId)?->admin_id)
                ->where('is_active', true)
                ->whereIn('id', $data['gateway_account_ids'])
                ->pluck('id')
                ->toArray();
            $invoice->paymentGatewayAccounts()->sync($validIds);
        }

        if ($lead) {
            $lead->logActivity('note_added', "Invoice {$invoice->invoice_number} created for this lead", $user->name ?? 'User');
            \App\Services\DealEligibilityService::recomputeFulfillmentStatus($lead);
        }
        $this->auditLog($invoice, 'invoice_created', "Invoice {$invoice->invoice_number} created"
            . ($lead ? " from lead \"{$lead->name}\"" : ''));

        return ApiResponse::success(
            $invoice->load(['client:id,name,company_name,email,phone,address', 'items']),
            'Invoice created',
            201
        );
    }

    // POST /user/invoices/{id}/send-email
    public function sendEmail(Request $request, int $id): JsonResponse
    {
        if (!$this->can('canSendInvoices') && !$this->can('canCreateInvoices')) {
            return ApiResponse::error('Permission denied', 403);
        }

        $user    = $this->user();
        $invoice = Invoice::where('id', $id)
            ->where('company_id', $user->company_id)
            ->where('created_by', $user->id)
            ->firstOrFail();

        $data = $request->validate([
            'email'       => 'required|email|max:255',
            'expiry_days' => 'nullable|integer|min:1|max:365',
        ], [
            'email.required' => 'Customer email is required to send invoice.',
            'email.email'    => 'Customer email is required to send invoice.',
        ]);

        if (!$invoice->payment_token || ($invoice->token_expires_at && $invoice->token_expires_at->isPast())) {
            $invoice->generatePublicToken($data['expiry_days'] ?? 30);
            $invoice->refresh();
        }

        $company     = Company::find($user->company_id);
        $paymentUrl  = config('app.frontend_url') . '/pay/invoice/' . $invoice->payment_token;
        $companyName = $company->invoicingProfile()['name'];

        // Only flip the invoice to 'sent' AFTER the email genuinely goes out —
        // previously this happened before Mail::send(), so a failed send left
        // the invoice incorrectly marked 'sent' with nothing ever delivered.
        try {
            Mail::to($data['email'])->send(new InvoiceMail($invoice, $paymentUrl, $companyName));
        } catch (\Throwable $e) {
            Log::error('[sales-invoice] email send failed', ['invoice_id' => $invoice->id, 'error' => $e->getMessage()]);
            return ApiResponse::error('Invoice created, but email could not be sent. Please try sending again.', 422);
        }

        $wasFirstSend = $invoice->status === 'draft';
        $invoice->update(array_filter([
            'status'  => $wasFirstSend ? 'sent' : $invoice->status,
            'sent_at' => $wasFirstSend ? now() : $invoice->sent_at,
            'sent_by' => $user->id,
        ], fn ($v) => $v !== null));

        // Portal-enabled clients also get an in-portal notification, on top of
        // the email above — only on the first send, when the invoice actually
        // becomes visible in the portal. Lead-only and guest/external invoices
        // have no portal inbox, so for them the email is the whole delivery.
        if ($wasFirstSend) {
            InvoiceNotificationService::notifyClientInvoiceSent($invoice);
        }

        if ($invoice->lead_id) {
            Lead::find($invoice->lead_id)?->logActivity('note_added',
                "Invoice {$invoice->invoice_number} sent to {$data['email']}", $user->name ?? 'User');
        }
        $this->auditLog($invoice, 'invoice_sent', "Invoice {$invoice->invoice_number} sent to {$data['email']}");

        return ApiResponse::success([
            'payment_url' => $paymentUrl,
            'sent_to'     => $data['email'],
        ], 'Invoice sent successfully');
    }

    // POST /user/invoices/{id}/generate-link
    public function generateLink(Request $request, int $id): JsonResponse
    {
        if (!$this->can('canSendInvoices') && !$this->can('canCreateInvoices')) {
            return ApiResponse::error('Permission denied', 403);
        }

        $user    = $this->user();
        $invoice = Invoice::where('id', $id)
            ->where('company_id', $user->company_id)
            ->where('created_by', $user->id)
            ->firstOrFail();

        if ($invoice->status === 'cancelled') {
            return ApiResponse::error('Cannot share a cancelled invoice', 422);
        }

        $data = $request->validate([
            'expiry_days' => 'nullable|integer|min:1|max:365',
        ]);

        // Auto-mark draft as sent when sharing
        if ($invoice->status === 'draft') {
            $invoice->update(['status' => 'sent', 'sent_at' => now()]);
            // Now visible in the portal — same first-send-only rule as sendEmail().
            InvoiceNotificationService::notifyClientInvoiceSent($invoice);
        }

        $token = $invoice->generatePublicToken($data['expiry_days'] ?? null);

        return ApiResponse::success([
            'payment_token'    => $token,
            'token_expires_at' => $invoice->fresh()->token_expires_at?->toIso8601String(),
            'payment_url'      => config('app.frontend_url') . '/pay/invoice/' . $token,
        ], 'Payment link generated');
    }
}
