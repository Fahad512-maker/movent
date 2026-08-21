<?php

namespace App\Http\Controllers\Api\User;

use App\Helpers\ApiResponse;
use App\Http\Controllers\Controller;
use App\Models\FollowUp;
use App\Models\Lead;
use App\Models\UserCompanyPermission;
use App\Support\PermissionDebug;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class FollowUpController extends Controller
{
    private function user()     { return auth('sanctum')->user(); }
    private function userName(): string { return $this->user()->name ?? 'User'; }

    private function can(string $permKey): bool
    {
        $user = $this->user();
        $result = UserCompanyPermission::where('user_id', $user->id)
            ->where('company_id', $user->company_id)
            ->where('module_key', 'sales')
            ->where('permission_key', $permKey)
            ->exists();
        PermissionDebug::log($user->id, $user->company_id, $user->role_type, 'sales', $permKey, $result);
        return $result;
    }

    // GET /user/follow-ups
    public function queue(Request $request): JsonResponse
    {
        if (!$this->can('canViewLeads')) {
            return ApiResponse::error('Permission denied', 403);
        }

        $companyId = $this->user()->company_id;
        $filter    = $request->get('filter', 'today'); // today | upcoming | overdue | all
        $today     = now()->toDateString();

        // Deliberately not status-scoped to 'pending' — a follow-up marked
        // completed/missed must keep showing here (with its real status,
        // handled by the frontend) for whichever date bucket it was
        // scheduled in, the same as it still shows on the Lead detail page's
        // own follow-up list, which is never status-filtered either. Before
        // this, completing/missing a follow-up just made it vanish from
        // this queue entirely.
        $q = FollowUp::where('company_id', $companyId)
            ->with(['lead:id,name,status', 'assignedTo:id,name'])
            ->orderBy('scheduled_at');

        match($filter) {
            'today'    => $q->whereDate('scheduled_at', $today),
            'overdue'  => $q->whereDate('scheduled_at', '<', $today),
            'upcoming' => $q->whereDate('scheduled_at', '>', $today),
            default    => null,
        };

        return ApiResponse::success([
            'follow_ups' => $q->get()->map(fn($f) => $this->fmt($f)),
            'counts' => [
                'today'    => FollowUp::where('company_id', $companyId)->where('status', 'pending')->whereDate('scheduled_at', $today)->count(),
                'overdue'  => FollowUp::where('company_id', $companyId)->where('status', 'pending')->whereDate('scheduled_at', '<', $today)->count(),
                'upcoming' => FollowUp::where('company_id', $companyId)->where('status', 'pending')->whereDate('scheduled_at', '>', $today)->count(),
            ],
        ]);
    }

    // POST /user/leads/{leadId}/follow-ups — was previously reachable only
    // via the admin guard; the frontend's "Add Follow-up" button/modal on
    // the Lead detail page hard-blocked non-admins with "Add follow-ups
    // from admin panel" despite complete()/miss()/cancel() below already
    // working for a Seller. Mirrors Api\Admin\FollowUpController::store()
    // exactly, gated the same as this controller's own complete()/miss()/
    // cancel() (canEditLeads), just company-scoped instead of admin-guard-
    // unrestricted.
    public function store(Request $request, int $leadId): JsonResponse
    {
        if (!$this->can('canEditLeads')) {
            return ApiResponse::error('Permission denied', 403);
        }

        $user = $this->user();
        $lead = Lead::where('company_id', $user->company_id)->findOrFail($leadId);

        $validated = $request->validate([
            'type'             => ['required', 'in:call,email,meeting,whatsapp,demo,other'],
            'scheduled_at'     => ['required', 'date'],
            'notes'            => ['nullable', 'string'],
            'assigned_to'      => ['nullable', 'integer', 'exists:users,id'],
            'reminder_enabled' => ['boolean'],
        ]);

        $validated['lead_id']    = $lead->id;
        $validated['company_id'] = $lead->company_id;
        $validated['created_by'] = $user->id;
        $validated['status']     = 'pending';

        $fu = FollowUp::create($validated);
        $fu->load('assignedTo:id,name');

        $scheduled = $fu->scheduled_at->toDateString();
        if (!$lead->next_followup_date || $scheduled < $lead->next_followup_date->toDateString()) {
            $lead->update(['next_followup_date' => $scheduled]);
        }

        $lead->logActivity('followup_added',
            "Follow-up ({$fu->type}) scheduled for " . $fu->scheduled_at->format('d M Y H:i'),
            $this->userName(), ['followup_id' => $fu->id, 'type' => $fu->type]);

        return ApiResponse::success($this->fmt($fu), 'Follow-up added', 201);
    }

    // PATCH /user/follow-ups/{id}/complete
    public function complete(int $id): JsonResponse
    {
        if (!$this->can('canEditLeads')) {
            return ApiResponse::error('Permission denied', 403);
        }

        $fu = FollowUp::where('company_id', $this->user()->company_id)->findOrFail($id);
        $fu->update(['status' => 'completed', 'completed_at' => now()]);

        $fu->lead->logActivity('followup_completed',
            "Follow-up ({$fu->type}) marked as completed",
            $this->userName(), ['followup_id' => $fu->id]);

        $fu->load('assignedTo:id,name');
        return ApiResponse::success($this->fmt($fu));
    }

    // PATCH /user/follow-ups/{id}/miss
    public function miss(int $id): JsonResponse
    {
        if (!$this->can('canEditLeads')) {
            return ApiResponse::error('Permission denied', 403);
        }

        $fu = FollowUp::where('company_id', $this->user()->company_id)->findOrFail($id);
        $fu->update(['status' => 'missed']);
        $fu->load('assignedTo:id,name');
        return ApiResponse::success($this->fmt($fu));
    }

    // PATCH /user/follow-ups/{id}/cancel
    public function cancel(int $id): JsonResponse
    {
        if (!$this->can('canEditLeads')) {
            return ApiResponse::error('Permission denied', 403);
        }

        $fu = FollowUp::where('company_id', $this->user()->company_id)->findOrFail($id);
        $fu->update(['status' => 'cancelled']);
        $fu->load('assignedTo:id,name');
        return ApiResponse::success($this->fmt($fu));
    }

    private function fmt(FollowUp $f): array
    {
        return [
            'id'               => $f->id,
            'lead_id'          => $f->lead_id,
            'lead_name'        => $f->lead?->name,
            'lead_status'      => $f->lead?->status,
            'type'             => $f->type,
            'scheduled_at'     => $f->scheduled_at->toDateTimeString(),
            'completed_at'     => $f->completed_at?->toDateTimeString(),
            'notes'            => $f->notes,
            'status'           => $f->status,
            'reminder_enabled' => $f->reminder_enabled,
            'assigned_to'      => $f->assigned_to,
            'assigned_user'    => $f->assignedTo ? ['id' => $f->assignedTo->id, 'name' => $f->assignedTo->name] : null,
            'created_at'       => $f->created_at->toDateTimeString(),
        ];
    }
}
