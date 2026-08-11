<?php

namespace App\Http\Controllers\Api\Client;

use App\Helpers\ApiResponse;
use App\Http\Controllers\Controller;
use App\Models\ChatMessage;
use App\Models\ChatParticipant;
use App\Models\ChatThread;
use App\Models\Client;
use App\Models\Notification;
use App\Models\SystemAuditLog;
use App\Models\User;
use App\Models\UserCompanyPermission;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Str;

class ChatController extends Controller
{
    // A client can only ever reach a fixed allow-list of company users —
    // never the internal project/production team, HR, or Compliance. This is
    // the single place that computes the allow-list; startChat() re-checks
    // against it server-side so the picker can never be trusted blindly.
    private function client(Request $request): Client
    {
        $client = Client::where('user_id', $request->user()->id)->where('portal_access', true)->first();
        if (!$client) abort(404, 'Client not found');
        return $client;
    }

    // Company Admin (sentinel id 0 — never a real users.id), the linked
    // Seller (account manager, or whoever created/sent one of this client's
    // invoices), and Finance/Invoice users (canRecordPayments) when the
    // client has at least one invoice to discuss. Deliberately excludes the
    // Project Manager — reaches the client via Client-facing Project
    // Comments instead (see Api\Client\ProjectCommentController), not chat.
    private function eligibleContactsFor(Client $client): array
    {
        $contacts = [['type' => 'admin', 'id' => 0, 'name' => 'Company Admin', 'role' => 'admin']];

        $sellerIds = collect([$client->account_manager])
            ->merge($client->invoices()->pluck('created_by'))
            ->merge($client->invoices()->pluck('sent_by'))
            ->filter()->unique();

        $sellers = User::whereIn('id', $sellerIds)->where('is_active', true)->get(['id', 'name', 'role_type']);
        foreach ($sellers as $u) {
            $contacts[] = ['type' => 'user', 'id' => $u->id, 'name' => $u->name, 'role' => $u->role_type];
        }

        if ($client->invoices()->exists()) {
            $financeIds = UserCompanyPermission::where('company_id', $client->company_id)
                ->where('module_key', 'finance')
                ->where('permission_key', 'canRecordPayments')
                ->pluck('user_id');

            $finance = User::whereIn('id', $financeIds)
                ->where('id', '!=', $client->account_manager)
                ->where('is_active', true)
                ->get(['id', 'name', 'role_type']);
            foreach ($finance as $u) {
                $contacts[] = ['type' => 'user', 'id' => $u->id, 'name' => $u->name, 'role' => $u->role_type];
            }
        }

        return $contacts;
    }

    // GET /client/chat/eligible-contacts
    public function eligibleContacts(Request $request): JsonResponse
    {
        $client = $this->client($request);
        return ApiResponse::success($this->eligibleContactsFor($client));
    }

    // POST /client/chat/start { recipient_type: 'admin'|'user', recipient_user_id? }
    public function startChat(Request $request): JsonResponse
    {
        $client = $this->client($request);
        $userId = $request->user()->id;

        $validated = $request->validate([
            'recipient_type'     => 'required|in:admin,user',
            'recipient_user_id'  => 'required_if:recipient_type,user|nullable|integer',
        ]);

        $allowed = collect($this->eligibleContactsFor($client));
        $isAllowed = $validated['recipient_type'] === 'admin'
            ? $allowed->contains(fn ($c) => $c['type'] === 'admin')
            : $allowed->contains(fn ($c) => $c['type'] === 'user' && $c['id'] === (int) $validated['recipient_user_id']);

        if (!$isAllowed) {
            return ApiResponse::error('Client cannot communicate directly with internal project team. Please contact the Project Manager or Support.', 403);
        }

        if ($validated['recipient_type'] === 'admin') {
            $thread = ChatThread::where('thread_type', 'client')
                ->where('company_id', $client->company_id)
                ->where('linked_to_type', 'Client')->where('linked_to_id', $client->id)
                ->withCount('participants')
                ->get()
                ->firstWhere('participants_count', 1);

            if (!$thread) {
                $thread = ChatThread::create([
                    'company_id' => $client->company_id, 'thread_type' => 'client',
                    'linked_to_type' => 'Client', 'linked_to_id' => $client->id,
                    'title' => 'Company Admin', 'created_by' => $userId,
                ]);
                ChatParticipant::create(['thread_id' => $thread->id, 'user_id' => $userId, 'role' => 'member', 'joined_at' => now()]);
            }
        } else {
            $recipientId = (int) $validated['recipient_user_id'];

            $thread = ChatThread::where('thread_type', 'client')
                ->where('company_id', $client->company_id)
                ->whereHas('participants', fn ($q) => $q->where('user_id', $userId))
                ->whereHas('participants', fn ($q) => $q->where('user_id', $recipientId))
                ->withCount('participants')
                ->get()
                ->firstWhere('participants_count', 2);

            if (!$thread) {
                $recipient = User::find($recipientId);
                $thread = ChatThread::create([
                    'company_id' => $client->company_id, 'thread_type' => 'client',
                    'linked_to_type' => 'Client', 'linked_to_id' => $client->id,
                    'title' => $recipient?->name, 'created_by' => $userId,
                ]);
                ChatParticipant::create(['thread_id' => $thread->id, 'user_id' => $userId, 'role' => 'member', 'joined_at' => now()]);
                ChatParticipant::create(['thread_id' => $thread->id, 'user_id' => $recipientId, 'role' => 'member', 'joined_at' => now()]);
            }
        }

        return ApiResponse::success(['thread_id' => $thread->id], 'Chat ready', 201);
    }

    public function threads(Request $request): JsonResponse
    {
        $userId = $request->user()->id;

        $threads = ChatThread::where('thread_type', 'client')
            ->whereHas('participants', fn($q) => $q->where('user_id', $userId))
            ->with(['messages' => fn($q) => $q->orderByDesc('sent_at')->limit(1)])
            ->orderByDesc('last_message_at')
            ->get(['id', 'title', 'thread_type', 'last_message_at']);

        return ApiResponse::success($threads);
    }

    public function messages(Request $request, int $id): JsonResponse
    {
        $userId = $request->user()->id;

        $thread = ChatThread::where('thread_type', 'client')
            ->whereHas('participants', fn($q) => $q->where('user_id', $userId))
            ->findOrFail($id);

        $messages = ChatMessage::where('thread_id', $thread->id)
            ->where('is_deleted', false)
            ->with(['sender:id,name,role_type', 'senderAdmin:id,name'])
            ->orderBy('sent_at')
            ->get();

        return ApiResponse::success($messages);
    }

    public function reply(Request $request, int $id): JsonResponse
    {
        $request->validate([
            'content'    => 'required_without:attachment|nullable|string|max:5000',
            'attachment' => 'nullable|file|max:10240',
        ]);

        $userId = $request->user()->id;

        $thread = ChatThread::where('thread_type', 'client')
            ->whereHas('participants', fn($q) => $q->where('user_id', $userId))
            ->findOrFail($id);

        $attachmentPath = null;
        $attachmentName = null;
        if ($request->hasFile('attachment')) {
            $file           = $request->file('attachment');
            $attachmentPath = $file->store('chat-attachments', 'public');
            $attachmentName = $file->getClientOriginalName();
        }

        $message = ChatMessage::create([
            'thread_id'       => $thread->id,
            'sender_id'       => $userId,
            'content'         => $request->content,
            'message_type'    => $request->hasFile('attachment') ? 'file' : 'text',
            'attachment_path' => $attachmentPath,
            'attachment_name' => $attachmentName,
            'is_deleted'      => false,
            'sent_at'         => now(),
        ]);

        $thread->update(['last_message_at' => now()]);

        // Notify the other side of this specific thread (staff member, if
        // any — a single-participant thread means the other side is Company
        // Admin, who has no user_id). The SystemAuditLog write below always
        // fires regardless, so Admin's bell surfaces every client message
        // the same way it does for Sales Chat.
        $otherParticipant = ChatParticipant::where('thread_id', $thread->id)->where('user_id', '!=', $userId)->first();
        $preview = Str::limit($request->content ?? '📎 sent an attachment', 120);

        if ($otherParticipant) {
            Notification::create([
                'user_id'    => $otherParticipant->user_id,
                'company_id' => $thread->company_id,
                'type'       => 'client_chat_message',
                'title'      => 'New client message',
                'body'       => $preview,
                'data'       => ['thread_id' => $thread->id, 'message_id' => $message->id, 'link' => "/clients/{$thread->linked_to_id}"],
            ]);
        }

        SystemAuditLog::create([
            'company_id'  => $thread->company_id,
            'user_id'     => null,
            'action'      => 'client_chat_message_sent',
            'module_key'  => 'client',
            'entity_type' => 'Client',
            'entity_id'   => $thread->linked_to_id,
            'new_values'  => ['thread_id' => $thread->id, 'message_id' => $message->id, 'preview' => $preview],
        ]);

        return ApiResponse::success($message, 'Message sent');
    }
}
