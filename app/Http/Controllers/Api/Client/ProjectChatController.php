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
use App\Models\User;
use App\Services\ProjectChatService;
use App\Services\ProjectClientChatService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Symfony\Component\HttpFoundation\StreamedResponse;

// Per-PROJECT client chat — the "Chat" tab on the Client Portal's project
// page. One conversation per project (see ProjectChatService), between the
// client, that project's own linked Seller, and Company Admin. A client only
// ever reaches the chats of projects that are literally theirs (project()
// below scopes by their own client_id rows and notDraft(), exactly like
// Api\Client\ProjectCommentController) — project 12's conversation is
// unreachable from project 13's tab and vice versa.
//
// 2026-08-15: this used to read/write its OWN thread (thread_type=
// 'project_client', via ProjectClientChatService) — a separate conversation
// from the internal team's. That feature is retired (its data stays intact,
// untouched, for history — see Api\Admin\ProjectClientChatController /
// Api\User\ProjectClientChatController, still fully functional but no longer
// linked from any nav/button). The Client now shares the SAME thread as the
// internal team (thread_type='project_group', ProjectChatService) — but only
// ever sees/sends messages with visibility='client', never the team's
// internal ones. Being a chat_participants row here (see
// ProjectChatService::addClient(), called from the Admin/PM side's own
// show()) is what makes them @mentionable and notification-eligible; it is
// NOT a license to read the internal thread — that's enforced by the
// visibility filter below, and independently by Api\User\
// ProjectMessengerController::project() hard-blocking role_type='client'
// outright as defense in depth.
//
// Distinct from Api\Client\ChatController's single per-CLIENT Sales Chat
// (thread_type='sales'), which stays as-is for pre-sales/account-level talk.
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

    // Who the client sees/may @mention from this side of the conversation:
    // Company Admin (synthetic — never a real chat_participants row), this
    // project's Seller, and its PM(s) — deliberately NOT the wider internal
    // team (Developer/QA/Designer/Production/plain team members), even
    // though they're all genuine participants of the underlying thread now.
    // Reuses ProjectClientChatService::invitablePmIds() — its "who counts as
    // this project's PM" logic (project_manager_id, or a team member tagged
    // role_in_project='project_manager', or a team member whose own account
    // is role_type='project_manager'; never a Seller) is unrelated to which
    // thread the conversation lives in.
    private function staffParticipants(Project $project)
    {
        $ids = ProjectClientChatService::invitablePmIds($project);
        if ($project->seller_id) {
            $ids = $ids->push($project->seller_id);
        }
        $ids = $ids->filter()->unique()->values();

        return User::whereIn('id', $ids)->get(['id', 'name', 'role_type'])
            ->map(fn ($u) => ['user_id' => $u->id, 'name' => $u->name, 'role_type' => $u->role_type])
            ->values();
    }

    // GET /client/projects/{id}/chat
    public function index(Request $request, int $projectId): JsonResponse
    {
        $project = $this->project($request, $projectId);
        // Read-only — a client must never be able to cause the internal
        // thread to spring into existence just by opening this tab (mirrors
        // ProjectChatService::threadFor()'s own "PM-tier/Admin only" rule).
        // No thread yet simply means nobody on staff has opened Project Chat
        // for this project — an empty conversation, not an error.
        $thread = ProjectChatService::existingThreadFor($project);

        $messages = $thread
            ? ChatMessage::where('thread_id', $thread->id)
                ->where('visibility', 'client')
                ->with(['sender:id,name,role_type', 'senderAdmin:id,name'])
                ->orderBy('sent_at')
                ->get()
                ->each(fn ($m) => $this->applyDeletedTombstone($m))
                // Staff-only "hide" (the retired Chat-with-Client feature's
                // toggleHide()) is a column on the same shared chat_messages
                // table — never actually set on a project_group row, but
                // stripped defensively all the same so it can never leak here.
                ->each(fn ($m) => $m->makeHidden('hidden_for_staff'))
            : collect();

        if ($thread) {
            ChatParticipant::where('thread_id', $thread->id)
                ->where('user_id', $request->user()->id)
                ->update(['last_read_at' => now()]);
        }

        $staff = $this->staffParticipants($project);

        // Collection::prepend() mutates in place and returns $this — calling
        // it twice on the SAME $staff collection (once per key below) doubled
        // up "Company Admin" in whichever key got serialized last. Each key
        // needs its own collection instance.
        return ApiResponse::success([
            'mentionables' => collect([['user_id' => ProjectClientChatService::ADMIN_MENTION_ID, 'name' => 'Company Admin', 'role_type' => 'admin']])->concat($staff),
            'thread' => [
                'id' => $thread?->id,
                'participants' => collect([['user_id' => null, 'name' => 'Company Admin', 'role_type' => 'admin']])->concat($staff),
            ],
            'messages' => $messages,
        ]);
    }

    // POST /client/projects/{id}/chat
    public function store(Request $request, int $projectId): JsonResponse
    {
        $project = $this->project($request, $projectId);
        $thread  = ProjectChatService::existingThreadFor($project);

        if (!$thread) {
            return ApiResponse::error('This project\'s chat hasn\'t been opened by your team yet — please check back shortly.', 422);
        }

        $validated = $request->validate([
            'content'    => ['nullable', 'string', 'max:2000'],
            'file'       => ['nullable', 'file', 'max:' . self::MAX_FILE_KB, 'mimes:' . self::ALLOWED_MIMES],
            // No 'integer' rule on mentions.* — a stray non-numeric entry (e.g.
            // a stale mentionable id from before a page refresh) is filtered
            // out below rather than hard-failing the whole send with a 422;
            // matches the "silently dropped" convention already used for an
            // id the client isn't allowed to tag.
            'mentions'   => ['nullable', 'array'],
        ]);

        if (empty($validated['content']) && !$request->hasFile('file')) {
            return ApiResponse::error('Message or attachment is required.', 422);
        }

        // The thread already exists (checked above) — safe to add the
        // client as a participant here without violating ProjectChatService::
        // threadFor()'s "PM-tier/Admin only may CREATE" rule; this only ever
        // joins an existing conversation, same as show()'s own sync on the
        // Admin/PM side.
        ProjectChatService::addClient($project, $request->user()->id);

        // Anything the client isn't allowed to tag is silently dropped rather
        // than failing the send — same convention as the internal messenger.
        $mentionableIds = $this->staffParticipants($project)->pluck('user_id')->push(ProjectClientChatService::ADMIN_MENTION_ID);
        $mentions = collect($validated['mentions'] ?? [])
            ->filter(fn ($id) => is_numeric($id))
            ->map(fn ($id) => (int) $id)
            ->unique()
            ->filter(fn ($id) => $mentionableIds->contains($id))
            ->values();

        $attachmentPath = null;
        $attachmentName = null;
        $messageType    = 'text';

        if ($request->hasFile('file')) {
            $file   = $validated['file'];
            $folder = ($project->storage_folder ?: 'companies/' . $project->company_id . '/projects/' . $project->id) . '/chat';
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
            // Every message the client sends is client-facing by
            // construction — there is no internal slice for them to write.
            'visibility'      => 'client',
            'attachment_path' => $attachmentPath,
            'attachment_name' => $attachmentName,
            'is_deleted'      => false,
            'sent_at'         => now(),
        ]);

        $thread->update(['last_message_at' => now()]);
        $this->notifyStaff($project, $thread, $message, $request->user()->id, $request->user()->name, $mentions);

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
    // conversation.
    public function deleteMessage(Request $request, int $projectId, int $messageId): JsonResponse
    {
        $project = $this->project($request, $projectId);
        $thread  = ProjectChatService::existingThreadFor($project);
        if (!$thread) abort(404, 'Message not found');

        $message = ChatMessage::where('thread_id', $thread->id)
            ->where('visibility', 'client')
            ->where('is_deleted', false)
            ->findOrFail($messageId);

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
        $thread  = ProjectChatService::existingThreadFor($project);

        if (!$thread) abort(404, 'Attachment not found');

        $message = ChatMessage::where('thread_id', $thread->id)
            ->where('visibility', 'client')
            ->where('is_deleted', false)
            ->whereNotNull('attachment_path')
            ->findOrFail($messageId);

        return Storage::download($message->attachment_path, $message->attachment_name ?? 'attachment');
    }

    // Notifies only this conversation's curated staff — Company Admin, this
    // project's Seller, and its invited PM(s) (see staffParticipants()) —
    // never the wider team (Developer/QA/Designer/Production/plain team
    // member) even though they're genuine chat_participants rows on the
    // shared thread now: a client's message is only ever THEIR business, not
    // the whole company's. Company Admin needs no Notification row (not a
    // `users` id): the SystemAuditLog write below already surfaces on
    // Admin's bell.
    private function notifyStaff(Project $project, $thread, ChatMessage $message, int $actorUserId, ?string $actorName, $mentions): void
    {
        $senderName = $actorName ?? 'Client';
        $preview    = $message->content
            ? Str::limit($message->content, 120)
            : '📎 ' . ($message->attachment_name ?? 'sent an attachment');

        $recipients = $this->staffParticipants($project)->pluck('user_id')->reject(fn ($uid) => $uid === $actorUserId);

        foreach ($recipients as $uid) {
            Notification::create([
                'user_id'    => $uid,
                'company_id' => $project->company_id,
                'type'       => 'project_chat_message',
                'title'      => "New message on {$project->name}",
                'body'       => "{$senderName}: {$preview}",
                'data'       => [
                    'project_id' => $project->id,
                    'thread_id'  => $message->thread_id,
                    'message_id' => $message->id,
                    'link'       => "/projects/{$project->id}/chat",
                ],
            ]);
        }

        foreach ($mentions as $uid) {
            if ($uid === ProjectClientChatService::ADMIN_MENTION_ID) {
                \App\Services\NotificationService::notifyCompanyAdmins($project->company_id, null, [
                    'type'  => 'mentioned_in_project_chat',
                    'title' => "You were mentioned on {$project->name}",
                    'body'  => "{$senderName}: {$preview}",
                    'url'   => "/admin/projects/{$project->id}/chat",
                ]);
                continue;
            }

            Notification::create([
                'user_id'    => $uid,
                'company_id' => $project->company_id,
                'type'       => 'mentioned_in_project_chat',
                'title'      => "You were mentioned on {$project->name}",
                'body'       => "{$senderName}: {$preview}",
                'data'       => [
                    'project_id' => $project->id,
                    'thread_id'  => $message->thread_id,
                    'message_id' => $message->id,
                    'link'       => "/projects/{$project->id}/chat",
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
