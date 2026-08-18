<?php

namespace App\Http\Controllers\Api\User;

use App\Helpers\ApiResponse;
use App\Http\Controllers\Controller;
use App\Models\Deliverable;
use App\Models\Notification;
use App\Models\ProductionQueue;
use App\Models\Project;
use App\Models\Revision;
use App\Models\SystemAuditLog;
use App\Models\Task;
use App\Models\UserCompanyPermission;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class ProductionController extends Controller
{
    private function user() { return auth('sanctum')->user(); }
    private function userName(): string { return trim((string) ($this->user()->name ?? '')) ?: 'User'; }

    // Surfaces a production/deliverable/revision event in the task's own
    // History feed (not just SystemAuditLog, which the logActivity() below
    // already writes to for company-wide audit purposes) — "who fixed it"
    // per the task activity log. A no-op when there's no task (a
    // project-level deliverable has nowhere to log this).
    private function logTaskRevision(?int $taskId, string $description): void
    {
        if (!$taskId) return;
        Task::find($taskId)?->logActivity('revision', $description, $this->userName());
    }

    // Real-time notification to this task's project PM — PM has no equivalent
    // of Admin's SystemAuditLog-based feed, so production start/submit and
    // revision-resolved events (which only ever wrote to the audit log/task
    // History before) were previously invisible to PM until they happened to
    // check the task page. Self-skipped automatically if the PM is the actor.
    private function notifyPm(Task $task, string $type, string $title, string $message): void
    {
        $projectManagerId = $task->project?->project_manager_id;
        if (!$projectManagerId) return;

        \App\Services\NotificationService::send([
            'company_id'        => $task->project->company_id,
            'recipient_user_id' => $projectManagerId,
            'actor_user_id'     => $this->user()->id,
            'module'            => 'project_management',
            'type'              => $type,
            'title'             => $title,
            'message'           => $message,
            'entity_type'       => 'Task',
            'entity_id'         => $task->id,
            'url'               => "/projects/{$task->project_id}/tasks/{$task->id}",
        ]);
    }

    private function can(string $permKey): bool
    {
        $user = $this->user();
        return UserCompanyPermission::where('user_id', $user->id)
            ->where('company_id', $user->company_id)
            ->where('module_key', 'project_management')
            ->where('permission_key', $permKey)
            ->exists();
    }

    private function logActivity(int $companyId, string $action, string $entityType, int $entityId, array $newValues = []): void
    {
        SystemAuditLog::create([
            'company_id' => $companyId, 'user_id' => $this->user()->id,
            'action' => $action, 'module_key' => 'project_management',
            'entity_type' => $entityType, 'entity_id' => $entityId, 'new_values' => $newValues,
        ]);
    }

    // Shared by uploadDeliverable/approve/reject/requestRevision — skips
    // notifying the actor about their own action (e.g. a PM who is also the
    // uploader wouldn't get pinged about their own submission).
    private function notifyDeliverableEvent(Deliverable $deliverable, ?int $recipientId, int $actorId, string $type, string $title, string $body): void
    {
        if (!$recipientId || $recipientId === $actorId) return;

        Notification::create([
            'user_id'    => $recipientId,
            'company_id' => $deliverable->project->company_id,
            'type'       => $type,
            'title'      => $title,
            'body'       => $body,
            'data'       => ['deliverable_id' => $deliverable->id, 'project_id' => $deliverable->project_id, 'link' => "/projects/{$deliverable->project_id}"],
        ]);
    }

    // Auto-derived progress for a production_queue status — mirrors
    // Admin\ProductionController::progressForStatus() (each controller owns
    // its own helpers per this codebase's convention).
    private function progressForStatus(string $status): int
    {
        return match ($status) {
            'queued'             => 0,
            'in_progress'        => 25,
            'blocked'            => 25,
            'revision_requested' => 50,
            'submitted'          => 75,
            'approved'           => 90,
            'delivered'          => 95,
            'completed'          => 100,
            'rejected'           => 25,
            'cancelled'          => 0,
            default              => 0,
        };
    }

    // Mirrors Api\User\ProjectController::visibleProjects(), ids only.
    private function visibleProjectIds(): array
    {
        $user = $this->user();
        $base = Project::where('company_id', $user->company_id);

        if ($this->can('canViewAllCompanyProjects')) {
            return $base->pluck('id')->all();
        }

        return $base->where(function ($q) use ($user) {
                $q->where('project_manager_id', $user->id)
                  ->orWhereHas('teamMembers', fn($t) => $t->where('user_id', $user->id))
                  ->orWhereHas('tasks', fn($t) => $t->where('assigned_to', $user->id));
            })
            ->pluck('id')->all();
    }

    // Production queue items assigned to the current user.
    public function myQueue(Request $request): JsonResponse
    {
        $user = $this->user();

        $q = ProductionQueue::where('assigned_to', $user->id)
            ->whereHas('task.project', fn($p) => $p->where('company_id', $user->company_id))
            ->with(['task:id,title,project_id,due_date,priority,progress', 'task.project:id,name', 'assignedTo:id,name']);

        if ($request->filled('status')) $q->where('status', $request->status);

        return ApiResponse::success($q->orderByDesc('id')->get());
    }

    // PM-oversight view — all production items across the caller's visible
    // projects (not just their own). Backs the same frontend page as myQueue().
    public function queue(Request $request): JsonResponse
    {
        if (!$this->can('canViewProductionQueue')) {
            return ApiResponse::error('Permission denied', 403);
        }

        $q = ProductionQueue::whereHas('task', fn($t) => $t->whereIn('project_id', $this->visibleProjectIds()))
            ->with([
                'task:id,title,project_id,due_date,priority,progress',
                'task.project:id,name',
                'assignedTo:id,name',
                // Latest deliverable only — the PM acts on the current
                // submission, not older superseded versions.
                'task.deliverables' => fn($d) => $d->orderByDesc('version')->limit(1),
            ]);

        if ($request->filled('status'))      $q->where('status', $request->status);
        if ($request->filled('assigned_to')) $q->where('assigned_to', $request->assigned_to);

        return ApiResponse::success($q->orderBy('priority_order')->orderByDesc('id')->get());
    }

    public function start(int $id): JsonResponse
    {
        if (!$this->can('canStartProductionTasks')) {
            return ApiResponse::error('Permission denied', 403);
        }

        $item = $this->ownQueueItem($id);
        // Starting an unclaimed item claims it — otherwise it stays
        // assigned_to null forever (nothing else ever sets it) and every
        // later action on it would hit the very same "nobody owns this" gap.
        $item->update(['status' => 'in_progress', 'started_at' => $item->started_at ?? now(), 'assigned_to' => $item->assigned_to ?? $this->user()->id]);
        Task::where('id', $item->task_id)->update(['progress' => $this->progressForStatus('in_progress')]);

        $this->logActivity($item->task->project->company_id, 'task_started', 'Task', $item->task_id);
        $this->logTaskRevision($item->task_id, "{$this->userName()} started work on this task");
        $this->notifyPm($item->task, 'production_task_started', 'Production task started', "{$this->userName()} started working on task '{$item->task->task_number} - {$item->task->title}'.");

        return ApiResponse::success($item, 'Production task started');
    }

    public function submit(int $id): JsonResponse
    {
        if (!$this->can('canSubmitProductionTasks')) {
            return ApiResponse::error('Permission denied', 403);
        }

        $item = $this->ownQueueItem($id);
        // Same defensive claim as start() — covers an item that reached
        // 'in_progress' still unassigned (e.g. an Admin moved it there
        // directly via updateQueueItem() without picking a specific owner).
        $item->update(['status' => 'submitted', 'submitted_at' => now(), 'assigned_to' => $item->assigned_to ?? $this->user()->id]);
        Task::where('id', $item->task_id)->update(['progress' => $this->progressForStatus('submitted')]);

        $this->logActivity($item->task->project->company_id, 'task_submitted_for_review', 'Task', $item->task_id);
        $this->logTaskRevision($item->task_id, "{$this->userName()} submitted this task for review");
        $this->notifyPm($item->task, 'production_task_submitted', 'Task submitted for review', "{$this->userName()} submitted task '{$item->task->task_number} - {$item->task->title}' for review.");

        return ApiResponse::success($item, 'Production task submitted');
    }

    // Approves a submitted production queue item DIRECTLY, for the common
    // case where there's no Deliverable file to review at all (e.g. "the
    // work is live on the site, nothing to attach") — Submit (above) and
    // uploading a Deliverable are two entirely separate, unlinked actions in
    // this app, and every OTHER approval path
    // (approve()/Api\Admin\ProductionController::verifyDeliverable()) only
    // ever flips a queue item to 'approved' as a side effect of approving
    // its linked Deliverable. A task that never gets one had no way to ever
    // leave 'submitted' — permanently stuck at 75% progress and permanently
    // blocking "Mark as Complete" (ProjectCompletionService's
    // pending_production check), with no button anywhere for a PM to clear
    // it. Mirrors approve()'s side effects exactly (task progress/
    // approved_at/delivered_at, the 'qa_passed' status transition) — just
    // keyed off the ProductionQueue id instead of a Deliverable id, and
    // notifies whoever the item is assigned to instead of a Deliverable's
    // uploader.
    public function approveQueueItem(int $id): JsonResponse
    {
        if (!$this->can('canApproveDeliverables')) {
            return ApiResponse::error('Permission denied', 403);
        }

        $item = $this->visibleQueueItem($id);

        if ($item->status !== 'submitted') {
            return ApiResponse::error('Only a submitted production task can be approved this way.', 422);
        }

        $item->update(['status' => 'approved']);

        $task = $item->task;
        $task->update([
            'progress'     => $this->progressForStatus('approved'),
            'approved_at'  => now(),
            'delivered_at' => now(),
        ]);

        \App\Services\TaskStatusService::applyTransition($task, 'qa_passed', null, [
            'type' => 'user', 'id' => $this->user()->id, 'name' => $this->userName(),
        ]);

        $this->logActivity($task->project->company_id, 'production_task_approved', 'Task', $item->task_id);
        $this->logTaskRevision($item->task_id, "{$this->userName()} approved this task's production work");

        if ($item->assigned_to && (int) $item->assigned_to !== (int) $this->user()->id) {
            Notification::create([
                'user_id'    => $item->assigned_to,
                'company_id' => $task->project->company_id,
                'type'       => 'production_task_approved',
                'title'      => 'Production task approved',
                'body'       => "Your submitted work on task '{$task->task_number} - {$task->title}' was approved.",
                'data'       => ['project_id' => $task->project_id, 'link' => "/projects/{$task->project_id}/tasks/{$task->id}"],
            ]);
        }

        return ApiResponse::success($item->fresh(), 'Production task approved');
    }

    // Mirrors the visibility scope in Api\User\ProjectController::visibleProjects().
    private function visibleProject(int $projectId): Project
    {
        $user = $this->user();

        $base = Project::where('company_id', $user->company_id);

        if ($this->can('canViewAllCompanyProjects')) {
            return $base->findOrFail($projectId);
        }

        return $base->where(function ($q) use ($user) {
                $q->where('project_manager_id', $user->id)
                  ->orWhereHas('teamMembers', fn($t) => $t->where('user_id', $user->id))
                  ->orWhereHas('tasks', fn($t) => $t->where('assigned_to', $user->id));
            })
            ->findOrFail($projectId);
    }

    // GET — list deliverables for a visible project (no read endpoint existed before).
    public function deliverables(int $projectId): JsonResponse
    {
        if (!$this->can('canViewDeliverables')) {
            return ApiResponse::error('Permission denied', 403);
        }

        $project = $this->visibleProject($projectId);

        $deliverables = Deliverable::where('project_id', $project->id)
            ->with(['uploadedBy:id,name', 'task:id,title'])
            ->orderByDesc('id')
            ->get();

        return ApiResponse::success($deliverables);
    }

    public function uploadDeliverable(Request $request, int $projectId): JsonResponse
    {
        if (!$this->can('canUploadDeliverables')) {
            return ApiResponse::error('Permission denied', 403);
        }

        $user = $this->user();

        $validated = $request->validate([
            'task_id' => ['nullable', 'integer', 'exists:tasks,id'],
            'file'    => ['required', 'file', 'max:51200'],
            'title'   => ['required', 'string', 'max:255'],
        ]);

        // Unchanged from before this fix — upload scope stays company-wide,
        // not narrowed to visibleProject(), to avoid altering existing behavior.
        $project = Project::where('company_id', $user->company_id)->findOrFail($projectId);

        if ($project->isDraft()) {
            return ApiResponse::error(Project::DRAFT_BLOCKED_MESSAGE, 422);
        }

        if ($project->status === 'closed') {
            return ApiResponse::error('This project is closed and read-only. Reopen it first to make changes.', 422);
        }

        $file = $request->file('file');
        $path = $file->store($project->storage_folder . '/deliverables');

        // 'delivered' now represents the post-approval terminal state (see
        // approve()) — a fresh upload is awaiting review, so it starts as
        // 'submitted' instead. version increments per task so re-submissions
        // after a revision request are distinguishable.
        $version = ($validated['task_id'] ?? null)
            ? (Deliverable::where('task_id', $validated['task_id'])->max('version') + 1)
            : 1;

        $deliverable = Deliverable::create([
            'project_id'      => $project->id,
            'task_id'         => $validated['task_id'] ?? null,
            'uploaded_by'     => $user->id,
            'title'           => $validated['title'],
            'file_path'       => $path,
            'file_name'       => $file->getClientOriginalName(),
            'file_type'       => $file->getClientOriginalExtension(),
            'file_size_bytes' => $file->getSize(),
            'status'          => 'submitted',
            'version'         => $version,
            'submitted_at'    => now(),
        ]);

        $this->logActivity($project->company_id, 'deliverable_uploaded', $deliverable->task_id ? 'Task' : 'Project', $deliverable->task_id ?? $project->id, ['deliverable_id' => $deliverable->id, 'version' => $version]);
        $this->logTaskRevision($deliverable->task_id, "{$this->userName()} uploaded deliverable \"{$deliverable->title}\" (v{$version})");

        $submittedTask = $deliverable->task_id ? Task::find($deliverable->task_id) : null;
        $taskTitle = $submittedTask?->title;
        $taskNumber = $submittedTask?->task_number;
        $this->notifyDeliverableEvent(
            $deliverable, $project->project_manager_id, $user->id,
            'deliverable_submitted', 'Deliverable submitted for review',
            $taskTitle
                ? "{$user->name} submitted deliverable for task {$taskNumber} - \"{$taskTitle}\" in project \"{$project->name}\"."
                : "{$user->name} submitted a deliverable in project \"{$project->name}\"."
        );

        return ApiResponse::success($deliverable, 'Deliverable uploaded', 201);
    }

    public function resolveRevision(int $id): JsonResponse
    {
        if (!$this->can('canResolveRevisions')) {
            return ApiResponse::error('Permission denied', 403);
        }

        $user = $this->user();

        $revision = Revision::whereHas('deliverable.project', fn($p) => $p->where('company_id', $user->company_id))
            ->findOrFail($id);

        $revision->update(['status' => 'resolved', 'resolved_at' => now()]);

        $deliverable = $revision->deliverable;
        $this->logActivity($deliverable->project->company_id, 'revision_resolved', $deliverable->task_id ? 'Task' : 'Project', $deliverable->task_id ?? $deliverable->project_id, ['revision_id' => $revision->id]);
        $this->logTaskRevision($deliverable->task_id, "{$this->userName()} fixed/resolved the requested revision");

        if ($deliverable->task_id && ($task = Task::find($deliverable->task_id))) {
            $this->notifyPm($task, 'revision_resolved', 'Revision resolved', "{$this->userName()} resolved the requested revision for task '{$task->task_number} - {$task->title}'.");
        }

        return ApiResponse::success($revision, 'Revision resolved');
    }

    // Project Manager (staff) requests a revision on a submitted deliverable.
    public function requestRevision(Request $request, int $id): JsonResponse
    {
        if (!$this->can('canCreateRevisions')) {
            return ApiResponse::error('Permission denied', 403);
        }

        $user = $this->user();

        $deliverable = Deliverable::whereHas('project', fn($p) => $p->where('company_id', $user->company_id))
            ->findOrFail($id);

        // QA Failed / Revision Required requires a reason when it drives a
        // linked task's status — a project-level deliverable (no task_id)
        // keeps the feedback optional as before.
        $validated = $request->validate([
            'feedback' => [$deliverable->task_id ? 'required' : 'nullable', 'string', 'max:1000'],
        ]);

        $revision = Revision::create([
            'deliverable_id' => $deliverable->id,
            'requested_by'   => $user->id,
            'feedback'       => $validated['feedback'] ?? null,
            'status'         => 'open',
        ]);

        $deliverable->update(['status' => 'revision_requested']);

        // Sync the linked production_queue row so the production user's queue
        // visibly reflects the revision request (previously never written).
        if ($deliverable->task_id) {
            ProductionQueue::where('task_id', $deliverable->task_id)->update(['status' => 'revision_requested']);
            $task = Task::find($deliverable->task_id);
            if ($task) {
                $task->update(['progress' => $this->progressForStatus('revision_requested')]);
                \App\Services\TaskStatusService::applyTransition($task, 'qa_failed', $validated['feedback'] ?? null, [
                    'type' => 'user', 'id' => $user->id, 'name' => $this->userName(),
                ]);
            }
        }

        $this->logActivity($deliverable->project->company_id, 'revision_requested', $deliverable->task_id ? 'Task' : 'Project', $deliverable->task_id ?? $deliverable->project_id, ['deliverable_id' => $deliverable->id, 'revision_id' => $revision->id]);
        $this->logTaskRevision($deliverable->task_id, "{$this->userName()} requested a revision" . (!empty($validated['feedback']) ? ": " . \Illuminate\Support\Str::limit($validated['feedback'], 80) : ''));

        $taskTitle = $deliverable->task?->title;
        $taskNumber = $deliverable->task?->task_number;
        $this->notifyDeliverableEvent(
            $deliverable, $deliverable->uploaded_by, $user->id,
            'revision_requested', 'Revision requested',
            $taskTitle
                ? "{$user->name} requested revision on task {$taskNumber} - \"{$taskTitle}\" in project \"{$deliverable->project->name}\"."
                : "{$user->name} requested revision on your deliverable in project \"{$deliverable->project->name}\"."
        );

        return ApiResponse::success($revision->load('requestedBy:id,name'), 'Revision requested', 201);
    }

    // PM approves a submitted deliverable — closes the loop across all three
    // entities: Deliverable, ProductionQueue, Task. Under the QA pipeline
    // (see TaskStatusService), approving a deliverable now means "QA Passed"
    // rather than auto-completing the task outright — PM/QA/Admin must still
    // explicitly move it Ready for Production -> In Production -> Done.
    public function approve(int $id): JsonResponse
    {
        if (!$this->can('canApproveDeliverables')) {
            return ApiResponse::error('Permission denied', 403);
        }

        $deliverable = Deliverable::whereHas('project', fn($p) => $p->whereIn('id', $this->visibleProjectIds()))
            ->findOrFail($id);

        DB::transaction(function () use ($deliverable) {
            $deliverable->update(['status' => 'approved', 'approved_at' => now()]);

            if ($deliverable->task_id) {
                ProductionQueue::where('task_id', $deliverable->task_id)->update(['status' => 'approved']);

                $task = Task::find($deliverable->task_id);
                if ($task) {
                    $task->update([
                        'progress'     => $this->progressForStatus('approved'),
                        'approved_at'  => now(),
                        'delivered_at' => now(),
                    ]);

                    \App\Services\TaskStatusService::applyTransition($task, 'qa_passed', null, [
                        'type' => 'user', 'id' => $this->user()->id, 'name' => $this->userName(),
                    ]);
                }
            }
        });

        $this->logActivity($deliverable->project->company_id, 'deliverable_approved', $deliverable->task_id ? 'Task' : 'Project', $deliverable->task_id ?? $deliverable->project_id, ['deliverable_id' => $deliverable->id]);
        $this->logTaskRevision($deliverable->task_id, "{$this->userName()} approved this task's deliverable");

        $taskTitle = $deliverable->task?->title;
        $taskNumber = $deliverable->task?->task_number;
        $this->notifyDeliverableEvent(
            $deliverable, $deliverable->uploaded_by, $this->user()->id,
            'deliverable_approved', 'Deliverable approved',
            $taskTitle
                ? "Your deliverable for task {$taskNumber} - \"{$taskTitle}\" has been approved."
                : "Your deliverable in project \"{$deliverable->project->name}\" has been approved."
        );

        return ApiResponse::success($deliverable->fresh(), 'Deliverable approved');
    }

    // PM rejects a submitted deliverable — a harsher outcome than Request
    // Revision; the linked task is left actionable (not completed).
    public function reject(Request $request, int $id): JsonResponse
    {
        if (!$this->can('canApproveDeliverables')) {
            return ApiResponse::error('Permission denied', 403);
        }

        $deliverable = Deliverable::whereHas('project', fn($p) => $p->whereIn('id', $this->visibleProjectIds()))
            ->findOrFail($id);

        // QA Failed / Revision Required requires a reason when it drives a
        // linked task's status — a project-level deliverable (no task_id)
        // keeps the feedback optional as before.
        $validated = $request->validate([
            'feedback' => [$deliverable->task_id ? 'required' : 'nullable', 'string', 'max:1000'],
        ]);

        DB::transaction(function () use ($deliverable, $validated) {
            $deliverable->update(['status' => 'rejected']);

            if ($deliverable->task_id) {
                ProductionQueue::where('task_id', $deliverable->task_id)->update(['status' => 'rejected']);
                $task = Task::find($deliverable->task_id);
                if ($task) {
                    $task->update(['progress' => $this->progressForStatus('rejected')]);
                    \App\Services\TaskStatusService::applyTransition($task, 'qa_failed', $validated['feedback'] ?? null, [
                        'type' => 'user', 'id' => $this->user()->id, 'name' => $this->userName(),
                    ]);
                }
            }

            if (!empty($validated['feedback'])) {
                Revision::create([
                    'deliverable_id' => $deliverable->id,
                    'requested_by'   => $this->user()->id,
                    'feedback'       => $validated['feedback'],
                    'status'         => 'open',
                ]);
            }
        });

        $this->logActivity($deliverable->project->company_id, 'deliverable_rejected', $deliverable->task_id ? 'Task' : 'Project', $deliverable->task_id ?? $deliverable->project_id, ['deliverable_id' => $deliverable->id]);
        $this->logTaskRevision($deliverable->task_id, "{$this->userName()} rejected this task's deliverable" . (!empty($validated['feedback']) ? ": " . \Illuminate\Support\Str::limit($validated['feedback'], 80) : ''));

        $taskTitle = $deliverable->task?->title;
        $taskNumber = $deliverable->task?->task_number;
        $this->notifyDeliverableEvent(
            $deliverable, $deliverable->uploaded_by, $this->user()->id,
            'deliverable_rejected', 'Deliverable rejected',
            $taskTitle
                ? "Your deliverable for task {$taskNumber} - \"{$taskTitle}\" was rejected."
                : "Your deliverable in project \"{$deliverable->project->name}\" was rejected."
        );

        return ApiResponse::success($deliverable->fresh(), 'Deliverable rejected');
    }

    // GET /user/deliverables/{id}/revisions
    public function revisions(int $deliverableId): JsonResponse
    {
        if (!$this->can('canViewDeliverables')) {
            return ApiResponse::error('Permission denied', 403);
        }

        $deliverable = Deliverable::whereHas('project', fn($p) => $p->whereIn('id', $this->visibleProjectIds()))
            ->findOrFail($deliverableId);

        return ApiResponse::success($deliverable->revisions()->with('requestedBy:id,name')->orderByDesc('id')->get());
    }

    // A queue item reaches here if: it's already claimed by this exact user,
    // it's still unclaimed (assigned_to null — e.g. TaskStatusService::
    // applyTransition() created it with no specific handoff target, so it
    // broadcast to every production_user team member instead of one person),
    // OR the caller is PM-tier for this item's project (canViewAllCompanyProjects,
    // or literally that project's own project_manager_id) — the same
    // oversight authority queue() itself is gated on. Without that last
    // clause, a PM viewing the full oversight queue() list (which shows
    // every item across their visible projects, whoever claimed it) would
    // hit "No query results for model [ProductionQueue]" clicking
    // Start/Submit on an item a production teammate had already claimed —
    // a perfectly valid row, just excluded by an ownership check that only
    // ever anticipated a plain production teammate acting on their own work.
    private function ownQueueItem(int $id): ProductionQueue
    {
        $user = $this->user();

        // company_id must stay in this column list — start()/submit() read
        // $item->task->project->company_id afterward, and this eager-load's
        // column-limited relation means that access can never fall back to
        // a fresh lazy-load if it's missing here (it silently returns null
        // instead, which then blew up logActivity()'s int $companyId param).
        $item = ProductionQueue::whereHas('task.project', fn ($p) => $p->where('company_id', $user->company_id))
            ->with('task.project:id,company_id,project_manager_id')
            ->findOrFail($id);

        $isPmTier = $this->can('canViewAllCompanyProjects')
            || (int) $item->task->project->project_manager_id === (int) $user->id;

        if (!$isPmTier && $item->assigned_to !== null && (int) $item->assigned_to !== (int) $user->id) {
            abort(404, 'Production queue item not found or not assigned to you.');
        }

        return $item;
    }

    // For approveQueueItem() — approving is a review action, not "my own
    // work," so it's scoped by project visibility (same oversight scope
    // queue() itself lists items under) rather than ownQueueItem()'s
    // self-assigned-or-unclaimed rule: the approver is typically NOT the
    // person who did the work.
    private function visibleQueueItem(int $id): ProductionQueue
    {
        return ProductionQueue::whereHas('task.project', fn ($p) => $p->whereIn('id', $this->visibleProjectIds()))
            ->with('task.project:id,company_id,project_manager_id')
            ->findOrFail($id);
    }
}
