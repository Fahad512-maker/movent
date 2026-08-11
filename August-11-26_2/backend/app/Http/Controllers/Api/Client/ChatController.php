<?php

namespace App\Http\Controllers\Api\Client;

use App\Helpers\ApiResponse;
use App\Http\Controllers\Controller;
use App\Models\ChatMessage;
use App\Models\ChatThread;
use App\Models\Client;
use App\Models\Notification;
use App\Models\SystemAuditLog;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Str;

// One single conversation per client — Seller <-> Client <-> Company Admin,
// nobody else. Deliberately unified with Api\User\SalesChatController /
// Api\Admin\SalesChatController's exact thread_type='sales' convention
// (linked_to_type='Client', linked_to_id=$client->id) so a message sent from
// either side of the "Sales Chat" tab and this Client Portal page land in the
// SAME thread — previously this used its own separate thread_type='client'
// (with a per-recipient DM picker), which meant the client's messages and
// the Seller/Admin's messages never showed to each other at all.
class ChatController extends Controller
{
    private function client(Request $request): Client
    {
        $client = Client::where('user_id', $request->user()->id)->where('portal_access', true)->first();
        if (!$client) abort(404, 'Client not found');
        return $client;
    }

    private function threadFor(Client $client): ChatThread
    {
        return ChatThread::firstOrCreate(
            ['thread_type' => 'sales', 'linked_to_type' => 'Client', 'linked_to_id' => $client->id],
            ['company_id' => $client->company_id, 'title' => $client->name]
        );
    }

    // GET /client/chat/messages
    public function messages(Request $request): JsonResponse
    {
        $client = $this->client($request);
        $thread = $this->threadFor($client);

        $messages = ChatMessage::where('thread_id', $thread->id)
            ->where('is_deleted', false)
            ->with(['sender:id,name,role_type', 'senderAdmin:id,name'])
            ->orderBy('sent_at')
            ->get();

        return ApiResponse::success($messages);
    }

    // POST /client/chat/reply
    public function reply(Request $request): JsonResponse
    {
        $request->validate([
            'content'    => 'required_without:attachment|nullable|string|max:5000',
            'attachment' => 'nullable|file|max:10240',
        ]);

        $client = $this->client($request);
        $thread = $this->threadFor($client);
        $userId = $request->user()->id;

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
            'visibility'      => 'client',
            'attachment_path' => $attachmentPath,
            'attachment_name' => $attachmentName,
            'is_deleted'      => false,
            'sent_at'         => now(),
        ]);

        $thread->update(['last_message_at' => now()]);

        $preview = Str::limit($request->content ?? '📎 sent an attachment', 120);

        // Notify the linked Seller — mirrors Api\User\SalesChatController::
        // sendClientMessage()'s notifyUserId target exactly. Company Admin
        // needs no Notification row (not a `users` id) — the SystemAuditLog
        // write below already surfaces on Admin's bell.
        if ($client->account_manager) {
            Notification::create([
                'user_id'    => $client->account_manager,
                'company_id' => $thread->company_id,
                'type'       => 'sales_chat_message',
                'title'      => 'New Sales Chat message',
                'body'       => "{$client->name}: {$preview}",
                'data'       => ['thread_id' => $thread->id, 'message_id' => $message->id, 'sender_name' => $client->name, 'link' => "/admin/clients/{$client->id}"],
            ]);
        }

        SystemAuditLog::create([
            'company_id'  => $thread->company_id,
            'user_id'     => null,
            'action'      => 'sales_chat_message_sent',
            'module_key'  => 'sales',
            'entity_type' => 'Client',
            'entity_id'   => $client->id,
            'new_values'  => ['thread_id' => $thread->id, 'message_id' => $message->id, 'preview' => $preview, 'entity' => "client \"{$client->name}\"", 'sender' => $client->name],
        ]);

        return ApiResponse::success($message, 'Message sent');
    }
}
