<?php

namespace App\Http\Controllers\Api\User;

use App\Helpers\ApiResponse;
use App\Http\Controllers\Controller;
use App\Models\ChatMessage;
use App\Models\ChatParticipant;
use App\Models\ChatThread;
use App\Models\Notification;
use App\Models\Project;
use App\Models\ProjectTeamMember;
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
// Visibility rules (see canUserViewMessage() for the authoritative logic —
// this is the summary). Five roles share this one thread: Company Admin
// (unrestricted, separate controller — sees and can @mention everyone),
// the literal PM, the Seller, the Client, and the wider team (Developer/QA/
// Designer/Production/plain Team Member). Only the literal PM and Company
// Admin can @mention a Seller or the Client — everyone else (Seller, team
// member) can only ever successfully @mention the literal PM or Company
// Admin (ADMIN_MENTION_ID); any other tag attempt is silently dropped, same
// convention as mentioning a non-participant (see send()).
//
//   - The Seller sees only their own messages, any visibility='client'
//     message (see below), and anything Company Admin/the PM explicitly
//     @mentions them in — never the wider team's chatter, and never a plain
//     team member's message. A Seller's own message is symmetrically only
//     ever visible to Company Admin/the PM (plus the Client, if promoted to
//     visibility='client').
//   - The Client only ever sees visibility='client' messages — a manual
//     toggle no longer exists; it's derived automatically (see send()): the
//     Seller's or Company Admin's own plain, untagged message is promoted
//     automatically (that's them "talking to the Client"), and so is the PM
//     explicitly @mentioning the Client (the only way a PM message ever
//     reaches them). Any other tagging (Admin tagging the Seller, the Seller
//     tagging Admin/PM) stays a targeted internal exchange the Client never
//     sees.
//   - The literal PM is this thread's hub: sees Company Admin's messages and
//     every plain team member's message unconditionally, but a Seller's or
//     Client's message only if explicitly @mentioned in it (same restriction
//     as everyone else outside that pair).
//   - A plain team member has the narrowest sight of all: only their own
//     messages, the PM's plain/untagged broadcasts, and anything that
//     explicitly @mentions them — never Company Admin's general messages,
//     another team member's messages, or a Seller's/Client's. Symmetrically,
//     a team member's own message (plain, or @mentioning the PM) is only
//     ever visible to the PM (and Company Admin) — never the rest of the
//     team, the Seller, or the Client.
//
// Any newly-joining team member (PM included — see invitePm()) also never
// sees the conversation from before they joined — see
// ProjectChatService::addTeamMember()/addTaskAssignee() and the
// history_from_message_id cutoff enforced in messages()/downloadAttachment().
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

    // Company Admin and the Client have their own guards/controllers for
    // chat (this one is staff/sub-user-only) — but /user/* routes only check
    // `auth:sanctum` (see config/auth.php: the 'client' portal login is a
    // real `users` row authenticating through the SAME sanctum guard, unlike
    // Admin's separate 'admin' guard), so nothing stops a Client's own valid
    // token from otherwise reaching this controller directly. Now that a
    // Client can be a genuine chat_participants row on this thread (see
    // ProjectChatService::addClient()), that gap would let them bypass the
    // visibility='client' filtering Api\Client\ProjectChatController enforces
    // and read the team's internal messages outright. Hard-blocked here,
    // once, at the one method every other method in this controller calls
    // first.
    private function project(int $projectId): Project
    {
        if ($this->user()->role_type === 'client') {
            abort(403, 'Clients cannot access the internal project chat.');
        }

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

    // Advanced "Manage Project Chat Participants" works as a real delegated
    // permission. A company-wide overseer (canViewAllCompanyProjects, but
    // NOT this project's own literal PM) can manage implicitly; other staff
    // must already be in the chat, so the key cannot become company-wide
    // project access.
    private function canManageParticipants(Project $project): bool
    {
        if ($this->user()->role_type === 'seller' || !$this->can('canManageProjectChatParticipants')) {
            return false;
        }

        // The literal PM manages this project's PEOPLE via "Manage Team"
        // instead — assignTeam() already syncs each addition into this same
        // chat (ProjectChatService::addTeamMember()), and removing someone
        // from the team drops their chat access too
        // (removeParticipantIfNoLongerEligible()). Participants here is for
        // a company-wide overseer who isn't actually this project's PM.
        if ($this->isLiteralPm($project)) {
            return false;
        }

        if ($this->isPM($project)) {
            return true;
        }

        $thread = ProjectChatService::existingThreadFor($project);
        if (!$thread) {
            return false;
        }

        return ChatParticipant::where('thread_id', $thread->id)
            ->where('user_id', $this->user()->id)
            ->exists();
    }

    // Users formally tied to the project: PM, project team members, task
    // assignees, and each task's production handoff assignee. Sellers are
    // handled separately (see eligibleParticipants/blockedSellerIds) since
    // manually adding any company Seller is itself a valid path.
    private function projectMemberIds(Project $project)
    {
        $teamIds = $project->teamMembers()->pluck('user_id');
        $taskAssigneeIds = $project->tasks()->whereNotNull('assigned_to')->pluck('assigned_to');
        $productionAssigneeIds = $project->tasks()->whereNotNull('production_assigned_to')->pluck('production_assigned_to');

        return collect([$project->project_manager_id])
            ->merge($teamIds)->merge($taskAssigneeIds)->merge($productionAssigneeIds)
            ->filter()->unique()->values();
    }

    // A participant candidate must either be formally tied to the project or
    // be THIS project's own linked Seller (project.seller_id) — an unrelated
    // company Seller is never eligible, even via a direct API call bypassing
    // the picker (eligibleParticipants() shows the exact same scope).
    private function notProjectEligible(Project $project, int $userId): bool
    {
        $target = User::find($userId);
        if ($target?->role_type === 'seller') return $project->seller_id !== $userId;
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
        // The Client is never actually evaluated by messages()'s filter —
        // Api\User\ProjectMessengerController::project() hard-blocks
        // role_type='client' outright — but notifyMessage() DOES call this
        // per recipient, and the Client is now a genuine participant (see
        // ProjectChatService::addClient()). Without this, every internal
        // message would ping them with a "new message" notification
        // regardless of visibility — not a content leak, but noise that
        // reveals the team is discussing something. Only a
        // visibility='client' message should ever reach them, mentioned or
        // not (mentioning the Client does NOT override visibility the way
        // it does for a Seller above — visibility is the one deliberate gate
        // here, not an accident of who got tagged).
        if ($roleType === 'client') {
            return $message->visibility === 'client';
        }

        if ($roleType === 'seller') {
            if ($message->sender_id === $userId) {
                return true;
            }

            // A visibility='client' message is, by construction, either
            // Company Admin's or this Seller's own untagged broadcast (see
            // send()) — meant for the Seller and the Client alike, no
            // tagging required.
            if ($message->visibility === 'client') {
                return true;
            }

            $senderIsAdmin = $message->sender_admin_id !== null;
            $senderIsPm = $message->sender_id !== null && $this->isProjectPmUser($project, $message->sender_id);

            if (!$senderIsAdmin && !$senderIsPm) {
                return false;
            }

            $mentions = $message->mentions ?? [];

            if (in_array($userId, $mentions, true)) {
                return true;
            }

            // Admin tagging the project's own PM is itself Seller-relevant —
            // Admin/Seller/PM is one triangle, so the Seller sees it too even
            // though only the PM was named (this can only be Admin's doing:
            // the Seller's own message already returned true above, and the
            // PM tagging themselves isn't a thing).
            if ($senderIsAdmin && collect($mentions)->contains(
                fn ($id) => $id !== self::ADMIN_MENTION_ID && $this->isProjectPmUser($project, $id)
            )) {
                return true;
            }

            // The PM's own plain, untagged message is NOT Seller-visible —
            // unlike Admin's/the Seller's own untagged broadcast, it's meant
            // for the wider team instead (a Developer/QA/Designer/plain team
            // member sees any of the PM's plain messages by default — see
            // below). The Seller is the one deliberate exception here, same
            // as never seeing the rest of the team's general chatter.
            return false;
        }

        // Everyone else here is either the literal PM or a plain team member
        // (Developer/QA/Designer/Production/Team Member) — Company Admin
        // never reaches this method (separate, unrestricted controller).
        if ($message->sender_id === $userId) {
            return true;
        }

        if (in_array($userId, $message->mentions ?? [], true)) {
            return true;
        }

        // A Seller-authored or Client-authored message is never broadcast to
        // the wider team, and the literal PM isn't privileged here either —
        // they only see one if explicitly @mentioned in it (handled above),
        // same as anyone else. Company Admin is the only one who sees it
        // unconditionally. The Seller's own branch above already covers them
        // seeing a Client's message via the visibility='client' check, so
        // this only gates everyone else.
        $senderIsSeller = $message->sender?->role_type === 'seller';
        $senderIsClient = $message->sender?->role_type === 'client';
        if ($senderIsSeller || $senderIsClient) {
            return false;
        }

        if ($this->isProjectPmUser($project, $userId)) {
            // The literal PM is the hub for the whole team: sees Company
            // Admin's broadcasts and every team member's messages
            // unconditionally (own-message/tagged already handled above;
            // only a Seller's/Client's message ever requires a tag, per the
            // check just above).
            return true;
        }

        // A plain team member's only default view of someone ELSE's message
        // (own and tagged are already handled above) is the project's own
        // PM's plain, untagged broadcast — never Company Admin's general
        // messages, and never another team member's messages. A team
        // member's OWN message is symmetric: only the PM (and Admin) ever
        // see it, plain or @mentioning the PM, never the rest of the team —
        // enforced by this same rule from the other viewer's perspective.
        $senderIsPm = $message->sender_id !== null && $this->isProjectPmUser($project, $message->sender_id);

        return $senderIsPm && empty($message->mentions ?? []);
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

            // Same "PM/Admin-tier viewer syncs it" convention — brings the
            // project's Client into this SAME thread the first time a PM/
            // Admin opens it, instead of the separate "Chat with Client"
            // thread (retired, but its data stays intact for history — see
            // Api\Client\ProjectChatController). A Client here only ever
            // sees visibility='client' messages; being a participant is what
            // lets them be @mentioned and receive notifications, not a
            // license to read the internal thread.
            $clientUserId = \App\Services\ProjectClientChatService::clientUserId($project);
            if ($clientUserId) {
                ProjectChatService::addClient($project, $clientUserId);
            }
        }

        $thread->load('participants.user:id,name,role_type');
        $mine = $thread->participants->firstWhere('user_id', $this->user()->id);

        // A plain team member (Developer/QA/Designer/Production/Team
        // Member) only ever sees fellow team members and the PM in "who's in
        // this chat" — never the Seller or the Client — mirroring
        // canUserViewMessage()'s isolation of them from the rest of the
        // triangle. The Seller and the literal PM still see everyone (not
        // requested to change here).
        $visibleParticipants = $thread->participants;
        if ($this->user()->role_type !== 'seller' && !$this->isLiteralPm($project)) {
            $visibleParticipants = $visibleParticipants->filter(fn ($p) =>
                $p->user_id === $this->user()->id
                || !in_array($p->user?->role_type, ['seller', 'client'], true)
            )->values();
        }

        return ApiResponse::success([
            'is_pm'  => $this->isPM($project),
            // Narrower than is_pm — literal PM only (or Company Admin, who
            // never hits this User-guard endpoint at all). Drives the
            // frontend's "can I @mention a Seller" check, matching send()'s
            // isLiteralPm() gate exactly.
            'is_literal_pm' => $this->isLiteralPm($project),
            'can_manage_participants' => $this->canManageParticipants($project),
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
                'participants' => $visibleParticipants->map(fn ($p) => [
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
    // production assignees) plus this project's own linked Seller
    // (project.seller_id), if any, are listed — an unrelated company Seller
    // never appears; chat access follows actual project assignment.
    public function eligibleParticipants(int $projectId): JsonResponse
    {
        $project = $this->project($projectId);
        $user = $this->user();

        if (!$this->canManageParticipants($project)) {
            return ApiResponse::error('Permission denied', 403);
        }

        $memberIds = $this->projectMemberIds($project);

        $users = User::ofCompany($project->company_id)
            ->where('is_active', true)
            ->where('id', '!=', $user->id)
            ->where(function ($q) use ($memberIds, $project) {
                $q->whereIn('id', $memberIds);
                if ($project->seller_id) $q->orWhere('id', $project->seller_id);
            })
            ->orderBy('name')
            ->get(['id', 'name', 'role_type'])
            ->map(fn ($u) => ['id' => $u->id, 'name' => $u->name, 'role_type' => $u->role_type, 'is_seller' => $u->role_type === 'seller']);

        return ApiResponse::success($users->values());
    }

    // GET /user/projects/{projectId}/messenger/eligible-pms — this project's
    // own Seller only. Every active Project Manager at the company, so the
    // Seller can bring one onto a project that doesn't have one yet (not
    // scoped to "already tied to the project" the way eligibleParticipants()
    // is — that's the whole point of an invite).
    public function eligiblePms(int $projectId): JsonResponse
    {
        $project = $this->project($projectId);
        $user = $this->user();

        if ($user->role_type !== 'seller' || $project->seller_id !== $user->id) {
            return ApiResponse::error('Only this project\'s Seller can invite a Project Manager.', 403);
        }

        $users = User::ofCompany($project->company_id)
            ->where('role_type', 'project_manager')
            ->where('is_active', true)
            ->orderBy('name')
            ->get(['id', 'name']);

        return ApiResponse::success($users);
    }

    // POST /user/projects/{projectId}/messenger/invite-pm { user_id } — this
    // project's own Seller only. Brings a company Project Manager onto the
    // project as a real team member (role_in_project='project_manager') —
    // which is what isProjectPmUser()/invitablePmIds() actually key off, not
    // projects.project_manager_id — so they're immediately recognized
    // everywhere that matters (canUserViewMessage()'s Seller-triangle rule,
    // @mention eligibility, the Client's own mentionable list). Also joins
    // them into this thread directly, but ONLY from this point forward
    // (ProjectChatService::addTeamMember()'s "from now" cutoff, same as any
    // other new team member) — an invited PM never sees the conversation
    // that happened before they joined, only messages sent after
    // (messages()/downloadAttachment() enforce the cutoff) plus whatever
    // tags them, which can only ever be a post-join message anyway
    // (mentioning someone requires them to already be a participant).
    // Rejects re-inviting a PM already assigned to THIS project (a distinct,
    // clearer error than silently no-op'ing — the Seller almost certainly
    // meant to do something else, like check who's assigned).
    public function invitePm(Request $request, int $projectId): JsonResponse
    {
        $project = $this->project($projectId);
        $user = $this->user();

        if ($user->role_type !== 'seller' || $project->seller_id !== $user->id) {
            return ApiResponse::error('Only this project\'s Seller can invite a Project Manager.', 403);
        }

        $validated = $request->validate([
            'user_id' => ['required', 'integer'],
        ]);
        $pmId = (int) $validated['user_id'];

        // ofCompany() (not a raw company_id match) so a Project Manager
        // assigned to more than one company can still be invited here when
        // this project's company is their secondary one.
        $pm = User::ofCompany($project->company_id)
            ->where('id', $pmId)
            ->where('role_type', 'project_manager')
            ->where('is_active', true)
            ->first();

        if (!$pm) {
            return ApiResponse::error('That user is not an active Project Manager at your company.', 422);
        }

        // Excludes the project's own Seller — a self-handoff project has
        // them backfilled into this exact row (role_in_project=
        // 'project_manager', user_id=seller_id) purely so the "Project
        // Manager" column shows a name instead of "Unassigned" (see
        // 2026_08_11_150000_backfill_project_manager_id_from_seller.php and
        // ProjectSellerAssignmentService::assign()) — cosmetic only, never a
        // real assignment. Without this exclusion every self-handoff project
        // would look like it already had a PM and permanently block this
        // invite, matching the same seller-is-never-a-real-PM rule already
        // enforced by isProjectPmUser() and invitablePmIds() elsewhere.
        $existingPm = $project->teamMembers()
            ->where('role_in_project', 'project_manager')
            ->where('user_id', '!=', $project->seller_id)
            ->first();
        if ($existingPm) {
            return ApiResponse::error(
                $existingPm->user_id === $pmId
                    ? 'This Project Manager is already assigned to this project.'
                    : 'This project already has a Project Manager — remove them from the team first.',
                422
            );
        }

        $wasAlreadyOnTeam = $project->teamMembers()->where('user_id', $pmId)->exists();

        ProjectTeamMember::updateOrCreate(
            ['project_id' => $project->id, 'user_id' => $pmId],
            ['role_in_project' => 'project_manager', 'assigned_by' => $user->id]
        );

        if (!$wasAlreadyOnTeam) {
            Notification::create([
                'user_id'    => $pmId,
                'company_id' => $project->company_id,
                'type'       => 'project_team_assigned',
                'title'      => 'Added to project team',
                'body'       => "{$user->name} added you to project \"{$project->name}\" as Project Manager.",
                'data'       => ['project_id' => $project->id, 'link' => "/projects/{$project->id}"],
            ]);
        }

        // Idempotent — also fires its own 'project_chat_added' notification,
        // but only the first time (wasRecentlyCreated), same as re-running
        // syncFormalTeamParticipants() on an existing member.
        ProjectChatService::addTeamMember($project, $pmId);

        return ApiResponse::success(null, 'Project Manager invited');
    }

    // POST /user/projects/{projectId}/messenger/participants { user_id } — PM/Admin only.
    public function addParticipant(Request $request, int $projectId): JsonResponse
    {
        $project = $this->project($projectId);
        $user = $this->user();

        if (!$this->canManageParticipants($project)) {
            return ApiResponse::error('You do not have permission to manage project chat participants.', 403);
        }

        // Company membership isn't re-checked here — notProjectEligible()
        // below is a strictly narrower, more reliable gate (formally tied to
        // THIS project already implies belonging to its company), and a
        // plain company_id Rule::exists() would wrongly reject an eligible
        // multi-company team member whose raw company_id column points at
        // their OTHER company.
        $validated = $request->validate([
            'user_id' => ['required', 'integer', Rule::exists('users', 'id')],
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

        if (!$this->canManageParticipants($project)) {
            return ApiResponse::error('You do not have permission to manage project chat participants.', 403);
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

        // Any newly-joined team member (ProjectChatService::addTeamMember()/
        // addTaskAssignee()) carries a history_from_message_id watermark —
        // an existing, already-in-the-chat participant's is
        // null (full history), so this is a no-op for them.
        $myHistoryFrom = ChatParticipant::where('thread_id', $thread->id)
            ->where('user_id', $user->id)
            ->value('history_from_message_id');

        $messages = ChatMessage::where('thread_id', $thread->id)
            ->where('is_deleted', false)
            ->with(['sender:id,name,role_type', 'senderAdmin:id,name'])
            ->orderBy('sent_at')
            ->get()
            // The Seller isolation rule — see canUserViewMessage().
            ->filter(fn ($m) => $this->canUserViewMessage($project, $m, $user->id, $user->role_type))
            ->filter(fn ($m) => $myHistoryFrom === null || $m->id > $myHistoryFrom)
            ->values();

        ChatParticipant::where('thread_id', $thread->id)->where('user_id', $user->id)->update(['last_read_at' => now()]);

        return ApiResponse::success(['messages' => $messages]);
    }

    public function send(Request $request, int $projectId): JsonResponse
    {
        $project = $this->project($projectId);
        $user = $this->user();

        if ($project->isDraft()) {
            return ApiResponse::error(Project::DRAFT_BLOCKED_MESSAGE, 422);
        }

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
        // for everyone). One rule covers every non-PM sender — Seller,
        // Client-facing-triangle aside, or a plain team member
        // (Developer/QA/Designer/Production/Team Member): they may only ever
        // successfully @mention the literal PM (or Company Admin, via the
        // sentinel) — never a Seller, never the Client, never each other.
        // This is deliberately isLiteralPm(), NOT the broader isPM() tier, so
        // a canViewAllCompanyProjects holder who isn't actually this
        // project's PM still can't tag a Seller/Client either (this is also
        // the ONLY way a Seller/team member ever sees a message outside
        // their own — see canUserViewMessage()). Only the literal PM is
        // unrestricted — they can @mention anyone, including the Client,
        // which is the ONLY way a PM message ever reaches the Client (see
        // this method's own visibility computation below). Anyone else's tag
        // attempt is silently dropped, same convention as mentioning a
        // non-participant.
        $isSenderLiteralPm = $this->isLiteralPm($project);
        $isSenderSeller = $user->role_type === 'seller';
        $participantIds = ChatParticipant::where('thread_id', $thread->id)->pluck('user_id');
        $mentions = collect($validated['mentions'] ?? [])->unique()
            ->filter(fn ($id) => $id === self::ADMIN_MENTION_ID || $participantIds->contains($id))
            ->reject(function ($id) use ($isSenderLiteralPm, $project) {
                if ($id === self::ADMIN_MENTION_ID || $isSenderLiteralPm) {
                    return false;
                }
                return !$this->isProjectPmUser($project, $id);
            })
            ->values();

        // Auto-computed visibility, replacing the old manual "visible to
        // client" toggle — see the class-level doc comment above. This
        // project's own Seller sending a plain, untagged message gets the
        // promotion (Admin's side is handled identically in
        // Api\Admin\ProjectMessengerController::send()); so does the PM
        // explicitly @mentioning the Client — the only other way a message
        // in this thread is ever meant to reach them.
        $isProjectSeller = $isSenderSeller && $user->id === $project->seller_id;
        $clientUserId = \App\Services\ProjectClientChatService::clientUserId($project);
        $taggedClient = $clientUserId !== null && $mentions->contains($clientUserId);
        $visibility = (($isProjectSeller && $mentions->isEmpty()) || $taggedClient) ? 'client' : 'internal';

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
            'visibility'   => $visibility,
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

        $myHistoryFrom = ChatParticipant::where('thread_id', $thread->id)
            ->where('user_id', $this->user()->id)
            ->value('history_from_message_id');
        if ($myHistoryFrom !== null && $message->id <= $myHistoryFrom) {
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

            // The Client Portal is a separate app tree with its own auth
            // cookie — the staff route below would 401 there (no staff
            // session token to send) and trip the staff axios interceptor's
            // force-logout-on-401 handling.
            $link = User::find($userId)?->role_type === 'client'
                ? "/client/projects/{$project->id}?tab=chat"
                : "/projects/{$project->id}/chat";

            Notification::create([
                'user_id'    => $userId,
                'company_id' => $project->company_id,
                'type'       => 'project_chat_added',
                'title'      => "Added to project chat — {$project->name}",
                'body'       => "{$actorName} added you to project chat for '{$project->name}'.",
                'data'       => ['project_id' => $project->id, 'thread_id' => $thread->id, 'link' => $link],
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

            // The Client Portal is a separate app tree with its own auth
            // cookie — the staff route below would 401 there (no staff
            // session token to send) and trip the staff axios interceptor's
            // force-logout-on-401 handling.
            $link = $participant->user?->role_type === 'client'
                ? "/client/projects/{$project->id}?tab=chat"
                : "/projects/{$project->id}/chat";

            Notification::create([
                'user_id'    => $participant->user_id,
                'company_id' => $project->company_id,
                'type'       => 'project_chat_message',
                'title'      => "New message on {$project->name}",
                'body'       => "{$senderName}: {$preview}",
                'data'       => ['project_id' => $project->id, 'thread_id' => $thread->id, 'message_id' => $message->id, 'link' => $link],
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
                    'url'   => "/admin/projects/{$project->id}/chat",
                ]);
                continue;
            }

            $targetIsClient = User::find($uid)?->role_type === 'client';

            // Being @mentioned never overrides visibility for the Client
            // (unlike the Seller-isolation rule above, where a mention IS the
            // override) — tagging them in an internal message shouldn't ping
            // them about a message they still can't actually see.
            if ($targetIsClient && $message->visibility !== 'client') {
                continue;
            }

            // The Client Portal is a separate app tree with its own auth
            // cookie — the staff route below would 401 there (no staff
            // session token to send) and trip the staff axios interceptor's
            // force-logout-on-401 handling.
            $link = $targetIsClient
                ? "/client/projects/{$project->id}?tab=chat"
                : "/projects/{$project->id}/chat";

            Notification::create([
                'user_id'    => $uid,
                'company_id' => $project->company_id,
                'type'       => 'mentioned_in_project_chat',
                'title'      => "You were mentioned on {$project->name}",
                'body'       => "{$senderName}: {$preview}",
                'data'       => ['project_id' => $project->id, 'thread_id' => $thread->id, 'message_id' => $message->id, 'link' => $link],
            ]);
        }

        // The project's own Seller sending a plain, untagged message is
        // auto-promoted to visibility='client' (see send()) — Company Admin
        // isn't a chat_participants row so the recipients loop above never
        // reaches them; this is the one path that actually notifies Admin
        // for it, mirroring the explicit ADMIN_MENTION_ID branch above for
        // the tagged case.
        if ($message->visibility === 'client' && $message->sender?->role_type === 'seller') {
            NotificationService::notifyCompanyAdmins($project->company_id, null, [
                'type'  => 'project_chat_message',
                'title' => "New message on {$project->name}",
                'body'  => "{$senderName}: {$preview}",
                'url'   => "/admin/projects/{$project->id}/chat",
            ]);
        }

        // A message from the project's own literal PM — plain, or tagging
        // the Seller — is always meant to reach Company Admin too, same
        // reasoning as the Seller block above: Admin has no chat_participants
        // row so the recipients loop never reaches them. Skipped only when
        // Admin was already tagged explicitly in this message — that already
        // fired its own notification via the ADMIN_MENTION_ID branch above.
        if ($message->sender_id !== null
            && $this->isProjectPmUser($project, $message->sender_id)
            && !collect($mentionIds ?? [])->contains(self::ADMIN_MENTION_ID)) {
            NotificationService::notifyCompanyAdmins($project->company_id, null, [
                'type'  => 'project_chat_message',
                'title' => "New message on {$project->name}",
                'body'  => "{$senderName}: {$preview}",
                'url'   => "/admin/projects/{$project->id}/chat",
            ]);
        }
    }
}
