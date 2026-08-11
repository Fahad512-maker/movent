<?php

namespace App\Http\Controllers\Api\Client;

use App\Helpers\ApiResponse;
use App\Http\Controllers\Controller;
use App\Models\Client;
use App\Models\Invoice;
use App\Models\Project;
use Carbon\Carbon;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class ReportController extends Controller
{
    private function clientIds(Request $request): array
    {
        $ids = Client::where('user_id', $request->user()->id)
            ->where('portal_access', true)
            ->pluck('id')
            ->toArray();

        if (empty($ids)) abort(404, 'Client not found');

        return $ids;
    }

    public function projects(Request $request): JsonResponse
    {
        $clientIds = $this->clientIds($request);

        $projects = Project::whereIn('client_id', $clientIds)
            ->notDraft()
            ->with(['projectManager:id,name'])
            ->get(['id', 'name', 'status', 'start_date', 'deadline', 'completed_at', 'project_manager_id']);

        $summary = [
            'total'       => $projects->count(),
            'in_progress' => $projects->whereIn('status', ['active', 'in_progress'])->count(),
            'planning'    => $projects->whereIn('status', ['planning', 'draft'])->count(),
            'completed'   => $projects->where('status', 'completed')->count(),
            'on_hold'     => $projects->where('status', 'on_hold')->count(),
        ];

        return ApiResponse::success([
            'summary'  => $summary,
            'projects' => $projects,
        ]);
    }

    public function invoices(Request $request): JsonResponse
    {
        $clientIds = $this->clientIds($request);

        $invoices = Invoice::whereIn('client_id', $clientIds)
            ->whereNotIn('status', ['draft', 'cancelled'])
            ->orderBy('created_at')
            ->get(['id', 'invoice_number', 'total_amount', 'paid_amount', 'currency', 'status', 'created_at', 'due_date']);

        $summary = [
            'total_invoiced' => $invoices->sum('total_amount'),
            'total_paid'     => $invoices->where('status', 'paid')->sum('total_amount'),
            'total_pending'  => $invoices->whereIn('status', ['sent', 'payment_pending'])->sum('total_amount'),
            'total_overdue'  => $invoices->where('status', 'overdue')->sum('total_amount'),
        ];

        // Monthly breakdown — last 6 months
        $monthly = $invoices
            ->groupBy(fn($inv) => Carbon::parse($inv->created_at)->format('Y-m'))
            ->map(fn($group, $month) => [
                'month'   => $month,
                'count'   => $group->count(),
                'total'   => (float) $group->sum('total_amount'),
                'paid'    => (float) $group->where('status', 'paid')->sum('total_amount'),
                'pending' => (float) $group->whereIn('status', ['sent', 'payment_pending', 'overdue'])->sum('total_amount'),
            ])
            ->sortKeys()
            ->slice(-6)
            ->values();

        return ApiResponse::success([
            'summary' => $summary,
            'monthly' => $monthly,
            'list'    => $invoices,
        ]);
    }
}
