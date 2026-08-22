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

        $paidInvoices    = $invoices->where('status', 'paid');
        $pendingInvoices = $invoices->whereIn('status', ['sent', 'overdue', 'partially_paid']);

        $paidCount     = $paidInvoices->count();
        $paidAmount    = (float) $paidInvoices->sum('total_amount');
        $pendingCount  = $pendingInvoices->count();
        $pendingAmount = (float) $pendingInvoices->sum(fn ($i) => max(0, $i->total_amount - $i->paid_amount));
        $overdueCount  = $invoices->where('status', 'overdue')->count();

        // ── Projects (only if module purchased) ──────────────────────────────
        $totalProjects     = 0;
        $pendingProjects   = 0;
        $ongoingProjects   = 0;
        $completedProjects = 0;
        $recentProjects    = [];
        if ($hasModule('projects')) {
            $projects = Project::whereIn('client_id', $clientIds)->notDraft()->get(['id', 'status']);
            $totalProjects     = $projects->count();
            $completedProjects = $projects->where('status', 'completed')->count();
            // "Pending" = not started/paused yet; "Ongoing" = actively being
            // worked on right now — split out of what was previously one
            // combined planning/active/on_hold bucket.
            $pendingProjects   = $projects->whereIn('status', ['planning', 'on_hold'])->count();
            $ongoingProjects   = $projects->where('status', 'active')->count();

            $recentProjects = Project::whereIn('client_id', $clientIds)
                ->notDraft()
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
                'total_invoices'     => $invoices->count(),
                'paid_count'         => $paidCount,
                'paid_amount'        => $paidAmount,
                'pending_count'      => $pendingCount,
                'pending_amount'     => $pendingAmount,
                'overdue_count'      => $overdueCount,
                'total_projects'     => $totalProjects,
                'pending_projects'   => $pendingProjects,
                'ongoing_projects'   => $ongoingProjects,
                'completed_projects' => $completedProjects,
                'open_tickets'       => $openTickets,
            ],
            'recent_invoices' => $recentInvoices,
            'recent_projects' => $recentProjects,
            'modules'         => $companyModules,
        ]);
    }
}
