<?php

namespace App\Http\Controllers\Api\Admin;

use App\Helpers\ApiResponse;
use App\Http\Controllers\Api\Admin\Concerns\ScopesToActiveCompany;
use App\Http\Controllers\Controller;
use App\Models\FollowUp;
use App\Models\Lead;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class SalesDashboardController extends Controller
{
    use ScopesToActiveCompany;

    private function companyIds(): array
    {
        return auth('admin')->user()->companies()->pluck('id')->toArray();
    }

    public function index(Request $request): JsonResponse
    {
        $companyIds = $this->activeCompanyIds();
        $today      = now()->toDateString();
        $month      = $request->get('month', now()->month);
        $year       = $request->get('year',  now()->year);

        $base = Lead::whereIn('company_id', $companyIds)->whereYear('created_at', $year);

        // ── Summary counts ──────────────────────────────────────────────────
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

        $todayFollowUps = FollowUp::whereIn('company_id', $companyIds)
            ->where('status', 'pending')
            ->whereDate('scheduled_at', $today)
            ->count();

        $overdueFollowUps = FollowUp::whereIn('company_id', $companyIds)
            ->where('status', 'pending')
            ->whereDate('scheduled_at', '<', $today)
            ->count();

        // ── Monthly summary ─────────────────────────────────────────────────
        $months = [];
        for ($m = 1; $m <= 12; $m++) {
            $months[$m] = ['month' => $m, 'total' => 0, 'won' => 0, 'lost' => 0, 'value' => 0];
        }
        (clone $base)
            ->get(['status', 'estimated_value', 'created_at'])
            ->each(function ($l) use (&$months) {
                $m = (int) date('n', strtotime($l->created_at));
                $months[$m]['total']++;
                if ($l->status === 'won')  { $months[$m]['won']++;  $months[$m]['value'] += (float) $l->estimated_value; }
                if ($l->status === 'lost') $months[$m]['lost']++;
            });

        // ── Stage distribution ──────────────────────────────────────────────
        $byStage = (clone $base)->whereIn('status', $openStatuses)
            ->selectRaw('status, COUNT(*) as count, SUM(estimated_value) as value')
            ->groupBy('status')
            ->get()
            ->keyBy('status')
            ->map(fn($r) => ['count' => $r->count, 'value' => (float) $r->value]);

        // ── Seller performance ──────────────────────────────────────────────
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
