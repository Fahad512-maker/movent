<?php

namespace App\Http\Controllers\Api\Client;

use App\Helpers\ApiResponse;
use App\Http\Controllers\Controller;
use App\Models\ChatMessage;
use App\Models\ChatParticipant;
use App\Models\Client;
use App\Models\Notification;
use App\Models\Project;
use App\Models\SystemAuditLog;
use App\Services\ProjectClientChatService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Symfony\Component\HttpFoundation\StreamedResponse;

// Per-PROJECT client chat — the "Chat" tab on the Client Portal's project
// page. One conversation per project (see ProjectClientChatService), between
// the client, that project's own linked Seller, and Company Admin. A client
// only ever reaches the chats of projects that are literally theirs
// (project() below scopes by their own client_id rows and notDraft(), exactly
// like Api\Client\ProjectCommentController) — project 12's conversation is
// unreachable from project 13's tab and vice versa.
//
// Distinct from Api\Client\ChatController's single per-CLIENT Sales Chat
// (thread_type='sales'), which stays as-is for pre-sales/account-level talk,
// and from the internal team messenger (thread_type='project_group'), which
// a client can never see from anywhere.
class ProjectChatController extends Controller
{
    private const MAX_FILE_KB = 10240;
    private const ALLOWED_MIMES = 'pdf,doc,docx,xls,xlsx,png,jpg,jpeg,zip';

    private function clientIds(Request $request): array
    {
        $ids = Client::where('user_id', $request->user()->id)->where('portal_access', true)->pluck('id')->toArray();
        if (empty($ids)) abort(404, 'Client not found');
        return $ids;
    }

    private function project(Request $request, int $projectId): Project
    {
        return Project::whereIn('client_id', $this->clientIds($request))->notDraft()->findOrFail($projectId);
    }

    // GET /client/projects/{id}/chat
    public function index(Request $request, int $projectId): JsonResponse
    {
        $project = $this->project($request, $projectId);
        $thread  = ProjectClientChatService::threadFor($project);

        $messages = ChatMessage::where('thread_id', $thread->id)
            ->with(['sender:id,name,role_type', 'senderAdmin:id,name'])
            ->orderBy('sent_at')
            ->get()
            ->each(fn ($m) => $this->applyDeletedTombstone($m))
            // Staff-only "hide" (Api\Admin\ProjectClientChatController and
            // Api\User\ProjectClientChatController's toggleHide()) must stay
            // completely invisible to the client — never expose the column,
            // and never let it affect what they see.
            ->each(fn ($m) => $m->makeHidden('hidden_for_staff'));

        ChatParticipant::where('thread_id', $thread->id)
            ->where('user_id', $request->user()->id)
            ->update(['last_read_at' => now()]);

        $thread->load('participants.user:id,name,role_type');

        return ApiResponse::success([
            // Who this client may @mention: the Seller, Company Admin, and
            // the Project Manager once the Seller has invited them.
            'mentionables' => ProjectClientChatService::mentionablesFor($thread, $request->user()->id, true),
            'thread' => [
                'id' => $thread->id,
                // The staff side of the conversation, for the header — the
                // client's own row is filtered out (they know who they are)
                // and Company Admin is added as a synthetic entry since it is
                // never a chat_participants row (see ProjectClientChatService).
                'participants' => $thread->participants
                    ->where('user_id', '!=', $request->user()->id)
                    ->map(fn ($p) => ['user_id' => $p->user_id, 'name' => $p->user?->name, 'role_type' => $p->user?->role_type])
                    ->values()
                    ->prepend(['user_id' => null, 'name' => 'Company Admin', 'role_type' => 'admin']),
            ],
            'messages' => $messages,
        ]);
    }

    // POST /client/projects/{id}/chat
    public function store(Request $request, int $projectId): JsonResponse
    {
        $project = $this->project($request, $projectId);
        $thread  = ProjectClientChatService::threadFor($project);

        $validated = $request->validate([
            'content'    => ['nullable', 'string', 'max:2000'],
            'file'       => ['nullable', 'file', 'max:' . self::MAX_FILE_KB, 'mimes:' . self::ALLOWED_MIMES],
            'mentions'   => ['nullable', 'array'],
            'mentions.*' => ['integer'],
        ]);

        if (empty($validated['content']) && !$request->hasFile('file')) {
            return ApiResponse::error('Message or attachment is required.', 422);
        }

        // Anything the client isn't allowed to tag is silently dropped rather
        // than failing the send — see ProjectClientChatService::filterMentions.
        $mentions = ProjectClientChatService::filterMentions(
            $thread,
            $validated['mentions'] ?? null,
            $request->user()->id,
            true
        );

        $attachmentPath = null;
        $attachmentName = null;
        $messageType    = 'text';

        if ($request->hasFile('file')) {
            $file   = $validated['file'];
            $folder = ($project->storage_folder ?: 'companies/' . $project->company_id . '/projects/' . $project->id) . '/client-chat';
            $attachmentPath = $file->store($folder);
            $attachmentName = $file->getClientOriginalName();
            $messageType    = str_starts_with($file->getClientMimeType(), 'image/') ? 'image' : 'file';
        }

        $message = ChatMessage::create([
            'thread_id'       => $thread->id,
            'sender_id'       => $request->user()->id,
            'content'         => $validated['content'] ?? null,
            'mentions'        => $mentions->isNotEmpty() ? $mentions->all() : null,
            'message_type'    => $messageType,
            // Every message in this thread is client-facing by construction —
            // there is no internal slice to hide, unlike the dormant
            // thread_type='project' chat.
            'visibility'      => 'client',
            'attachment_path' => $attachmentPath,
            'attachment_name' => $attachmentName,
            'is_deleted'      => false,
            'sent_at'         => now(),
        ]);

        $thread->update(['last_message_at' => now()]);
        $this->notifyStaff($project, $message, $request->user()->id, $request->user()->name);
        ProjectClientChatService::notifyMentions(
            $project,
            $message,
            $mentions,
            $request->user()->name ?? 'Client',
            $request->user()->id
        );

        return ApiResponse::success($message->load('sender:id,name,role_type'), 'Message sent', 201);
    }

    // A deleted message stays in the list (so everyone keeps seeing it in
    // place, WhatsApp-style) but its content/attachment are wiped — only the
    // `is_deleted` flag survives for the frontend to render the "This message
    // was deleted" placeholder from. Matches Api\User\ProjectMessengerController.
    private function applyDeletedTombstone(ChatMessage $m): void
    {
        if (!$m->is_deleted) return;
        $m->content = null;
        $m->attachment_path = null;
        $m->attachment_name = null;
        $m->mentions = null;
    }

    // DELETE /client/projects/{id}/chat/{messageId} — the client may only
    // delete their own message, same as every other non-Admin side of this
    // conversation. Company Admin's unrestricted "delete any message"
    // authority lives exclusively in Api\Admin\ProjectClientChatController.
    public function deleteMessage(Request $request, int $projectId, int $messageId): JsonResponse
    {
        $project = $this->project($request, $projectId);
        $thread  = ProjectClientChatService::threadFor($project);

        $message = ChatMessage::where('thread_id', $thread->id)->where('is_deleted', false)->findOrFail($messageId);

        if ($message->sender_id !== $request->user()->id) {
            return ApiResponse::error('You can only delete your own messages.', 403);
        }

        $message->update(['is_deleted' => true]);

        return ApiResponse::success(null, 'Message deleted');
    }

    // GET /client/projects/{id}/chat/{messageId}/attachment
    public function downloadAttachment(Request $request, int $projectId, int $messageId): StreamedResponse
    {
        $project = $this->project($request, $projectId);
        $thread  = ProjectClientChatService::existingThreadFor($project);

        if (!$thread) abort(404, 'Attachment not found');

        $message = ChatMessage::where('thread_id', $thread->id)
            ->where('is_deleted', false)
            ->whereNotNull('attachment_path')
            ->findOrFail($messageId);

        return Storage::download($message->attachment_path, $message->attachment_name ?? 'attachment');
    }

    // Notify the project's Seller — the client's actual counterpart here.
    // Company Admin needs no Notification row (not a `users` id): the
    // SystemAuditLog write below already surfaces on Admin's bell, the same
    // convention as Api\Client\ChatController::reply() and
    // Api\Client\ProjectCommentController::notifyStaff().
    private function notifyStaff(Project $project, ChatMessage $message, int $actorUserId, ?string $actorName): void
    {
        $senderName = $actorName ?? 'Client';
        $preview    = $message->content
            ? Str::limit($message->content, 120)
            : '📎 ' . ($message->attachment_name ?? 'sent an attachment');

        $recipients = ChatParticipant::where('thread_id', $message->thread_id)
            ->where('user_id', '!=', $actorUserId)
            ->pluck('user_id');

        foreach ($recipients as $uid) {
            Notification::create([
                'user_id'    => $uid,
                'company_id' => $project->company_id,
                'type'       => 'project_client_chat_message',
                'title'      => "New client message on {$project->name}",
                'body'       => "{$senderName}: {$preview}",
                'data'       => [
                    'project_id' => $project->id,
                    'thread_id'  => $message->thread_id,
                    'message_id' => $message->id,
                    'link'       => "/projects/{$project->id}/client-chat",
                ],
            ]);
        }

        SystemAuditLog::create([
            'company_id'  => $project->company_id,
            'user_id'     => null,
            'action'      => 'project_client_chat_message_sent',
            'module_key'  => 'project_management',
            'entity_type' => 'Project',
            'entity_id'   => $project->id,
            'new_values'  => [
                'thread_id'  => $message->thread_id,
                'message_id' => $message->id,
                'preview'    => $preview,
                'project'    => $project->name,
                'sender'     => $senderName,
            ],
        ]);
    }
}
