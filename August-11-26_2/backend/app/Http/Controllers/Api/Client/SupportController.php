<?php

namespace App\Http\Controllers\Api\Client;

use App\Helpers\ApiResponse;
use App\Http\Controllers\Controller;
use App\Models\Client;
use App\Models\SupportTicket;
use App\Models\SupportTicketReply;
use App\Models\UserCompanyPermission;
use App\Services\NotificationService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Str;

class SupportController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $client = Client::where('user_id', $request->user()->id)->firstOrFail();

        $tickets = SupportTicket::where('raised_by', $request->user()->id)
            ->where('company_id', $client->company_id)
            ->orderByDesc('created_at')
            ->get(['id', 'subject', 'category', 'status', 'priority', 'created_at', 'resolved_at']);

        return ApiResponse::success($tickets);
    }

    public function store(Request $request): JsonResponse
    {
        $request->validate([
            'subject'     => 'required|string|max:255',
            'category'    => 'required|in:billing,technical,project,general',
            'priority'    => 'required|in:low,medium,high',
            'description' => 'nullable|string|max:5000',
            'attachment'  => 'nullable|file|max:10240',
        ]);

        $client = Client::where('user_id', $request->user()->id)->firstOrFail();

        $attachmentPath = null;
        $attachmentName = null;
        if ($request->hasFile('attachment')) {
            $file           = $request->file('attachment');
            $attachmentPath = $file->store('support-attachments', 'public');
            $attachmentName = $file->getClientOriginalName();
        }

        $ticket = SupportTicket::create([
            'company_id'       => $client->company_id,
            'raised_by'        => $request->user()->id,
            'subject'          => $request->subject,
            'category'         => $request->category,
            'priority'         => $request->priority,
            'description'      => $request->description,
            'status'           => 'open',
            'attachment_path'  => $attachmentPath,
            'attachment_name'  => $attachmentName,
        ]);

        $this->notifyStaff($ticket, "New support ticket: {$ticket->subject}", $client->name . ' raised a new support ticket');

        return ApiResponse::success($ticket, 'Support ticket raised successfully', 201);
    }

    public function show(Request $request, int $id): JsonResponse
    {
        $ticket = SupportTicket::where('id', $id)
            ->where('raised_by', $request->user()->id)
            ->with([
                'raisedBy:id,name',
                'assignedTo:id,name',
            ])
            ->firstOrFail();

        $replies = SupportTicketReply::where('ticket_id', $id)
            ->with(['repliedBy:id,name,role_type', 'repliedByAdmin:id,name'])
            ->orderBy('created_at')
            ->get();

        return ApiResponse::success([
            'ticket'  => $ticket,
            'replies' => $replies,
        ]);
    }

    public function reply(Request $request, int $id): JsonResponse
    {
        $request->validate([
            'message'    => 'required|string|max:5000',
            'attachment' => 'nullable|file|max:10240',
        ]);

        $client = Client::where('user_id', $request->user()->id)->firstOrFail();

        $ticket = SupportTicket::where('id', $id)
            ->where('raised_by', $request->user()->id)
            ->firstOrFail();

        if (in_array($ticket->status, ['resolved', 'closed'])) {
            return ApiResponse::error('This ticket is closed. Please raise a new ticket.', 422);
        }

        $attachmentPath = null;
        $attachmentName = null;
        if ($request->hasFile('attachment')) {
            $file           = $request->file('attachment');
            $attachmentPath = $file->store('support-attachments', 'public');
            $attachmentName = $file->getClientOriginalName();
        }

        $reply = SupportTicketReply::create([
            'ticket_id'       => $id,
            'replied_by'      => $request->user()->id,
            'message'         => $request->message,
            'attachment_path' => $attachmentPath,
            'attachment_name' => $attachmentName,
        ]);

        $this->notifyStaff($ticket, "New reply on ticket: {$ticket->subject}", $client->name . ': ' . Str::limit($request->message, 120));

        return ApiResponse::success($reply, 'Reply added');
    }

    // Notify the assigned staff member if the ticket has one, otherwise every
    // staff member holding canManageClientSupport — plus every Company Admin
    // (admins always see it via their notification bell, no permission needed).
    private function notifyStaff(SupportTicket $ticket, string $title, string $body): void
    {
        $recipients = collect();

        if ($ticket->assigned_to) {
            $recipients->push(['user_id' => $ticket->assigned_to]);
        } else {
            $staffIds = UserCompanyPermission::where('company_id', $ticket->company_id)
                ->where('module_key', 'client')
                ->where('permission_key', 'canManageClientSupport')
                ->pluck('user_id')
                ->unique();

            foreach ($staffIds as $uid) {
                $recipients->push(['user_id' => $uid]);
            }
        }

        NotificationService::sendToMany($recipients->all(), [
            'company_id'  => $ticket->company_id,
            'type'        => 'support_ticket',
            'module'      => 'client',
            'title'       => $title,
            'message'     => $body,
            'entity_type' => 'SupportTicket',
            'entity_id'   => $ticket->id,
            'url'         => "/support/{$ticket->id}",
        ]);

        NotificationService::notifyCompanyAdmins($ticket->company_id, null, [
            'type'        => 'support_ticket',
            'module'      => 'client',
            'title'       => $title,
            'message'     => $body,
            'entity_type' => 'SupportTicket',
            'entity_id'   => $ticket->id,
            'url'         => "/admin/support/{$ticket->id}",
        ]);
    }
}
