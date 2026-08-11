<?php

namespace App\Services;

use App\Models\ChatParticipant;
use App\Models\ChatThread;
use App\Models\Notification;
use App\Models\Project;
use App\Models\User;
use Illuminate\Database\UniqueConstraintViolationException;

// One Project = one chat thread (see the 2026_08_10_10* migrations that
// merged historical duplicates and added a DB-level unique constraint).
// Shared by both Api\User\ProjectMessengerController and
// Api\Admin\ProjectMessengerController — the only piece of this feature
// promoted out of the usual per-guard duplication, since the
// get-or-atomically-create race handling below needs to behave identically
// on both sides and is easy to get subtly wrong if written twice.
class ProjectChatService
{
    // Creates the thread if it doesn't exist yet. Callers must only use this
    // from a PM-tier/Admin code path — anyone else must use existingThreadFor()
    // so a regular staffer/Seller can never trigger creation just by looking.
    public static function threadFor(Project $project): ChatThread
    {
        $thread = static::existingThreadFor($project);
        if ($thread) {
            return $thread;
        }

        try {
            return ChatThread::create([
                'company_id'     => $project->company_id,
                'thread_type'    => 'project_group',
                'linked_to_type' => 'Project',
                'linked_to_id'   => $project->id,
                'visibility'     => 'internal',
            ]);
        } catch (UniqueConstraintViolationException $e) {
            // Lost a create race to a concurrent first-access — the winner's
            // row is now there, fetch it instead of failing the request.
            return static::existingThreadFor($project) ?? throw $e;
        }
    }

    // Read-only — never creates. Returns null if nobody has caused the
    // project's chat to exist yet.
    public static function existingThreadFor(Project $project): ?ChatThread
    {
        return ChatThread::where('company_id', $project->company_id)
            ->where('linked_to_type', 'Project')
            ->where('linked_to_id', $project->id)
            ->where('thread_type', 'project_group')
            ->first();
    }

    // Keeps the project's formal team (PM, team members, task/production
    // assignees) automatically present in its one chat — a project's people
    // shouldn't have to wait for a manual add just to be mentionable/visible
    // in the team's main conversation. A Seller is the one deliberate
    // exception: even one recorded via a team/task assignment must NEVER be
    // auto-added — "Seller can be added only by Company Admin or Project
    // Manager" is a hard rule, not a default. Idempotent (firstOrCreate) and
    // safe to call on every PM/Admin show() — already-synced members are a
    // no-op, and only a truly new addition fires the "added to chat"
    // notification (guarded by wasRecentlyCreated).
    public static function syncFormalTeamParticipants(Project $project, ChatThread $thread): void
    {
        $memberIds = static::formalMemberIds($project);
        if ($memberIds->isEmpty()) {
            return;
        }

        $sellerIds = User::whereIn('id', $memberIds)->where('role_type', 'seller')->pluck('id');
        $autoAddIds = $memberIds->diff($sellerIds);

        foreach ($autoAddIds as $userId) {
            $participant = ChatParticipant::firstOrCreate(
                ['thread_id' => $thread->id, 'user_id' => $userId],
                ['role' => 'member', 'joined_at' => now()]
            );

            if (!$participant->wasRecentlyCreated) {
                continue;
            }

            Notification::create([
                'user_id'    => $userId,
                'company_id' => $project->company_id,
                'type'       => 'project_chat_added',
                'title'      => "Added to project chat — {$project->name}",
                'body'       => "You were added to project chat for '{$project->name}'.",
                'data'       => ['project_id' => $project->id, 'thread_id' => $thread->id, 'link' => "/projects/{$project->id}/chat"],
            ]);
        }
    }

    // Call right after a project's seller_id is set (handoff creation in
    // Api\User\ProjectController::store(), or ProjectSellerAssignmentService::
    // assign()) — NOT a violation of syncFormalTeamParticipants()'s "Seller
    // can be added only by Company Admin or Project Manager" rule: assigning
    // seller_id IS that authorized act (Admin's own "Assign Seller" action,
    // or a Seller's own sanctioned self-handoff), it just never also dropped
    // them into chat_participants. Idempotent; creates the thread if needed
    // (a fresh handoff/assignment has no thread yet) and only notifies on a
    // genuinely new add (wasRecentlyCreated), same convention as
    // syncFormalTeamParticipants().
    public static function addSeller(Project $project, int $sellerId): void
    {
        $thread = static::threadFor($project);

        $participant = ChatParticipant::firstOrCreate(
            ['thread_id' => $thread->id, 'user_id' => $sellerId],
            ['role' => 'member', 'joined_at' => now()]
        );

        if (!$participant->wasRecentlyCreated) {
            return;
        }

        Notification::create([
            'user_id'    => $sellerId,
            'company_id' => $project->company_id,
            'type'       => 'project_chat_added',
            'title'      => "Added to project chat — {$project->name}",
            'body'       => "You were added to project chat for '{$project->name}'.",
            'data'       => ['project_id' => $project->id, 'thread_id' => $thread->id, 'link' => "/projects/{$project->id}/chat"],
        ]);
    }

    // Call after a user stops being formally tied to a project (e.g.
    // removed from its team) — if they're no longer eligible via ANY path
    // (team, task/production assignment, or project_manager_id) they lose
    // their chat participant row too, so they immediately stop being
    // taggable/visible in the project's one chat. A no-op if they're still
    // tied some other way (e.g. still assigned to an open task), or if no
    // chat thread exists yet.
    public static function removeParticipantIfNoLongerEligible(Project $project, int $userId): void
    {
        $thread = static::existingThreadFor($project);
        if (!$thread) {
            return;
        }

        if (static::formalMemberIds($project)->contains($userId)) {
            return;
        }

        ChatParticipant::where('thread_id', $thread->id)->where('user_id', $userId)->delete();
    }

    // Users formally tied to the project: PM, team members, task assignees,
    // and each task's production-queue assignee. Mirrors the per-guard
    // projectMemberIds() in both ProjectMessengerControllers exactly, so
    // auto-add/auto-remove here never disagrees with the manual-add
    // eligibility check they enforce.
    private static function formalMemberIds(Project $project)
    {
        $teamIds = $project->teamMembers()->pluck('user_id');
        $taskAssigneeIds = $project->tasks()->whereNotNull('assigned_to')->pluck('assigned_to');
        $productionAssigneeIds = $project->tasks()->with('productionQueue')->get()
            ->pluck('productionQueue.assigned_to')->filter();

        return collect([$project->project_manager_id])
            ->merge($teamIds)->merge($taskAssigneeIds)->merge($productionAssigneeIds)
            ->filter()->unique()->values();
    }
}
