<?php

namespace App\Http\Controllers\Api\User;

use App\Helpers\ApiResponse;
use App\Http\Controllers\Controller;
use App\Models\Lead;
use App\Models\SalesTarget;
use App\Models\UserCompanyPermission;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class SalesTargetController extends Controller
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

    // GET /user/sales/targets — the Seller's current-month target (if any set
    // by Company Admin, or by the Seller themselves via upsert()) plus actual
    // progress against it.
    public function index(): JsonResponse
    {
        if (!$this->can('canViewSalesTargets')) {
            return ApiResponse::error('Permission denied', 403);
        }

        $user  = $this->user();
        $start = now()->startOfMonth()->toDateString();
        $end   = now()->endOfMonth()->toDateString();

        $target = SalesTarget::where('user_id', $user->id)
            ->where('period_start', $start)
            ->where('period_end', $end)
            ->first();

        $achievedDeals = Lead::where('company_id', $user->company_id)
            ->where('assigned_to', $user->id)
            ->where('status', 'won')
            ->whereBetween('updated_at', [$start, $end . ' 23:59:59'])
            ->count();

        $achievedValue = (float) Lead::where('company_id', $user->company_id)
            ->where('assigned_to', $user->id)
            ->where('status', 'won')
            ->whereBetween('updated_at', [$start, $end . ' 23:59:59'])
            ->sum('estimated_value');

        return ApiResponse::success([
            'period_start'   => $start,
            'period_end'     => $end,
            'target_value'   => $target ? (float) $target->target_value : null,
            'target_deals'   => $target?->target_deals,
            'achieved_value' => $achievedValue,
            'achieved_deals' => $achievedDeals,
            'can_update'     => $this->can('canUpdateSalesTargets'),
        ]);
    }

    // PUT /user/sales/targets — Seller sets/adjusts their own current-month
    // target. Company Admin management of other sellers' targets isn't part
    // of this endpoint (Admin-side target management, if wanted, is a
    // separate future addition — out of scope here).
    public function upsert(Request $request): JsonResponse
    {
        if (!$this->can('canUpdateSalesTargets')) {
            return ApiResponse::error('Permission denied', 403);
        }

        $user = $this->user();

        $validated = $request->validate([
            'target_value' => ['nullable', 'numeric', 'min:0'],
            'target_deals' => ['nullable', 'integer', 'min:0'],
        ]);

        $start = now()->startOfMonth()->toDateString();
        $end   = now()->endOfMonth()->toDateString();

        $target = SalesTarget::updateOrCreate(
            ['user_id' => $user->id, 'period_start' => $start, 'period_end' => $end],
            [
                'company_id'   => $user->company_id,
                'target_value' => $validated['target_value'] ?? null,
                'target_deals' => $validated['target_deals'] ?? null,
                'created_by'   => $user->id,
            ]
        );

        return ApiResponse::success($target, 'Target updated');
    }
}
