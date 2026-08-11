<?php

namespace App\Services;

use App\Models\ProjectTeamMember;
use App\Models\Task;

// Single source of truth for the Task status pipeline (To Do -> In Progress
// -> Blocked -> Ready for QA -> In QA/Testing -> QA Failed/QA Passed ->
// Ready for Production -> In Production -> Done/Completed), shared by both
// Api\Admin\TaskController::update() and Api\User\TaskController::update()
// so the two guards can't drift apart on who's allowed to move a task
// where. 'review' and 'cancelled' stay legal legacy/side statuses (see
// Task::STATUS_LABELS) reachable only via the PM/Admin override path below,
// not part of the guided matrix.
class TaskStatusService
{
    private const REQUIRES_COMMENT = ['blocked', 'qa_failed'];

    // Statuses that get their own dedicated task_activities entry type
    // ('qa_status_changed') instead of the generic 'status_changed'.
    private const QA_PIPELINE_STATUSES = ['ready_for_qa', 'in_qa', 'qa_failed', 'qa_passed', 'ready_for_production', 'in_production'];

    /**
     * @param array $actor [
     *   'type' => 'user'|'admin', 'id' => int, 'name' => string,
     *   'is_pm' => bool, 'is_assignee' => bool, 'role_type' => ?string,
     *   'perms' => string[] (granted project_management permission keys — User guard only, ignored for Admin),
     * ]
     * @return array{allowed: bool, reason: ?string, requires_comment: bool}
     */
    public static function canTransition(Task $task, string $to, array $actor): array
    {
        $from = $task->status;
        $requiresComment = in_array($to, self::REQUIRES_COMMENT, true);

        if ($from === $to) {
            return ['allowed' => true, 'reason' => null, 'requires_comment' => false];
        }

        // Company Admin always overrides (no permission gate on that guard
        // today, matching "Company Admin: can change any task status"). A
        // User-guard actor with canOverrideTaskStatus (PM gets this by
        // default) also bypasses the matrix entirely — the literal "override
        // if needed" escape hatch. A Developer/Team Member who is the
        // assignee gets the same free rein on their OWN task — they're the
        // ones doing the work and shouldn't be blocked by the guided
        // QA-pipeline matrix, which is really aimed at cross-role handoffs.
        $isDevOrTeamAssignee = ($actor['is_assignee'] ?? false) && in_array($actor['role_type'] ?? null, ['developer', 'team_member'], true);
        if ($actor['type'] === 'admin' || in_array('canOverrideTaskStatus', $actor['perms'] ?? [], true) || $isDevOrTeamAssignee) {
            return ['allowed' => true, 'reason' => null, 'requires_comment' => $requiresComment];
        }

        $has = fn (string $perm) => in_array($perm, $actor['perms'] ?? [], true);
        $isAssignee = $actor['is_assignee'] ?? false;
        $isPm = $actor['is_pm'] ?? false;

        $allowed = match (true) {
            $from === 'todo' && $to === 'in_progress' => $isAssignee || $isPm || $has('canEditTasks'),
            $from === 'in_progress' && $to === 'blocked' => $isAssignee || $isPm || $has('canMarkTaskBlocked'),
            $from === 'blocked' && $to === 'in_progress' => $isAssignee || $isPm || $has('canMarkTaskBlocked'),
            $from === 'in_progress' && $to === 'ready_for_qa' => $isAssignee || $isPm || $has('canEditTasks'),
            $from === 'ready_for_qa' && $to === 'in_qa' => $isPm || $has('canVerifyDeliverables'),
            $from === 'in_qa' && $to === 'qa_failed' => $isPm || $has('canVerifyDeliverables'),
            $from === 'in_qa' && $to === 'qa_passed' => $isPm || $has('canVerifyDeliverables'),
            $from === 'qa_passed' && $to === 'ready_for_production' => $isPm || $has('canVerifyDeliverables'),
            $from === 'qa_failed' && $to === 'in_progress' => $isAssignee || $isPm || $has('canEditTasks'),
            $from === 'ready_for_production' && $to === 'in_production' => $isPm || $has('canAssignProductionTasks'),
            $from === 'in_production' && $to === 'completed' => $isPm || $has('canCompleteTasks'),
            $from === 'completed' => $isPm || $has('canReopenTasks'), // reopen, to any other status
            $to === 'cancelled' => $isPm,
            default => false,
        };

        return [
            'allowed'          => $allowed,
            'reason'           => $allowed ? null : "You don't have permission to move this task from \"" . self::label($from) . "\" to \"" . self::label($to) . "\".",
            'requires_comment' => $requiresComment,
        ];
    }

    // Stamps the QA-pipeline timestamp/verdict columns, the status-changing
    // actor, writes the task_activities entry, and fires the transition's
    // notifications. Callers still do their own $task->update() for
    // non-status fields (title/assignee/etc.) — this only owns the
    // status-transition side effects.
    public static function applyTransition(Task $task, string $to, ?string $comment, array $actor, ?int $qaAssignedTo = null, ?int $productionAssignedTo = null): void
    {
        $from = $task->status;
        $now = now();

        $update = ['status' => $to];
        if ($actor['type'] === 'user') {
            $update['status_changed_by_user_id']  = $actor['id'];
            $update['status_changed_by_admin_id'] = null;
        } else {
            $update['status_changed_by_admin_id'] = $actor['id'];
            $update['status_changed_by_user_id']  = null;
        }

        if ($to === 'ready_for_qa')         { $update['ready_for_qa_at'] = $now; $update['qa_assigned_to'] = $qaAssignedTo; }
        if ($to === 'in_qa')                { $update['qa_started_at'] = $now; $update['qa_status'] = 'in_qa'; }
        if ($to === 'qa_failed')            { $update['qa_completed_at'] = $now; $update['qa_status'] = 'failed'; }
        if ($to === 'qa_passed')            { $update['qa_completed_at'] = $now; $update['qa_status'] = 'passed'; }
        // Optional — unlike qa_assigned_to, a null value here is a legitimate
        // "not handed to anyone specific" choice, not a validation failure.
        if ($to === 'ready_for_production') { $update['ready_for_production_at'] = $now; $update['production_assigned_to'] = $productionAssignedTo; }
        if ($to === 'completed')            $update['completed_at'] = $task->completed_at ?? $now;

        $task->update($update);

        $actorName = $actor['name'] ?? ($actor['type'] === 'admin' ? 'Admin' : 'User');
        $logType = in_array($to, self::QA_PIPELINE_STATUSES, true) ? 'qa_status_changed' : ($to === 'completed' ? 'completed' : 'status_changed');

        $description = match ($to) {
            'blocked'              => "{$actorName} marked task {$task->task_number} as Blocked" . ($comment ? ": {$comment}" : '.'),
            'qa_failed'            => "{$actorName} marked task {$task->task_number} as QA Failed" . ($comment ? ": {$comment}" : '.'),
            'qa_passed'            => "{$actorName} marked task {$task->task_number} as QA Passed.",
            'ready_for_production' => "{$actorName} marked task {$task->task_number} as Ready for Production." . ($comment ? " {$comment}" : ''),
            'completed'            => "{$actorName} marked task {$task->task_number} as Done / Completed.",
            default                => "{$actorName} moved task {$task->task_number} from " . self::label($from) . ' to ' . self::label($to) . '.',
        };

        $task->logActivity($logType, $description, $actorName, array_filter([
            'old_status' => $from, 'new_status' => $to, 'comment' => $comment,
        ], fn ($v) => $v !== null));

        self::notify($task, $to, $comment, $actor);
    }

    private static function label(string $status): string
    {
        return Task::STATUS_LABELS[$status] ?? str_replace('_', ' ', $status);
    }

    private static function notify(Task $task, string $to, ?string $comment, array $actor): void
    {
        $project = $task->project;
        if (!$project) return;

        $common = [
            'company_id'  => $project->company_id,
            'module'      => 'project_management',
            'entity_type' => 'Task',
            'entity_id'   => $task->id,
            'url'         => "/projects/{$project->id}/tasks/{$task->id}",
        ];
        $actorKey = $actor['type'] === 'admin' ? ['actor_admin_id' => $actor['id']] : ['actor_user_id' => $actor['id']];
        $actorAdminIdForCoAdmins = $actor['type'] === 'admin' ? $actor['id'] : null;

        if ($to === 'ready_for_qa') {
            $recipients = [];
            if ($project->project_manager_id) $recipients[] = ['user_id' => $project->project_manager_id];
            // Optional handoff to one specific QA user, if already set —
            // otherwise there's simply no extra recipient here beyond the PM.
            if ($task->qa_assigned_to) $recipients[] = ['user_id' => $task->qa_assigned_to];

            NotificationService::sendToMany($recipients, array_merge($common, $actorKey, [
                'type'    => 'task_ready_for_qa',
                'title'   => 'Task ready for QA',
                'message' => "Task '{$task->task_number} - {$task->title}' is ready for QA testing.",
            ]));
        }

        if ($to === 'qa_failed') {
            $recipients = [];
            if ($task->assigned_to) $recipients[] = ['user_id' => $task->assigned_to];
            if ($project->project_manager_id) $recipients[] = ['user_id' => $project->project_manager_id];

            NotificationService::sendToMany($recipients, array_merge($common, $actorKey, [
                'type'    => 'task_qa_failed',
                'title'   => 'QA Failed / Revision Required',
                'message' => "QA marked task '{$task->task_number} - {$task->title}' as QA Failed" . ($comment ? ": {$comment}" : '.'),
            ]));
        }

        if ($to === 'ready_for_production') {
            $recipients = [];
            if ($project->project_manager_id) $recipients[] = ['user_id' => $project->project_manager_id];
            // A specific Production/Deployment user handoff (optional) takes
            // priority; otherwise fall back to broadcasting to every
            // production_user-role team member on the project, as before.
            if ($task->production_assigned_to) {
                $recipients[] = ['user_id' => $task->production_assigned_to];
            } else {
                foreach (ProjectTeamMember::where('project_id', $project->id)->where('role_in_project', 'production_user')->pluck('user_id') as $id) {
                    $recipients[] = ['user_id' => $id];
                }
            }

            NotificationService::sendToMany($recipients, array_merge($common, $actorKey, [
                'type'    => 'task_ready_for_production',
                'title'   => 'Task ready for production',
                'message' => "Task '{$task->task_number} - {$task->title}' passed QA and is ready for production.",
            ]));

            NotificationService::notifyCompanyAdmins($project->company_id, $actorAdminIdForCoAdmins, array_merge($common, [
                'type'    => 'task_ready_for_production',
                'title'   => 'Task ready for production',
                'message' => "Task '{$task->task_number} - {$task->title}' passed QA and is ready for production.",
            ]));
        }

        if ($to === 'completed') {
            $recipients = [];
            if ($task->assigned_to) $recipients[] = ['user_id' => $task->assigned_to];

            NotificationService::sendToMany($recipients, array_merge($common, $actorKey, [
                'type'    => 'task_completed',
                'title'   => 'Task completed',
                'message' => "Task '{$task->task_number} - {$task->title}' was marked Done / Completed.",
            ]));

            NotificationService::notifyCompanyAdmins($project->company_id, $actorAdminIdForCoAdmins, array_merge($common, [
                'type'    => 'task_completed',
                'title'   => 'Task completed',
                'message' => "Task '{$task->task_number} - {$task->title}' was marked Done / Completed.",
            ]));
        }
    }
}
