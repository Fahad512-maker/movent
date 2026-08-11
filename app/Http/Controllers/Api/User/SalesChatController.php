<?php

namespace App\Http\Controllers\Api\User;

use App\Helpers\ApiResponse;
use App\Http\Controllers\Controller;
use App\Models\ChatMessage;
use App\Models\ChatParticipant;
use App\Models\ChatThread;
use App\Models\Client;
use App\Models\Lead;
use App\Models\Notification;
use App\Models\SystemAuditLog;
use App\Models\UserCompanyPermission;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Symfony\Component\HttpFoundation\StreamedResponse;

// "Sales Chat" — a Seller's own conversation surface for a specific Lead or
// Client, kept entirely separate from Internal/Client-facing Project Chat
// (Api\User\ProjectChatController). Reuses the same generic chat_threads/
// chat_messages/chat_participants tables via thread_type='sales' +
// linked_to_type='Lead'|'Client' (linked_to_type was defined on chat_threads
// from day one but never actually used until now).
class SalesChatController extends Controller
{
    private const MAX_FILE_KB = 10240; // 10 MB per file
    private const ALLOWED_MIMES = 'pdf,doc,docx,xls,xlsx,png,jpg,jpeg,zip';

    private function user() { return auth('sanctum')->user(); }

    private function can(string $permKey, string $moduleKey = 'sales'): bool
    {
        $user = $this->user();
        return UserCompanyPermission::where('user_id', $user->id)
            ->where('company_id', $user->company_id)
            ->where('module_key', $moduleKey)
            ->where('permission_key', $permKey)
            ->exists();
    }

    // Sales Chat is Seller <-> Client (<-> Company Admin, unrestricted on its
    // own guard) only — never any other internal role. canUseSalesChat alone
    // isn't a strong enough gate: it's a real, grantable permission key, so a
    // Company Admin could otherwise hand it to e.g. a Lead Manager, who
    // already holds canViewAllCompanyLeads by default and would then reach
    // ANY company client's thread, not just their own. Hard role_type check,
    // same defense-in-depth pattern as isPM()/isInternalStaff() elsewhere in
    // this codebase (Api\User\ProjectMessengerController/ProjectCommentController).
    private function isSeller(): bool
    {
        return $this->user()->role_type === 'seller';
    }

    // Same scope Api\User\LeadController::visibleLeads() uses.
    private function lead(int $leadId): Lead
    {
        $user = $this->user();
        $base = Lead::where('company_id', $user->company_id);

        if (!$this->can('canViewAllCompanyLeads')) {
            $base->where(fn($q) => $q->where('assigned_to', $user->id)->orWhere('transferred_to', $user->id));
        }

        return $base->findOrFail($leadId);
    }

    // A Seller's "own clients": they're the account manager, OR the client
    // originated from one of their own leads, OR they hold the company-wide
    // lead/client override.
    private function client(int $clientId): Client
    {
        $user = $this->user();
        $base = Client::where('company_id', $user->company_id);

        if (!$this->can('canViewAllCompanyLeads')) {
            $base->where(function ($q) use ($user) {
                $q->where('account_manager', $user->id)
                  ->orWhereHas('lead', fn($l) => $l->where(fn($q2) => $q2->where('assigned_to', $user->id)->orWhere('transferred_to', $user->id)));
            });
        }

        return $base->findOrFail($clientId);
    }

    private function threadFor(string $linkedType, int $linkedId, int $companyId, string $title): ChatThread
    {
        $thread = ChatThread::firstOrCreate(
            ['thread_type' => 'sales', 'linked_to_type' => $linkedType, 'linked_to_id' => $linkedId],
            ['company_id' => $companyId, 'title' => $title, 'created_by' => $this->user()->id]
        );

        ChatParticipant::firstOrCreate(
            ['thread_id' => $thread->id, 'user_id' => $this->user()->id],
            ['role' => 'member', 'joined_at' => now()]
        );

        return $thread;
    }

    public function leadMessages(int $leadId): JsonResponse
    {
        if (!$this->isSeller() || !$this->can('canUseSalesChat')) {
            return ApiResponse::error('Permission denied', 403);
        }

        $lead = $this->lead($leadId);
        $thread = $this->threadFor('Lead', $lead->id, $lead->company_id, $lead->name);

        return ApiResponse::success(['thread_id' => $thread->id, 'messages' => $this->messages($thread->id)]);
    }

    public function sendLeadMessage(Request $request, int $leadId): JsonResponse
    {
        if (!$this->isSeller() || !$this->can('canUseSalesChat')) {
            return ApiResponse::error('Permission denied', 403);
        }

        $lead = $this->lead($leadId);
        $thread = $this->threadFor('Lead', $lead->id, $lead->company_id, $lead->name);

        return $this->send($request, $thread, $lead->company_id, "/leads/{$lead->id}", "lead \"{$lead->name}\"",
            $lead->assigned_to);
    }

    public function downloadLeadAttachment(int $leadId, int $messageId): StreamedResponse
    {
        if (!$this->isSeller() || !$this->can('canUseSalesChat')) {
            abort(403, 'Permission denied');
        }

        $lead = $this->lead($leadId);
        $thread = ChatThread::where('thread_type', 'sales')->where('linked_to_type', 'Lead')->where('linked_to_id', $lead->id)->firstOrFail();

        return $this->download($thread->id, $messageId);
    }

    public function clientMessages(int $clientId): JsonResponse
    {
        if (!$this->isSeller() || !$this->can('canUseSalesChat')) {
            return ApiResponse::error('Permission denied', 403);
        }

        $client = $this->client($clientId);
        $thread = $this->threadFor('Client', $client->id, $client->company_id, $client->name);

        return ApiResponse::success(['thread_id' => $thread->id, 'messages' => $this->messages($thread->id)]);
    }

    public function sendClientMessage(Request $request, int $clientId): JsonResponse
    {
        if (!$this->isSeller() || !$this->can('canUseSalesChat')) {
            return ApiResponse::error('Permission denied', 403);
        }

        $client = $this->client($clientId);
        $thread = $this->threadFor('Client', $client->id, $client->company_id, $client->name);

        return $this->send($request, $thread, $client->company_id, "/clients/{$client->id}", "client \"{$client->name}\"",
            $client->account_manager);
    }

    public function downloadClientAttachment(int $clientId, int $messageId): StreamedResponse
    {
        if (!$this->isSeller() || !$this->can('canUseSalesChat')) {
            abort(403, 'Permission denied');
        }

        $client = $this->client($clientId);
        $thread = ChatThread::where('thread_type', 'sales')->where('linked_to_type', 'Client')->where('linked_to_id', $client->id)->firstOrFail();

        return $this->download($thread->id, $messageId);
    }

    private function messages(int $threadId)
    {
        return ChatMessage::where('thread_id', $threadId)
            ->where('is_deleted', false)
            ->with(['sender:id,name', 'senderAdmin:id,name'])
            ->orderBy('sent_at')
            ->get();
    }

    private function download(int $threadId, int $messageId): StreamedResponse
    {
        $message = ChatMessage::where('thread_id', $threadId)->whereNotNull('attachment_path')->findOrFail($messageId);

        return Storage::download($message->attachment_path, $message->attachment_name ?? 'attachment');
    }

    private function send(Request $request, ChatThread $thread, int $companyId, string $link, string $entityLabel, ?int $notifyUserId): JsonResponse
    {
        $validated = $request->validate([
            'content' => ['nullable', 'string', 'max:2000'],
            'file'    => ['nullable', 'file', 'max:' . self::MAX_FILE_KB, 'mimes:' . self::ALLOWED_MIMES],
        ]);

        if (empty($validated['content']) && !$request->hasFile('file')) {
            return ApiResponse::error('Message or attachment is required.', 422);
        }

        $attachmentPath = null;
        $attachmentName = null;
        $messageType    = 'text';

        if ($request->hasFile('file')) {
            $file = $validated['file'];
            $folder = 'companies/' . $companyId . '/sales-chat/' . $thread->linked_to_type . '-' . $thread->linked_to_id;
            $attachmentPath = $file->store($folder);
            $attachmentName = $file->getClientOriginalName();
            $messageType    = str_starts_with($file->getClientMimeType(), 'image/') ? 'image' : 'file';
        }

        $message = ChatMessage::create([
            'thread_id'       => $thread->id,
            'sender_id'       => $this->user()->id,
            'content'         => $validated['content'] ?? null,
            'message_type'    => $messageType,
            'visibility'      => 'client',
            'attachment_path' => $attachmentPath,
            'attachment_name' => $attachmentName,
            'sent_at'         => now(),
        ]);

        $thread->update(['last_message_at' => now()]);

        $this->notifyAndLog($thread, $message, $companyId, $link, $entityLabel, $notifyUserId);

        return ApiResponse::success($message->load('sender:id,name'), 'Message sent', 201);
    }

    private function notifyAndLog(ChatThread $thread, ChatMessage $message, int $companyId, string $link, string $entityLabel, ?int $notifyUserId): void
    {
        $actorId    = $this->user()->id;
        $senderName = $message->sender?->name ?? $message->senderAdmin?->name ?? 'Someone';
        $preview    = $message->content
            ? Str::limit($message->content, 120)
            : '📎 ' . ($message->attachment_name ?? 'sent an attachment');

        if ($notifyUserId && $notifyUserId !== $actorId) {
            Notification::create([
                'user_id'    => $notifyUserId,
                'company_id' => $companyId,
                'type'       => 'sales_chat_message',
                'title'      => 'New Sales Chat message',
                'body'       => "{$senderName}: {$preview}",
                'data'       => ['thread_id' => $thread->id, 'message_id' => $message->id, 'sender_name' => $senderName, 'link' => $link],
            ]);
        }

        SystemAuditLog::create([
            'company_id'  => $companyId,
            'user_id'     => $actorId,
            'action'      => 'sales_chat_message_sent',
            'module_key'  => 'sales',
            'entity_type' => $thread->linked_to_type,
            'entity_id'   => $thread->linked_to_id,
            'new_values'  => ['thread_id' => $thread->id, 'message_id' => $message->id, 'preview' => $preview, 'entity' => $entityLabel, 'sender' => $senderName],
        ]);
    }
}
