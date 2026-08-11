<?php

namespace App\Http\Controllers\Api\Client;

use App\Helpers\ApiResponse;
use App\Http\Controllers\Controller;
use App\Models\Client;
use App\Models\CompanyModule;
use App\Models\Invoice;
use App\Models\Project;
use App\Models\SupportTicket;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class DashboardController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $userId = $request->user()->id;

        // All client records for this user that have portal access
        $clients   = Client::where('user_id', $userId)
            ->where('portal_access', true)
            ->with('company')
            ->get();

        if ($clients->isEmpty()) {
            return ApiResponse::error('Client not found', 404);
        }

        $clientIds = $clients->pluck('id')->toArray();

        // Use the first (primary) client's company for module checking
        $primaryClient  = $clients->first();
        $companyModules = CompanyModule::where('company_id', $primaryClient->company_id)
            ->where('is_enabled', true)
            ->pluck('module_key')
            ->toArray();

        $hasModule = fn(string $key): bool => in_array($key, $companyModules);

        // ── Invoice stats (all non-draft invoices visible to client) ─────────
        $invoices = Invoice::whereIn('client_id', $clientIds)
            ->whereNotIn('status', ['draft', 'cancelled'])
            ->get(['id', 'invoice_number', 'total_amount', 'paid_amount',
                   'currency', 'status', 'due_date', 'created_at']);

        $totalInvoiced = (float) $invoices->sum('total_amount');
        $totalPaid     = (float) $invoices->sum('paid_amount');
        $outstanding   = $totalInvoiced - $totalPaid;
        $overdueCount  = $invoices->where('status', 'overdue')->count();
        $pendingCount  = $invoices->whereIn('status', ['sent', 'overdue', 'partially_paid'])->count();

        // ── Projects (only if module purchased) ──────────────────────────────
        $activeProjects = 0;
        $recentProjects = [];
        if ($hasModule('projects')) {
            $activeProjects = Project::whereIn('client_id', $clientIds)
                ->whereIn('status', ['planning', 'active', 'on_hold'])
                ->count();

            $recentProjects = Project::whereIn('client_id', $clientIds)
                ->orderByDesc('created_at')
                ->limit(3)
                ->get(['id', 'name', 'status', 'deadline', 'created_at'])
                ->toArray();
        }

        // ── Support tickets ───────────────────────────────────────────────────
        $openTickets = SupportTicket::where('raised_by', $userId)
            ->whereIn('status', ['open', 'in_progress'])
            ->count();

        // ── Recent invoices (latest 5, all non-draft) ─────────────────────────
        $recentInvoices = $invoices->sortByDesc('created_at')->take(5)->values()->toArray();

        return ApiResponse::success([
            'stats' => [
                'total_invoices'  => $invoices->count(),
                'total_invoiced'  => $totalInvoiced,
                'total_paid'      => $totalPaid,
                'outstanding'     => $outstanding,
                'overdue_count'   => $overdueCount,
                'pending_count'   => $pendingCount,
                'active_projects' => $activeProjects,
                'open_tickets'    => $openTickets,
            ],
            'recent_invoices' => $recentInvoices,
            'recent_projects' => $recentProjects,
            'modules'         => $companyModules,
            'currency'        => $primaryClient->company?->currency ?? 'USD',
        ]);
    }
}
