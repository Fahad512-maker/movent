<?php

namespace App\Http\Controllers\Api\Admin;

use App\Helpers\ApiResponse;
use App\Http\Controllers\Controller;
use App\Models\ChatMessage;
use App\Models\ChatParticipant;
use App\Models\Notification;
use App\Models\Project;
use App\Services\ProjectClientChatService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Symfony\Component\HttpFoundation\StreamedResponse;

// Company Admin half of the per-project CLIENT chat (see
// Api\Client\ProjectChatController and ProjectClientChatService) — the third
// party in every project's Client <-> Seller <-> Company Admin conversation.
//
// Admin reaches EVERY project's client chat in its companies unconditionally
// and is never a chat_participants row (it has no `users` id), exactly the
// convention Api\Admin\ProjectMessengerController and GeneralChatController
// already use. Its messages carry sender_admin_id instead of sender_id, which
// is what both the portal and the Seller's page render as "(Admin)".
class ProjectClientChatController extends Controller
{
    private const MAX_FILE_KB = 10240;
    private const ALLOWED_MIMES = 'pdf,doc,docx,xls,xlsx,png,jpg,jpeg,zip';

    private function admin() { return auth('admin')->user(); }

    private function project(int $projectId): Project
    {
        $companyIds = $this->admin()->companies()->pluck('id');

        return Project::whereIn('company_id', $companyIds)->findOrFail($projectId);
    }

    // GET /admin/projects/{projectId}/client-chat
    public function index(int $projectId): JsonResponse
    {
        $project = $this->project($projectId);
        $thread  = ProjectClientChatService::threadFor($project);

        $messages = ChatMessage::where('thread_id', $thread->id)
            ->where('is_deleted', false)
            ->with(['sender:id,name,role_type', 'senderAdmin:id,name'])
            ->orderBy('sent_at')
            ->get();

        $thread->load('participants.user:id,name,role_type');

        return ApiResponse::success([
            // status drives the composer's draft lock on the page — a draft
            // rejects sends server-side (store()'s isDraft() guard).
            'project'  => ['id' => $project->id, 'name' => $project->name, 'status' => $project->status],
            // Admin may tag everyone in the conversation — but not the
            // "Company Admin" sentinel, which is Admin itself.
            'mentionables' => ProjectClientChatService::mentionablesFor($thread, null, false),
            'thread'   => [
                'id' => $thread->id,
                'participants' => $thread->participants->map(fn ($p) => [
                    'user_id' => $p->user_id, 'name' => $p->user?->name, 'role_type' => $p->user?->role_type,
                ])->values(),
            ],
            'messages' => $messages,
        ]);
    }

    // POST /admin/projects/{projectId}/client-chat
    public function store(Request $request, int $projectId): JsonResponse
    {
        $project = $this->project($projectId);

        if ($project->isDraft()) {
            return ApiResponse::error(Project::DRAFT_BLOCKED_MESSAGE, 422);
        }

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

        // No actor user id — Admin isn't a `users` row — and no Admin
        // sentinel, since that would be tagging itself.
        $mentions = ProjectClientChatService::filterMentions(
            $thread,
            $validated['mentions'] ?? null,
            null,
            false
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
            'sender_admin_id' => $this->admin()->id,
            'content'         => $validated['content'] ?? null,
            'mentions'        => $mentions->isNotEmpty() ? $mentions->all() : null,
            'message_type'    => $messageType,
            'visibility'      => 'client',
            'attachment_path' => $attachmentPath,
            'attachment_name' => $attachmentName,
            'is_deleted'      => false,
            'sent_at'         => now(),
        ]);

        $thread->update(['last_message_at' => now()]);
        $this->notifyOthers($project, $message);
        ProjectClientChatService::notifyMentions(
            $project,
            $message,
            $mentions,
            ($this->admin()->name ?? 'Company Admin') . ' (Admin)',
            null,
            $this->admin()->id
        );

        return ApiResponse::success($message->load('senderAdmin:id,name'), 'Message sent', 201);
    }

    // GET /admin/projects/{projectId}/client-chat/{messageId}/attachment
    public function downloadAttachment(int $projectId, int $messageId): StreamedResponse
    {
        $project = $this->project($projectId);
        $thread  = ProjectClientChatService::existingThreadFor($project);

        if (!$thread) abort(404, 'Attachment not found');

        $message = ChatMessage::where('thread_id', $thread->id)
            ->where('is_deleted', false)
            ->whereNotNull('attachment_path')
            ->findOrFail($messageId);

        return Storage::download($message->attachment_path, $message->attachment_name ?? 'attachment');
    }

    // Both `users`-backed sides of the conversation — the client (portal
    // bell, deep-linked to the project's own Chat tab) and the project's
    // Seller (staff bell). No SystemAuditLog row here: Admin is the actor, so
    // the entry would only ever notify Admin of its own message.
    private function notifyOthers(Project $project, ChatMessage $message): void
    {
        $senderName = ($this->admin()->name ?? 'Company Admin');
        $preview    = $message->content
            ? Str::limit($message->content, 120)
            : '📎 ' . ($message->attachment_name ?? 'sent an attachment');

        $clientUserId = ProjectClientChatService::clientUserId($project);

        foreach (ChatParticipant::where('thread_id', $message->thread_id)->pluck('user_id') as $uid) {
            Notification::create([
                'user_id'    => $uid,
                'company_id' => $project->company_id,
                'type'       => 'project_client_chat_message',
                'title'      => "New message on {$project->name}",
                'body'       => "{$senderName} (Admin): {$preview}",
                'data'       => [
                    'project_id' => $project->id,
                    'thread_id'  => $message->thread_id,
                    'message_id' => $message->id,
                    'link'       => $uid === $clientUserId
                        ? "/client/projects/{$project->id}?tab=chat"
                        : "/projects/{$project->id}/client-chat",
                ],
            ]);
        }
    }
}
