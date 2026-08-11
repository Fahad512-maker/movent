<?php

namespace App\Http\Controllers\Api\User;

use App\Helpers\ApiResponse;
use App\Http\Controllers\Controller;
use App\Models\ChatMessage;
use App\Models\ChatParticipant;
use App\Models\ChatThread;
use App\Models\Notification;
use App\Models\Project;
use App\Models\User;
use App\Models\UserCompanyPermission;
use App\Services\NotificationService;
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
// from the older, dormant single-thread Api\User\ProjectChatController
// (thread_type='project', left untouched). See Api\Admin\ProjectMessengerController
// for the Admin half and the shared schema notes.
//
// Access model: Company Admin and the project's literal PM always have
// implicit view/send access (and the literal PM is auto-joined as a real
// chat_participants row the first time they access it, mirroring "creator
// auto-joins"). A canViewAllCompanyProjects holder who ISN'T the literal PM
// also gets implicit view/send access but is deliberately never persisted
// as a participant from a passive read — that would clutter "who's in this
// chat" with execs who merely opened the page (see resolveThreadForViewing()).
// Everyone else needs a pre-existing chat_participants row — added by a
// PM/Admin — before they can see or send anything; they can never cause the
// thread to be created themselves.
//
// Seller visibility (see canUserViewMessage()): a Seller sitting in the same
// thread as the rest of the team does NOT see the general conversation —
// only their own messages and any message where Company Admin/PM explicitly
// @mentions them. Conversely, a Seller's own message is only ever visible
// to Company Admin/PM, never the rest of the team. Only Company Admin/PM
// can successfully @mention a Seller (see send()) — anyone else's attempt is
// silently dropped, same convention as mentioning a non-participant. A
// Seller CAN always successfully @mention Company Admin (ADMIN_MENTION_ID)
// or the literal PM — those are the only two targets available to them.
class ProjectMessengerController extends Controller
{
    private const MAX_FILE_KB = 10240;
    private const ALLOWED_MIMES = 'pdf,doc,docx,xls,xlsx,png,jpg,jpeg,zip';

    // Sentinel id for "Company Admin" in @mentions — Admin isn't a `users`
    // row (notifications.user_id is a real FK to users), so it can never be
    // a genuine mention target id. 0 is safe: real user ids start at 1
    // (same convention as ProjectCommentController::ADMIN_MENTION_ID).
    // Company Admin is ALWAYS a valid mention target for ANYONE in this
    // chat — including a Seller, who otherwise can only successfully
    // mention the literal PM — since Admin has unconditional access to
    // every project's chat regardless of participant rows.
    private const ADMIN_MENTION_ID = 0;

    private function user() { return auth('sanctum')->user(); }

    private function can(string $permKey, string $moduleKey = 'project_management'): bool
    {
        $user = $this->user();
        return UserCompanyPermission::where('user_id', $user->id)
            ->where('company_id', $user->company_id)
            ->where('module_key', $moduleKey)
            ->where('permission_key', $permKey)
            ->exists();
    }

    private function project(int $projectId): Project
    {
        return Project::where('company_id', $this->user()->company_id)->findOrFail($projectId);
    }

    // Literally THIS project's Project Manager, for an arbitrary user id —
    // never a Seller, even one somehow recorded as project_manager_id via a
    // handoff. Deliberately NOT the same as isPM()'s broader PM-tier (which
    // also admits a canViewAllCompanyProjects holder) — the Seller-isolation
    // rule (canUserViewMessage(), send()'s mention filter) means literally
    // "Company Admin or the Project Manager", not every oversight-permission
    // holder, so it's evaluated against this narrower check specifically.
    private function isProjectPmUser(Project $project, int $userId): bool
    {
        if (User::find($userId)?->role_type === 'seller') {
            return false;
        }
        return $project->project_manager_id === $userId
            || $project->teamMembers()->where('user_id', $userId)->where('role_in_project', 'project_manager')->exists();
    }

    // Literally this project's Project Manager (current caller) — the one
    // role whose implicit chat access also means "auto-join me as a real
    // participant."
    private function isLiteralPm(Project $project): bool
    {
        return $this->isProjectPmUser($project, $this->user()->id);
    }

    // PM-tier: the literal PM, or a company-wide canViewAllCompanyProjects
    // holder — the only actors who may manage this project's chat
    // participants. A Seller NEVER qualifies here, even one literally
    // recorded as this project's project_manager_id via a handoff.
    private function isPM(Project $project): bool
    {
        $user = $this->user();
        if ($user->role_type === 'seller') {
            return false;
        }
        return $this->isLiteralPm($project) || $this->can('canViewAllCompanyProjects');
    }

    private function isInternalMember(Project $project): bool
    {
        $user = $this->user();
        return $this->isPM($project)
            || $project->teamMembers()->where('user_id', $user->id)->exists()
            || $project->tasks()->where('assigned_to', $user->id)->exists();
    }

    // Users formally tied to the project: PM, project team members, task
    // assignees, and each task's production-queue assignee. Sellers are
    // handled separately (see eligibleParticipants/blockedSellerIds) since
    // manually adding any company Seller is itself a valid path.
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

    // A participant candidate must either be formally tied to the project or
    // be a Seller (manual Seller-add is its own valid path regardless of
    // linkage) — enforced here so a direct API call can't add an unrelated
    // company user the picker never even shows.
    private function notProjectEligible(Project $project, int $userId): bool
    {
        $target = User::find($userId);
        if ($target?->role_type === 'seller') return false;
        return !$this->projectMemberIds($project)->contains($userId);
    }

    // Returns true (blocks the whole request) if any id in $userIds is a
    // Seller and the caller lacks canAddSellerToProjectChat.
    private function blockedSellerIds(Project $project, $userIds): bool
    {
        if ($userIds->isEmpty()) return false;
        $hasSeller = User::whereIn('id', $userIds)->where('role_type', 'seller')->exists();
        return $hasSeller && !$this->can('canAddSellerToProjectChat');
    }

    // The Seller isolation rule, evaluated per (message, recipient) pair so
    // it can drive both the read-side filter in messages() and the
    // notification recipient filter in notifyMessage() with one source of
    // truth. $userId/$roleType are always the CANDIDATE VIEWER being
    // evaluated — never implicitly "the current caller" — since
    // notifyMessage() calls this once per recipient, most of whom aren't
    // the actor:
    //   - A Seller recipient sees only their own messages, plus any message
    //     from Company Admin/the literal PM that explicitly @mentions them.
    //   - Everyone else never sees a Seller-authored message unless THEY
    //     are Company Admin or the literal PM (isProjectPmUser() — NOT the
    //     broader isPM() tier, so a canViewAllCompanyProjects holder who
    //     isn't actually this project's PM still can't see/tag a Seller).
    private function canUserViewMessage(Project $project, ChatMessage $message, int $userId, ?string $roleType): bool
    {
        if ($roleType === 'seller') {
            if ($message->sender_id === $userId) {
                return true;
            }
            $senderIsPrivileged = $message->sender_admin_id !== null
                || ($message->sender_id !== null && $this->isProjectPmUser($project, $message->sender_id));

            return $senderIsPrivileged && in_array($userId, $message->mentions ?? [], true);
        }

        $senderIsSeller = $message->sender?->role_type === 'seller';
        if ($senderIsSeller) {
            return $this->isProjectPmUser($project, $userId);
        }

        return true;
    }

    // The one place PM-tier vs everyone-else access diverges. PM-tier can
    // cause the thread to be created (ProjectChatService::threadFor); the
    // literal PM is also auto-joined as a real participant row so they show
    // up in the participant list and their mute/last-read state persists.
    // A canViewAllCompanyProjects holder who ISN'T the literal PM gets the
    // same implicit view/send access but is deliberately never written into
    // chat_participants from a passive access — that would clutter "who's
    // in this chat" with execs who merely opened the page. Note this tier
    // does NOT make them privileged for the Seller-isolation rule (see
    // canUserViewMessage()) — that's isProjectPmUser()/isLiteralPm() only.
    //
    // Everyone else must already be a participant — they can never trigger
    // creation, only an explicit PM/Admin add gets them in.
    private function resolveThreadForViewing(Project $project): ?ChatThread
    {
        $user = $this->user();

        if ($this->isPM($project)) {
            $thread = ProjectChatService::threadFor($project);

            if ($this->isLiteralPm($project)) {
                ChatParticipant::firstOrCreate(
                    ['thread_id' => $thread->id, 'user_id' => $user->id],
                    ['role' => 'admin', 'joined_at' => now()]
                );
            }

            return $thread;
        }

        $thread = ProjectChatService::existingThreadFor($project);
        if (!$thread) {
            return null;
        }

        $isParticipant = ChatParticipant::where('thread_id', $thread->id)->where('user_id', $user->id)->exists();
        return $isParticipant ? $thread : null;
    }

    // GET /user/projects/{projectId}/messenger — the project's one chat.
    public function show(int $projectId): JsonResponse
    {
        $project = $this->project($projectId);

        if (!$this->can('canViewProjectChat')) {
            return ApiResponse::error('You do not have access to project chat.', 403);
        }

        $thread = $this->resolveThreadForViewing($project);
        if (!$thread) {
            return ApiResponse::error('You do not have access to project chat yet.', 403);
        }

        // Only a PM/Admin-tier viewer's show() keeps the formal team synced
        // in — a regular staffer/Seller merely opening the page must never
        // cause OTHER people to be added, only their own access is at stake.
        if ($this->isPM($project)) {
            ProjectChatService::syncFormalTeamParticipants($project, $thread);
        }

        $thread->load('participants.user:id,name,role_type');
        $mine = $thread->participants->firstWhere('user_id', $this->user()->id);

        return ApiResponse::success([
            'is_pm'  => $this->isPM($project),
            // Narrower than is_pm — literal PM only (or Company Admin, who
            // never hits this User-guard endpoint at all). Drives the
            // frontend's "can I @mention a Seller" check, matching send()'s
            // isLiteralPm() gate exactly.
            'is_literal_pm' => $this->isLiteralPm($project),
            'thread' => [
                'id'           => $thread->id,
                'visibility'   => $thread->visibility,
                'is_muted'     => $mine?->muted_at !== null,
                // is_project_pm flags exactly who send()'s isProjectPmUser()
                // would treat as this project's PM — the frontend uses it to
                // build a Seller's @mention suggestions (PM only), rather
                // than guessing off role_type (a user's role_type can say
                // 'project_manager' without being THIS project's assigned
                // manager, or vice versa).
                'participants' => $thread->participants->map(fn ($p) => [
                    'user_id' => $p->user_id, 'name' => $p->user?->name, 'role' => $p->user?->role_type,
                    'is_project_pm' => $this->isProjectPmUser($project, $p->user_id),
                ])->values(),
            ],
        ]);
    }

    // GET /user/projects/{projectId}/messenger/eligible-participants — PM/Admin-
    // tier only (the sole remaining consumer is the Manage Participants
    // picker; there is no more "start a new chat with X" concept to feed).
    // Only users formally tied to the project (PM, team members, task/
    // production assignees) plus every company Seller are listed — everyone
    // else in the company never appears here.
    public function eligibleParticipants(int $projectId): JsonResponse
    {
        $project = $this->project($projectId);
        $user = $this->user();

        if (!$this->isPM($project) || !$this->can('canManageProjectChatParticipants')) {
            return ApiResponse::error('Permission denied', 403);
        }

        $memberIds = $this->projectMemberIds($project);

        $users = User::where('company_id', $project->company_id)
            ->where('is_active', true)
            ->where('id', '!=', $user->id)
            ->where(fn ($q) => $q->whereIn('id', $memberIds)->orWhere('role_type', 'seller'))
            ->orderBy('name')
            ->get(['id', 'name', 'role_type'])
            ->map(fn ($u) => ['id' => $u->id, 'name' => $u->name, 'role_type' => $u->role_type, 'is_seller' => $u->role_type === 'seller']);

        return ApiResponse::success($users->values());
    }

    // POST /user/projects/{projectId}/messenger/participants { user_id } — PM/Admin only.
    public function addParticipant(Request $request, int $projectId): JsonResponse
    {
        $project = $this->project($projectId);
        $user = $this->user();

        if (!$this->isPM($project) || !$this->can('canManageProjectChatParticipants')) {
            return ApiResponse::error('Only the Project Manager or Company Admin can manage project chat participants.', 403);
        }

        $validated = $request->validate([
            'user_id' => ['required', 'integer', Rule::exists('users', 'id')->where('company_id', $project->company_id)],
        ]);
        $targetId = (int) $validated['user_id'];

        if ($this->blockedSellerIds($project, collect([$targetId]))) {
            return ApiResponse::error('You do not have permission to add a Seller to project chat.', 403);
        }

        if ($this->notProjectEligible($project, $targetId)) {
            return ApiResponse::error('Only users added to this project (or a Seller) can be added to project chat.', 422);
        }

        $thread = ProjectChatService::threadFor($project);
        $this->addParticipants($project, $thread, [$targetId], $user->id);

        return ApiResponse::success(null, 'Participant added');
    }

    // DELETE /user/projects/{projectId}/messenger/participants/{userId} — PM/Admin only.
    public function removeParticipant(int $projectId, int $userId): JsonResponse
    {
        $project = $this->project($projectId);

        if (!$this->isPM($project) || !$this->can('canManageProjectChatParticipants')) {
            return ApiResponse::error('Only the Project Manager or Company Admin can manage project chat participants.', 403);
        }

        $thread = ProjectChatService::existingThreadFor($project);
        if ($thread) {
            ChatParticipant::where('thread_id', $thread->id)->where('user_id', $userId)->delete();
        }

        return ApiResponse::success(null, 'Participant removed');
    }

    // PATCH /user/projects/{projectId}/messenger/mute — toggles the CALLER's own mute state.
    public function toggleMute(int $projectId): JsonResponse
    {
        $project = $this->project($projectId);
        $user = $this->user();

        $thread = $this->resolveThreadForViewing($project);
        if (!$thread) {
            return ApiResponse::error('You do not have access to project chat.', 403);
        }

        $participant = ChatParticipant::where('thread_id', $thread->id)->where('user_id', $user->id)->first();
        if (!$participant) {
            return ApiResponse::success(['is_muted' => false]);
        }

        $participant->update(['muted_at' => $participant->muted_at ? null : now()]);

        return ApiResponse::success(['is_muted' => $participant->muted_at !== null]);
    }

    public function messages(int $projectId): JsonResponse
    {
        $project = $this->project($projectId);
        $user = $this->user();

        if (!$this->can('canViewProjectChat')) {
            return ApiResponse::error('You do not have access to project chat.', 403);
        }

        $thread = $this->resolveThreadForViewing($project);
        if (!$thread) {
            return ApiResponse::error('You do not have access to project chat.', 403);
        }

        $messages = ChatMessage::where('thread_id', $thread->id)
            ->where('is_deleted', false)
            ->with(['sender:id,name,role_type', 'senderAdmin:id,name'])
            ->orderBy('sent_at')
            ->get()
            // The Seller isolation rule — see canUserViewMessage().
            ->filter(fn ($m) => $this->canUserViewMessage($project, $m, $user->id, $user->role_type))
            ->values();

        ChatParticipant::where('thread_id', $thread->id)->where('user_id', $user->id)->update(['last_read_at' => now()]);

        return ApiResponse::success(['messages' => $messages]);
    }

    public function send(Request $request, int $projectId): JsonResponse
    {
        $project = $this->project($projectId);
        $user = $this->user();

        if (!$this->can('canSendProjectChatMessage')) {
            return ApiResponse::error('You do not have permission to send project chat messages.', 403);
        }

        $thread = $this->resolveThreadForViewing($project);
        if (!$thread) {
            return ApiResponse::error('You do not have access to project chat.', 403);
        }

        $validated = $request->validate([
            'content'     => ['nullable', 'string', 'max:2000'],
            'file'        => ['nullable', 'file', 'max:' . self::MAX_FILE_KB, 'mimes:' . self::ALLOWED_MIMES],
            'mentions'    => ['nullable', 'array'],
            'mentions.*'  => ['integer'],
        ]);

        if (empty($validated['content']) && !$request->hasFile('file')) {
            return ApiResponse::error('Message or attachment is required.', 422);
        }

        if ($request->hasFile('file') && !$this->can('canUploadProjectChatAttachment')) {
            return ApiResponse::error('You do not have permission to upload project chat attachments.', 403);
        }

        // Mention candidates are restricted to the thread's current
        // participants (plus the ADMIN_MENTION_ID sentinel, always allowed
        // for everyone), with two direction-specific rules matching the
        // "Seller only ever talks to Company Admin/PM" restriction:
        //   - Only Company Admin/the literal PM can successfully @mention a
        //     Seller — deliberately isLiteralPm(), NOT the broader isPM()
        //     tier, so a canViewAllCompanyProjects holder who isn't actually
        //     this project's PM still can't tag a Seller (this is also the
        //     ONLY way a Seller ever sees a message outside their own — see
        //     canUserViewMessage()).
        //   - A Seller can only ever successfully @mention the literal PM or
        //     Company Admin — never a Developer/Designer/QA/Production/Team
        //     Member.
        // Anyone else's tag attempt is silently dropped, same convention as
        // mentioning a non-participant.
        $isSenderLiteralPm = $this->isLiteralPm($project);
        $isSenderSeller = $user->role_type === 'seller';
        $participantIds = ChatParticipant::where('thread_id', $thread->id)->pluck('user_id');
        $mentions = collect($validated['mentions'] ?? [])->unique()
            ->filter(fn ($id) => $id === self::ADMIN_MENTION_ID || $participantIds->contains($id))
            ->reject(function ($id) use ($isSenderLiteralPm, $isSenderSeller, $project) {
                if ($id === self::ADMIN_MENTION_ID) {
                    return false;
                }
                if ($isSenderSeller) {
                    return !$this->isProjectPmUser($project, $id);
                }
                return !$isSenderLiteralPm && User::find($id)?->role_type === 'seller';
            })
            ->values();

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
            'thread_id'    => $thread->id,
            'sender_id'    => $user->id,
            'content'      => $validated['content'] ?? null,
            'mentions'     => $mentions->isNotEmpty() ? $mentions->all() : null,
            'message_type' => $messageType,
            'attachment_path' => $attachmentPath,
            'attachment_name' => $attachmentName,
            'sent_at'      => now(),
        ]);

        $thread->update(['last_message_at' => now()]);
        $this->notifyMessage($project, $thread, $message, $user->id, $mentions);

        return ApiResponse::success($message->load('sender:id,name'), 'Message sent', 201);
    }

    // DELETE — Company Admin and Project Manager (canDeleteAnyProjectChatMessage,
    // a PM default) can delete ANY message; every other role can only delete
    // their own — plain ownership, no separate permission gate needed for
    // that (matches Api\User\GeneralChatController's identical convention).
    public function deleteMessage(int $projectId, int $messageId): JsonResponse
    {
        $project = $this->project($projectId);
        $user = $this->user();

        $thread = $this->resolveThreadForViewing($project);
        if (!$thread) {
            return ApiResponse::error('You do not have access to project chat.', 403);
        }

        $message = ChatMessage::where('thread_id', $thread->id)->where('is_deleted', false)->findOrFail($messageId);

        $canDeleteAny = $this->can('canDeleteAnyProjectChatMessage');
        $isMine = $message->sender_id === $user->id;

        if (!$canDeleteAny && !$isMine) {
            return ApiResponse::error('You can only delete your own messages.', 403);
        }

        $message->update(['is_deleted' => true]);

        return ApiResponse::success(null, 'Message deleted');
    }

    // PATCH — own message only, no moderator override, same as
    // Api\User\GeneralChatController::updateMessage() — editing someone
    // else's words is a different concern than removing them.
    public function updateMessage(Request $request, int $projectId, int $messageId): JsonResponse
    {
        $project = $this->project($projectId);
        $user = $this->user();

        $thread = $this->resolveThreadForViewing($project);
        if (!$thread) {
            return ApiResponse::error('You do not have access to project chat.', 403);
        }

        $message = ChatMessage::where('thread_id', $thread->id)->where('is_deleted', false)->findOrFail($messageId);

        if ($message->sender_id !== $user->id) {
            return ApiResponse::error('You can only edit your own messages.', 403);
        }

        $validated = $request->validate([
            'content' => ['required', 'string', 'max:2000'],
        ]);

        $message->update(['content' => $validated['content'], 'edited_at' => now()]);

        return ApiResponse::success($message->fresh()->load('sender:id,name'), 'Message updated');
    }

    public function downloadAttachment(int $projectId, int $messageId): StreamedResponse
    {
        $project = $this->project($projectId);

        if (!$this->can('canViewProjectChatAttachments')) {
            abort(403, 'You do not have permission to view project chat attachments.');
        }

        $thread = $this->resolveThreadForViewing($project);
        if (!$thread) {
            abort(403, 'You do not have access to project chat.');
        }

        $message = ChatMessage::where('thread_id', $thread->id)->whereNotNull('attachment_path')
            ->with('sender:id,name,role_type')
            ->findOrFail($messageId);

        if (!$this->canUserViewMessage($project, $message, $this->user()->id, $this->user()->role_type)) {
            abort(403, 'You do not have access to this message.');
        }

        return Storage::download($message->attachment_path, $message->attachment_name ?? 'attachment');
    }

    private function addParticipants(Project $project, ChatThread $thread, array $userIds, int $addedByUserId): void
    {
        $actorName = User::find($addedByUserId)?->name ?? 'Someone';

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
                'data'       => ['project_id' => $project->id, 'thread_id' => $thread->id, 'link' => "/projects/{$project->id}/chat"],
            ]);
        }
    }

    private function notifyMessage(Project $project, ChatThread $thread, ChatMessage $message, int $actorUserId, $mentionIds = null): void
    {
        $senderName = $message->sender?->name ?? 'Someone';
        $preview = $message->content
            ? Str::limit($message->content, 120)
            : '📎 ' . ($message->attachment_name ?? 'sent an attachment');

        $recipients = ChatParticipant::where('thread_id', $thread->id)
            ->where('user_id', '!=', $actorUserId)
            ->whereNull('muted_at')
            ->with('user:id,role_type')
            ->get();

        foreach ($recipients as $participant) {
            if (!$this->canUserViewMessage($project, $message, $participant->user_id, $participant->user?->role_type)) {
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
            // ADMIN_MENTION_ID isn't a `users` row — route it to every
            // Company Admin who manages this company via NotificationService
            // (the only path that can target recipient_admin_id) instead of
            // a plain Notification::create(['user_id' => ...]).
            if ($uid === self::ADMIN_MENTION_ID) {
                NotificationService::notifyCompanyAdmins($project->company_id, null, [
                    'type'  => 'mentioned_in_project_chat',
                    'title' => "You were mentioned on {$project->name}",
                    'body'  => "{$senderName}: {$preview}",
                    'url'   => "/projects/{$project->id}/chat",
                ]);
                continue;
            }

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
