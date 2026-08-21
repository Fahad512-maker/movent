<?php

namespace App\Http\Controllers\Api\User;

use App\Helpers\ApiResponse;
use App\Http\Controllers\Controller;
use App\Models\SupportTicket;
use App\Models\SupportTicketReply;
use App\Models\CompanyUserAssignment;
use App\Models\UserCompanyPermission;
use App\Services\SupportNotificationService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class SupportController extends Controller
{
    private function user() { return auth('sanctum')->user(); }

    // canViewClientSupport/canManageClientSupport are granted under the
    // 'client' catalog module (see App\Services\ModuleCatalog) alongside
    // canViewClients/canManageClientAccess etc.
    private function can(string $permKey): bool
    {
        $user = $this->user();
        return UserCompanyPermission::where('user_id', $user->id)
            ->where('company_id', $user->company_id)
            ->where('module_key', 'client')
            ->where('permission_key', $permKey)
            ->exists();
    }

    private function ticket(int $id): SupportTicket
    {
        return SupportTicket::where('company_id', $this->user()->company_id)->findOrFail($id);
    }

    // GET /user/support
    public function index(Request $request): JsonResponse
    {
        if (!$this->can('canViewClientSupport') && !$this->can('canManageClientSupport')) {
            return ApiResponse::error('Permission denied', 403);
        }

        $q = SupportTicket::where('company_id', $this->user()->company_id)
            ->with(['raisedBy:id,name', 'assignedTo:id,name']);

        if ($request->filled('status'))   $q->where('status', $request->status);
        if ($request->filled('category')) $q->where('category', $request->category);
        if ($request->filled('priority')) $q->where('priority', $request->priority);

        $tickets = $q->orderByDesc('created_at')
            ->get(['id', 'company_id', 'raised_by', 'assigned_to', 'subject', 'category', 'status', 'priority', 'created_at', 'resolved_at']);

        return ApiResponse::success($tickets);
    }

    // GET /user/support/{id}
    public function show(int $id): JsonResponse
    {
        if (!$this->can('canViewClientSupport') && !$this->can('canManageClientSupport')) {
            return ApiResponse::error('Permission denied', 403);
        }

        $ticket = $this->ticket($id)->load(['raisedBy:id,name', 'assignedTo:id,name']);

        $replies = SupportTicketReply::where('ticket_id', $id)
            ->with(['repliedBy:id,name,role_type', 'repliedByAdmin:id,name'])
            ->orderBy('created_at')
            ->get();

        return ApiResponse::success([
            'ticket'  => $ticket,
            'replies' => $replies,
        ]);
    }

    // POST /user/support/{id}/reply
    public function reply(Request $request, int $id): JsonResponse
    {
        if (!$this->can('canManageClientSupport')) {
            return ApiResponse::error('Permission denied', 403);
        }

        $request->validate([
            'message'    => 'nullable|required_without:attachment|string|max:5000',
            'attachment' => 'nullable|file|max:10240',
        ]);

        $ticket = $this->ticket($id);

        $attachmentPath = null;
        $attachmentName = null;
        if ($request->hasFile('attachment')) {
            $file           = $request->file('attachment');
            $attachmentPath = $file->store('support-attachments', 'public');
            $attachmentName = $file->getClientOriginalName();
        }

        $reply = SupportTicketReply::create([
            'ticket_id'       => $id,
            'replied_by'      => $this->user()->id,
            'message'         => $request->message,
            'attachment_path' => $attachmentPath,
            'attachment_name' => $attachmentName,
        ]);

        if ($ticket->status === 'open') {
            $ticket->update(['status' => 'in_progress']);
        }

        SupportNotificationService::notifyClientOnReply($ticket, $reply, $this->user()->name ?? 'Support Team');

        return ApiResponse::success($reply, 'Reply added');
    }

    // PATCH /user/support/{id}/assign
    public function assign(Request $request, int $id): JsonResponse
    {
        if (!$this->can('canManageClientSupport')) {
            return ApiResponse::error('Permission denied', 403);
        }

        $ticket = $this->ticket($id);

        $validated = $request->validate(['user_id' => 'nullable|integer']);

        if (!empty($validated['user_id'])) {
            // Checking the static users.company_id column here would reject
            // any multi-company staff member whose primary company differs
            // from this ticket's — even though they're a genuine, active
            // member of it via company_user_assignments. Validate against
            // that instead (same fix as Admin\SupportController::assign()).
            $exists = CompanyUserAssignment::where('user_id', $validated['user_id'])
                ->where('company_id', $ticket->company_id)
                ->where('status', 'active')
                ->exists();
            if (!$exists) return ApiResponse::error('Selected user is not part of this company.', 422);
        }

        $ticket->update(['assigned_to' => $validated['user_id'] ?? null]);

        return ApiResponse::success($ticket->fresh(['assignedTo:id,name']), 'Ticket assignment updated');
    }

    // PATCH /user/support/{id}/status
    public function updateStatus(Request $request, int $id): JsonResponse
    {
        if (!$this->can('canManageClientSupport')) {
            return ApiResponse::error('Permission denied', 403);
        }

        $ticket = $this->ticket($id);

        $validated = $request->validate(['status' => 'required|in:open,in_progress,resolved,closed']);

        $ticket->update([
            'status'      => $validated['status'],
            'resolved_at' => in_array($validated['status'], ['resolved', 'closed']) ? now() : null,
        ]);

        return ApiResponse::success($ticket->fresh(), 'Ticket status updated');
    }
}
