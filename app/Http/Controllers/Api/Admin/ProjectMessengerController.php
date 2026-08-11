<?php

namespace App\Http\Controllers\Api\Admin;

use App\Helpers\ApiResponse;
use App\Http\Controllers\Controller;
use App\Models\ChatMessage;
use App\Models\ChatParticipant;
use App\Models\ChatThread;
use App\Models\Notification;
use App\Models\Project;
use App\Models\User;
use App\Services\ProjectChatService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;
use Symfony\Component\HttpFoundation\StreamedResponse;

// Project-wise messenger — ONE chat thread per project (see ProjectChatService
// and the 2026_08_10_10* migrations that merged historical duplicate
// group/direct threads and added a DB-level unique constraint). Distinct
// from the older, dormant single-thread Api\Admin\ProjectChatController
// (thread_type='project', never wired into any frontend page — left
// untouched). Company Admin is never a chat_participants row (same
// convention as GeneralChatController) — Admin sees/manages every project's
// chat unconditionally.
class ProjectMessengerController extends Controller
{
    private const MAX_FILE_KB = 10240;
    private const ALLOWED_MIMES = 'pdf,doc,docx,xls,xlsx,png,jpg,jpeg,zip';

    private function admin() { return auth('admin')->user(); }

    private function project(int $projectId): Project
    {
        $companyIds = $this->admin()->companies()->pluck('id');
        return Project::whereIn('company_id', $companyIds)->findOrFail($projectId);
    }

    // Users formally tied to the project: PM, project team members, task
    // assignees, and each task's production-queue assignee. Sellers are
    // handled separately (see eligibleParticipants) since manually adding
    // any company Seller is itself a valid path, not just a linked one.
    private function projectMemberIds(Project $project)
    {
        $teamIds = $project->teamMembers()->pluck('user_id');
        $taskAssigneeIds = $project->tasks()->whereNotNull('assigned_to')->pluck('assigned_to');
        $productionAssigneeIds = $project->tasks()->with('productionQueue')->get()
            ->pluck('productionQueue.assigned_to')->filter();

        return collect([$project->project_manager_id])
            ->merge($teamIds)->merge($taskAssigneeIds)->merge($productionAssigneeIds)
            ->filter()->unique()->values();
    }

    // Company Admin is always privileged, so a Seller sharing this thread
    // with the rest of the team never needs to be excluded here the way it
    // once did — see the User-guard controller's canUserViewMessage() for
    // the actual isolation rule (a Seller only ever sees their own messages
    // plus anything Company Admin/PM explicitly @mentions them in; everyone
    // else never sees a Seller's message). Admin's messages()/send() stay
    // unrestricted on both sides of that rule by construction: Admin always
    // sees everything, and can always @mention anyone including a Seller.

    // GET /admin/projects/{projectId}/messenger — the project's one chat.
    public function show(int $projectId): JsonResponse
    {
        $project = $this->project($projectId);
        $thread = ProjectChatService::threadFor($project);
        ProjectChatService::syncFormalTeamParticipants($project, $thread);
        $thread->load('participants.user:id,name,role_type');

        return ApiResponse::success([
            'thread' => [
                'id'           => $thread->id,
                'visibility'   => $thread->visibility,
                'participants' => $thread->participants->map(fn ($p) => [
                    'user_id' => $p->user_id, 'name' => $p->user?->name, 'role' => $p->user?->role_type,
                ])->values(),
            ],
        ]);
    }

    // GET /admin/projects/{projectId}/messenger/eligible-participants —
    // active users actually tied to this project (PM, team members, task/
    // production assignees), plus every Seller in the company (Admin can
    // manually add any Seller to project chat regardless of linkage).
    public function eligibleParticipants(int $projectId): JsonResponse
    {
        $project = $this->project($projectId);
        $memberIds = $this->projectMemberIds($project);

        $users = User::where('company_id', $project->company_id)
            ->where('is_active', true)
            ->where(fn ($q) => $q->whereIn('id', $memberIds)->orWhere('role_type', 'seller'))
            ->orderBy('name')
            ->get(['id', 'name', 'role_type'])
            ->map(fn ($u) => ['id' => $u->id, 'name' => $u->name, 'role_type' => $u->role_type, 'is_seller' => $u->role_type === 'seller']);

        return ApiResponse::success($users);
    }

    // POST /admin/projects/{projectId}/messenger/participants { user_id }
    public function addParticipant(Request $request, int $projectId): JsonResponse
    {
        $project = $this->project($projectId);

        $validated = $request->validate([
            'user_id' => ['required', 'integer', Rule::exists('users', 'id')->where('company_id', $project->company_id)],
        ]);
        $targetId = (int) $validated['user_id'];

        $thread = ProjectChatService::threadFor($project);
        $this->addParticipants($project, $thread, [$targetId], null);

        return ApiResponse::success(null, 'Participant added');
    }

    // DELETE /admin/projects/{projectId}/messenger/participants/{userId}
    public function removeParticipant(int $projectId, int $userId): JsonResponse
    {
        $project = $this->project($projectId);
        $thread = ProjectChatService::existingThreadFor($project);

        if ($thread) {
            ChatParticipant::where('thread_id', $thread->id)->where('user_id', $userId)->delete();
        }

        return ApiResponse::success(null, 'Participant removed');
    }

    // PATCH /admin/projects/{projectId}/messenger/participants/{userId}/mute
    public function muteParticipant(int $projectId, int $userId): JsonResponse
    {
        $project = $this->project($projectId);
        $thread = ProjectChatService::threadFor($project);

        $participant = ChatParticipant::where('thread_id', $thread->id)->where('user_id', $userId)->firstOrFail();
        $participant->update(['muted_at' => $participant->muted_at ? null : now()]);

        return ApiResponse::success(['is_muted' => $participant->muted_at !== null]);
    }

    public function messages(int $projectId): JsonResponse
    {
        $project = $this->project($projectId);
        $thread = ProjectChatService::threadFor($project);

        $messages = ChatMessage::where('thread_id', $thread->id)
            ->where('is_deleted', false)
            ->with(['sender:id,name', 'senderAdmin:id,name'])
            ->orderBy('sent_at')
            ->get();

        return ApiResponse::success(['messages' => $messages]);
    }

    public function send(Request $request, int $projectId): JsonResponse
    {
        $project = $this->project($projectId);
        $thread = ProjectChatService::threadFor($project);

        $validated = $request->validate([
            'content'     => ['nullable', 'string', 'max:2000'],
            'file'        => ['nullable', 'file', 'max:' . self::MAX_FILE_KB, 'mimes:' . self::ALLOWED_MIMES],
            'mentions'    => ['nullable', 'array'],
            'mentions.*'  => ['integer'],
        ]);

        if (empty($validated['content']) && !$request->hasFile('file')) {
            return ApiResponse::error('Message or attachment is required.', 422);
        }

        // Mention candidates are restricted to the thread's current
        // participants — this is what enforces the Seller tag-rule for free
        // (a Seller can only be a participant via a PM/Admin add, so
        // mentioning them here means they were already vetted).
        $participantIds = ChatParticipant::where('thread_id', $thread->id)->pluck('user_id');
        $mentions = collect($validated['mentions'] ?? [])->unique()->filter(fn ($id) => $participantIds->contains($id))->values();

        $attachmentPath = null;
        $attachmentName = null;
        $messageType    = 'text';

        if ($request->hasFile('file')) {
            $file = $validated['file'];
            $folder = ($project->storage_folder ?: 'companies/' . $project->company_id . '/projects/' . $project->id) . '/messenger';
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
            'attachment_path' => $attachmentPath,
            'attachment_name' => $attachmentName,
            'sent_at'         => now(),
        ]);

        $thread->update(['last_message_at' => now()]);
        $this->notifyMessage($project, $thread, $message, null, $mentions);

        return ApiResponse::success($message->load('senderAdmin:id,name'), 'Message sent', 201);
    }

    // DELETE — Admin can delete ANY message in a project's chat, matching
    // GeneralChatController's unrestricted admin delete.
    public function deleteMessage(int $projectId, int $messageId): JsonResponse
    {
        $project = $this->project($projectId);
        $thread = ProjectChatService::threadFor($project);

        $message = ChatMessage::where('thread_id', $thread->id)->where('is_deleted', false)->findOrFail($messageId);
        $message->update(['is_deleted' => true]);

        return ApiResponse::success(null, 'Message deleted');
    }

    // PATCH — own message only, no moderator override, same as
    // Api\Admin\GeneralChatController::updateMessage() — editing someone
    // else's words is a different concern than removing them.
    public function updateMessage(Request $request, int $projectId, int $messageId): JsonResponse
    {
        $project = $this->project($projectId);
        $thread = ProjectChatService::threadFor($project);

        $message = ChatMessage::where('thread_id', $thread->id)->where('is_deleted', false)->findOrFail($messageId);

        if ($message->sender_admin_id !== $this->admin()->id) {
            return ApiResponse::error('You can only edit your own messages.', 403);
        }

        $validated = $request->validate([
            'content' => ['required', 'string', 'max:2000'],
        ]);

        $message->update(['content' => $validated['content'], 'edited_at' => now()]);

        return ApiResponse::success($message->fresh()->load('senderAdmin:id,name'), 'Message updated');
    }

    public function downloadAttachment(int $projectId, int $messageId): StreamedResponse
    {
        $project = $this->project($projectId);
        $thread = ProjectChatService::threadFor($project);

        $message = ChatMessage::where('thread_id', $thread->id)->whereNotNull('attachment_path')->findOrFail($messageId);

        return Storage::download($message->attachment_path, $message->attachment_name ?? 'attachment');
    }

    // Adds participants + fires the "added to project chat" notification.
    // $addedByUserId is null when Company Admin performed the add (Admin
    // isn't a `users` row — same convention as ProjectTeamMember.assigned_by).
    private function addParticipants(Project $project, ChatThread $thread, array $userIds, ?int $addedByUserId): void
    {
        $actorName = $addedByUserId ? (User::find($addedByUserId)?->name ?? 'Someone') : ($this->admin()->name ?? 'Company Admin');

        foreach ($userIds as $userId) {
            $participant = ChatParticipant::firstOrCreate(
                ['thread_id' => $thread->id, 'user_id' => $userId],
                ['role' => 'member', 'added_by' => $addedByUserId, 'joined_at' => now()]
            );

            if (!$participant->wasRecentlyCreated) continue;

            Notification::create([
                'user_id'    => $userId,
                'company_id' => $project->company_id,
                'type'       => 'project_chat_added',
                'title'      => "Added to project chat — {$project->name}",
                'body'       => "{$actorName} added you to project chat for '{$project->name}'.",
                'data'       => [
                    'project_id' => $project->id,
                    'thread_id'  => $thread->id,
                    'link'       => "/projects/{$project->id}/chat",
                ],
            ]);
        }
    }

    private function notifyMessage(Project $project, ChatThread $thread, ChatMessage $message, ?int $actorUserId, $mentionIds = null): void
    {
        $senderName = $message->senderAdmin?->name ?? $message->sender?->name ?? 'Someone';
        $preview = $message->content
            ? Str::limit($message->content, 120)
            : '📎 ' . ($message->attachment_name ?? 'sent an attachment');

        $recipients = ChatParticipant::where('thread_id', $thread->id)
            ->whereNull('muted_at')
            ->when($actorUserId, fn ($q) => $q->where('user_id', '!=', $actorUserId))
            ->with('user:id,role_type')
            ->get();

        $mentioned = collect($mentionIds ?? []);

        foreach ($recipients as $participant) {
            // A Seller only ever sees messages Company Admin/PM explicitly
            // tag them in — skip the general "new message" notice for a
            // Seller who wasn't tagged in THIS message (see the User-guard
            // controller's canUserViewMessage() for the full rule; Admin's
            // own messages are always privileged, so this is the only
            // branch of that rule Admin's side ever needs).
            if ($participant->user?->role_type === 'seller' && !$mentioned->contains($participant->user_id)) {
                continue;
            }

            Notification::create([
                'user_id'    => $participant->user_id,
                'company_id' => $project->company_id,
                'type'       => 'project_chat_message',
                'title'      => "New message on {$project->name}",
                'body'       => "{$senderName}: {$preview}",
                'data'       => ['project_id' => $project->id, 'thread_id' => $thread->id, 'message_id' => $message->id, 'link' => "/projects/{$project->id}/chat"],
            ]);
        }

        foreach (collect($mentionIds ?? [])->reject(fn ($id) => $id === $actorUserId) as $uid) {
            Notification::create([
                'user_id'    => $uid,
                'company_id' => $project->company_id,
                'type'       => 'mentioned_in_project_chat',
                'title'      => "You were mentioned on {$project->name}",
                'body'       => "{$senderName}: {$preview}",
                'data'       => ['project_id' => $project->id, 'thread_id' => $thread->id, 'message_id' => $message->id, 'link' => "/projects/{$project->id}/chat"],
            ]);
        }
    }
}
