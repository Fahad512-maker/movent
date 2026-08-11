<?php

namespace App\Http\Controllers\Api\User;

use App\Helpers\ApiResponse;
use App\Http\Controllers\Controller;
use App\Models\FollowUp;
use App\Models\Lead;
use App\Models\UserCompanyPermission;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

// Mirrors Api\Admin\SalesDashboardController, scoped to the leads this Seller
// can see (own/assigned, unless canViewAllCompanyLeads is granted) instead of
// the whole company — same data shape so the frontend dashboard component is
// reusable across both guards.
class SalesDashboardController extends Controller
{
    private function user() { return auth('sanctum')->user(); }

    private function can(string $permKey): bool
    {
        $user = $this->user();
        return UserCompanyPermission::where('user_id', $user->id)
            ->where('company_id', $user->company_id)
            ->where('module_key', 'sales')
            ->where('permission_key', $permKey)
            ->exists();
    }

    // Mirrors Api\User\LeadController::visibleLeads().
    private function visibleLeads()
    {
        $user = $this->user();
        $base = Lead::where('company_id', $user->company_id);

        if ($this->can('canViewAllCompanyLeads')) {
            return $base;
        }

        return $base->where('assigned_to', $user->id);
    }

    public function index(Request $request): JsonResponse
    {
        if (!$this->can('canViewSalesDashboard') && !$this->can('canViewLeads')) {
            return ApiResponse::error('Permission denied', 403);
        }

        $user       = $this->user();
        $companyId  = $user->company_id;
        $today      = now()->toDateString();
        $year       = $request->get('year', now()->year);

        $base = $this->visibleLeads();

        $total     = (clone $base)->count();
        $newCount  = (clone $base)->where('status', 'new')->count();
        $contacted = (clone $base)->where('status', 'contacted')->count();
        $qualified = (clone $base)->where('status', 'qualified')->count();
        $won       = (clone $base)->where('status', 'won')->count();
        $lost      = (clone $base)->where('status', 'lost')->count();
        $converted = (clone $base)->whereNotNull('converted_at')->count();

        $openStatuses = ['new', 'contacted', 'qualified', 'proposal', 'negotiation'];
        $openDeals    = (clone $base)->whereIn('status', $openStatuses)->count();
        $pipelineVal  = (clone $base)->whereIn('status', $openStatuses)->sum('estimated_value');
        $wonValue     = (clone $base)->where('status', 'won')->sum('estimated_value');

        // Follow-ups are always scoped to the Seller's own queue (not
        // affected by canViewAllCompanyLeads) — mirrors FollowUpController's
        // own scoping, which is company-wide there because it's the PM/Admin
        // oversight view; here it's "my day", so scope to assigned_to.
        $todayFollowUps = FollowUp::where('company_id', $companyId)
            ->where('assigned_to', $user->id)
            ->where('status', 'pending')
            ->whereDate('scheduled_at', $today)
            ->count();

        $overdueFollowUps = FollowUp::where('company_id', $companyId)
            ->where('assigned_to', $user->id)
            ->where('status', 'pending')
            ->whereDate('scheduled_at', '<', $today)
            ->count();

        $months = [];
        for ($m = 1; $m <= 12; $m++) {
            $months[$m] = ['month' => $m, 'total' => 0, 'won' => 0, 'lost' => 0, 'value' => 0];
        }
        (clone $base)->whereYear('created_at', $year)
            ->get(['status', 'estimated_value', 'created_at'])
            ->each(function ($l) use (&$months) {
                $m = (int) date('n', strtotime($l->created_at));
                $months[$m]['total']++;
                if ($l->status === 'won')  { $months[$m]['won']++;  $months[$m]['value'] += (float) $l->estimated_value; }
                if ($l->status === 'lost') $months[$m]['lost']++;
            });

        $byStage = (clone $base)->whereIn('status', $openStatuses)
            ->selectRaw('status, COUNT(*) as count, SUM(estimated_value) as value')
            ->groupBy('status')
            ->get()
            ->keyBy('status')
            ->map(fn($r) => ['count' => $r->count, 'value' => (float) $r->value]);

        $sellers = (clone $base)->whereNotNull('assigned_to')
            ->with('assignedTo:id,name')
            ->get(['id', 'assigned_to', 'status', 'estimated_value'])
            ->groupBy('assigned_to')
            ->map(function ($group) {
                $seller = $group->first()->assignedTo;
                return [
                    'id'        => $seller?->id,
                    'name'      => $seller?->name ?? 'Unknown',
                    'total'     => $group->count(),
                    'won'       => $group->where('status', 'won')->count(),
                    'lost'      => $group->where('status', 'lost')->count(),
                    'open'      => $group->whereIn('status', ['new','contacted','qualified','proposal','negotiation'])->count(),
                    'won_value' => (float) $group->where('status', 'won')->sum('estimated_value'),
                ];
            })
            ->sortByDesc('won_value')
            ->values();

        return ApiResponse::success([
            'summary' => [
                'total'              => $total,
                'new'                => $newCount,
                'contacted'          => $contacted,
                'qualified'          => $qualified,
                'won'                => $won,
                'lost'               => $lost,
                'converted'          => $converted,
                'open_deals'         => $openDeals,
                'pipeline_value'     => (float) $pipelineVal,
                'won_value'          => (float) $wonValue,
                'today_followups'    => $todayFollowUps,
                'overdue_followups'  => $overdueFollowUps,
            ],
            'monthly'  => array_values($months),
            'by_stage' => $byStage,
            'sellers'  => $sellers,
            'year'     => (int) $year,
        ]);
    }
}
