<?php

namespace App\Http\Controllers\Api\Admin;

use App\Helpers\ApiResponse;
use App\Http\Controllers\Controller;
use App\Models\Invoice;
use App\Models\Payment;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class ReportController extends Controller
{
    private function admin() { return auth('admin')->user(); }

    private function companyIds(): array
    {
        return $this->admin()->companies()->pluck('id')->toArray();
    }

    // GET /admin/reports/invoices
    public function invoices(Request $request): JsonResponse
    {
        $companyIds = $this->companyIds();
        $year       = (int) ($request->year ?? now()->year);
        $companyId  = $request->company_id ? (int) $request->company_id : null;

        $base = Invoice::whereIn('company_id', $companyIds);
        if ($companyId && in_array($companyId, $companyIds)) {
            $base->where('company_id', $companyId);
        }

        // ── Summary ──────────────────────────────────────────────────────────
        $all = (clone $base)->get(['status', 'total_amount', 'paid_amount', 'due_date', 'currency']);

        $summary = [
            'total_invoiced'   => $all->sum('total_amount'),
            'total_paid'       => $all->sum('paid_amount'),
            'total_outstanding'=> $all->sum(fn($i) => max(0, $i->total_amount - $i->paid_amount)),
            'total_count'      => $all->count(),
            'paid_count'       => $all->where('status', 'paid')->count(),
            'unpaid_count'     => $all->whereIn('status', ['draft', 'sent', 'partially_paid'])->count(),
            'overdue_count'    => $all->where('status', 'overdue')->count(),
            'cancelled_count'  => $all->where('status', 'cancelled')->count(),
        ];

        // ── By status ─────────────────────────────────────────────────────────
        $byStatus = $all->groupBy('status')->map(fn($g) => [
            'count'  => $g->count(),
            'amount' => $g->sum('total_amount'),
        ])->toArray();

        // ── Monthly trend (selected year) ─────────────────────────────────────
        $monthly = [];
        for ($m = 1; $m <= 12; $m++) {
            $monthly[$m] = ['invoiced' => 0, 'paid' => 0, 'count' => 0];
        }
        (clone $base)->whereYear('created_at', $year)
            ->get(['total_amount', 'paid_amount', 'created_at'])
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

        // ── Top clients by invoiced amount ────────────────────────────────────
        $topClients = (clone $base)
            ->with('client:id,name,company_name')
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
            ->sortByDesc('total')
            ->values()
            ->take(10);

        // ── Recent payments ────────────────────────────────────────────────────
        $recentPayments = Payment::whereHas('invoice', fn($q) => $q->whereIn('company_id', $companyIds))
            ->with('invoice:id,invoice_number,client_id', 'invoice.client:id,name')
            ->latest()
            ->limit(10)
            ->get(['id', 'invoice_id', 'amount', 'method', 'payment_date', 'created_at'])
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
}
