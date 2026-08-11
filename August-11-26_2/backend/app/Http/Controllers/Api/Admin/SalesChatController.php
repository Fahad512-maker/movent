<?php

namespace App\Http\Controllers\Api\Admin;

use App\Helpers\ApiResponse;
use App\Http\Controllers\Controller;
use App\Models\ChatMessage;
use App\Models\ChatThread;
use App\Models\Client;
use App\Models\Lead;
use App\Models\Notification;
use App\Models\SystemAuditLog;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Symfony\Component\HttpFoundation\StreamedResponse;

// Admin-side mirror of Api\User\SalesChatController — Company Admin is
// unrestricted (same pattern as Api\Admin\ProjectChatController), scoped
// only to companies the admin owns, not to a specific lead/client ownership.
class SalesChatController extends Controller
{
    private const MAX_FILE_KB = 10240;
    private const ALLOWED_MIMES = 'pdf,doc,docx,xls,xlsx,png,jpg,jpeg,zip';

    private function admin() { return auth('admin')->user(); }
    private function companyIds(): array { return $this->admin()->companies()->pluck('id')->toArray(); }

    private function threadFor(string $linkedType, int $linkedId, int $companyId, string $title): ChatThread
    {
        return ChatThread::firstOrCreate(
            ['thread_type' => 'sales', 'linked_to_type' => $linkedType, 'linked_to_id' => $linkedId],
            ['company_id' => $companyId, 'title' => $title]
        );
    }

    public function leadMessages(int $leadId): JsonResponse
    {
        $lead = Lead::whereIn('company_id', $this->companyIds())->findOrFail($leadId);
        $thread = $this->threadFor('Lead', $lead->id, $lead->company_id, $lead->name);

        return ApiResponse::success(['thread_id' => $thread->id, 'messages' => $this->messages($thread->id)]);
    }

    public function sendLeadMessage(Request $request, int $leadId): JsonResponse
    {
        $lead = Lead::whereIn('company_id', $this->companyIds())->findOrFail($leadId);
        $thread = $this->threadFor('Lead', $lead->id, $lead->company_id, $lead->name);

        return $this->send($request, $thread, $lead->company_id, "/admin/leads/{$lead->id}", "lead \"{$lead->name}\"", $lead->assigned_to);
    }

    public function downloadLeadAttachment(int $leadId, int $messageId): StreamedResponse
    {
        $lead = Lead::whereIn('company_id', $this->companyIds())->findOrFail($leadId);
        $thread = ChatThread::where('thread_type', 'sales')->where('linked_to_type', 'Lead')->where('linked_to_id', $lead->id)->firstOrFail();

        return $this->download($thread->id, $messageId);
    }

    public function clientMessages(int $clientId): JsonResponse
    {
        $client = Client::whereIn('company_id', $this->companyIds())->findOrFail($clientId);
        $thread = $this->threadFor('Client', $client->id, $client->company_id, $client->name);

        return ApiResponse::success(['thread_id' => $thread->id, 'messages' => $this->messages($thread->id)]);
    }

    public function sendClientMessage(Request $request, int $clientId): JsonResponse
    {
        $client = Client::whereIn('company_id', $this->companyIds())->findOrFail($clientId);
        $thread = $this->threadFor('Client', $client->id, $client->company_id, $client->name);

        return $this->send($request, $thread, $client->company_id, "/admin/clients/{$client->id}", "client \"{$client->name}\"", $client->account_manager);
    }

    public function downloadClientAttachment(int $clientId, int $messageId): StreamedResponse
    {
        $client = Client::whereIn('company_id', $this->companyIds())->findOrFail($clientId);
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
            'sender_admin_id' => $this->admin()->id,
            'content'         => $validated['content'] ?? null,
            'message_type'    => $messageType,
            'visibility'      => 'client',
            'attachment_path' => $attachmentPath,
            'attachment_name' => $attachmentName,
            'sent_at'         => now(),
        ]);

        $thread->update(['last_message_at' => now()]);

        $this->notifyAndLog($thread, $message, $companyId, $link, $entityLabel, $notifyUserId);

        return ApiResponse::success($message->load('senderAdmin:id,name'), 'Message sent', 201);
    }

    private function notifyAndLog(ChatThread $thread, ChatMessage $message, int $companyId, string $link, string $entityLabel, ?int $notifyUserId): void
    {
        $senderName = $message->senderAdmin?->name ?? $message->sender?->name ?? 'Someone';
        $preview    = $message->content
            ? Str::limit($message->content, 120)
            : '📎 ' . ($message->attachment_name ?? 'sent an attachment');

        if ($notifyUserId) {
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
            'user_id'     => null,
            'action'      => 'sales_chat_message_sent',
            'module_key'  => 'sales',
            'entity_type' => $thread->linked_to_type,
            'entity_id'   => $thread->linked_to_id,
            'new_values'  => ['thread_id' => $thread->id, 'message_id' => $message->id, 'preview' => $preview, 'entity' => $entityLabel, 'sender' => $senderName],
        ]);
    }
}
