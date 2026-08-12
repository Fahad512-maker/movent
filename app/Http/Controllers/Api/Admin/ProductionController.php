<?php

namespace App\Http\Controllers\Api\Admin;

use App\Helpers\ApiResponse;
use App\Http\Controllers\Controller;
use App\Models\Deliverable;
use App\Models\Notification;
use App\Models\Project;
use App\Models\ProductionQueue;
use App\Models\Revision;
use App\Models\SystemAuditLog;
use App\Models\Task;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class ProductionController extends Controller
{
    // Mirrors the production_queue.status enum — widened to cover the full
    // production task flow (Assigned/In Progress/Blocked/Submitted/Revision
    // Requested/Approved/Delivered/Completed/Cancelled). 'queued' == Assigned,
    // 'rejected' kept only for backward compatibility with any existing rows.
    private const QUEUE_STATUSES = 'queued,in_progress,blocked,submitted,revision_requested,approved,delivered,completed,rejected,cancelled';

    private function admin()   { return auth('admin')->user(); }
    private function adminName(): string { return trim((string) ($this->admin()->name ?? '')) ?: 'Admin'; }
    private function companyIds(): array
    {
        return $this->admin()->companies()->pluck('id')->toArray();
    }

    // Mirrors Api\User\ProductionController::notifyDeliverableEvent() — no
    // actor-equality check needed here (Company Admin can never collide with
    // a `users.id` recipient), just a null-recipient guard for the case where
    // uploaded_by/project_manager_id isn't set.
    private function notifyDeliverableEvent(Deliverable $deliverable, ?int $recipientId, string $type, string $title, string $body): void
    {
        if (!$recipientId) return;

        Notification::create([
            'user_id'    => $recipientId,
            'company_id' => $deliverable->project->company_id,
            'type'       => $type,
            'title'      => $title,
            'body'       => $body,
            'data'       => ['deliverable_id' => $deliverable->id, 'project_id' => $deliverable->project_id, 'link' => "/projects/{$deliverable->project_id}"],
        ]);
    }

    // Auto-derived progress for a production_queue status — no manual UI
    // input, just a stored percentage read-only in the Production Queue UI.
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

    // GET /admin/production/queue — all production tasks across the admin's companies
    public function queue(Request $request): JsonResponse
    {
        $q = ProductionQueue::whereHas('task.project', fn($p) => $p->whereIn('company_id', $this->companyIds()))
            ->with(['task:id,title,project_id,due_date,priority,progress', 'task.project:id,name', 'assignedTo:id,name']);

        if ($request->filled('status'))      $q->where('status', $request->status);
        if ($request->filled('assigned_to')) $q->where('assigned_to', $request->assigned_to);

        return ApiResponse::success($q->orderBy('priority_order')->orderByDesc('id')->get());
    }

    public function updateQueueItem(Request $request, int $id): JsonResponse
    {
        $item = ProductionQueue::whereHas('task.project', fn($p) => $p->whereIn('company_id', $this->companyIds()))
            ->findOrFail($id);

        $validated = $request->validate([
            'status'         => ['sometimes', 'in:' . self::QUEUE_STATUSES],
            'assigned_to'    => ['nullable', 'integer', 'exists:users,id'],
            'priority_order' => ['sometimes', 'integer'],
        ]);

        if (($validated['status'] ?? null) === 'in_progress' && !$item->started_at) {
            $validated['started_at'] = now();
        }
        if (($validated['status'] ?? null) === 'submitted') {
            $validated['submitted_at'] = now();
        }

        $wasStatus = $item->status;
        $wasAssignee = $item->assigned_to;
        $item->update($validated);

        if (isset($validated['assigned_to']) && $validated['assigned_to'] !== $wasAssignee) {
            // Notification.user_id is NOT NULL — unassigning (new value
            // null) must never reach Notification::create, or it throws a
            // DB constraint violation.
            if ($validated['assigned_to']) {
                Notification::create([
                    'user_id'    => $validated['assigned_to'],
                    'company_id' => $item->task->project->company_id,
                    'type'       => 'production_task_assigned',
                    'title'      => 'Production task assigned',
                    'body'       => "You were assigned production task {$item->task->task_number} - \"{$item->task->title}\".",
                    'data'       => ['task_id' => $item->task_id, 'link' => "/projects/{$item->task->project_id}/tasks/{$item->task_id}"],
                ]);
            }

            $oldName = $wasAssignee ? (\App\Models\User::find($wasAssignee)?->name ?? 'someone') : null;
            $newName = $validated['assigned_to'] ? (\App\Models\User::find($validated['assigned_to'])?->name ?? 'someone') : null;
            $description = $newName
                ? ($oldName ? "Production task reassigned from {$oldName} to {$newName}" : "Production task assigned to {$newName}")
                : "Production task unassigned from {$oldName}";
            Task::find($item->task_id)?->logActivity('assigned', $description, $this->adminName(), ['from' => $wasAssignee, 'to' => $validated['assigned_to']]);
        }

        if (isset($validated['status']) && $validated['status'] !== $wasStatus) {
            Task::where('id', $item->task_id)->update(['progress' => $this->progressForStatus($validated['status'])]);

            SystemAuditLog::create([
                'company_id'  => $item->task->project->company_id,
                'user_id'     => null, // Company Admin actor isn't a User row
                'action'      => 'production_' . $validated['status'],
                'module_key'  => 'project_management',
                'entity_type' => 'Task',
                'entity_id'   => $item->task_id,
                'new_values'  => ['status' => $validated['status']],
            ]);

            Task::find($item->task_id)?->logActivity(
                'revision',
                "{$this->adminName()} updated production status to " . str_replace('_', ' ', $validated['status']),
                $this->adminName()
            );

            // Real-time notification to the PM — this status change (start/
            // submit/blocked/etc.) previously had no Notification at all,
            // only the SystemAuditLog/History entries above.
            $task = $item->task;
            $projectManagerId = $task?->project?->project_manager_id;
            if ($task && $projectManagerId) {
                \App\Services\NotificationService::send([
                    'company_id'         => $task->project->company_id,
                    'recipient_user_id'  => $projectManagerId,
                    'actor_admin_id'     => $this->admin()->id,
                    'module'             => 'project_management',
                    'type'               => 'production_status_changed',
                    'title'              => 'Production task updated',
                    'message'            => "{$this->adminName()} updated production status of task '{$task->task_number} - {$task->title}' to " . str_replace('_', ' ', $validated['status']) . ".",
                    'entity_type'        => 'Task',
                    'entity_id'          => $task->id,
                    'url'                => "/projects/{$task->project_id}/tasks/{$task->id}",
                ]);
            }
        }

        return ApiResponse::success($item->fresh(['task', 'assignedTo']), 'Production item updated');
    }

    // GET /admin/production/dashboard — summary counts across the admin's companies
    public function dashboard(): JsonResponse
    {
        $base = ProductionQueue::whereHas('task.project', fn ($p) => $p->whereIn('company_id', $this->companyIds()));

        $counts = (clone $base)->selectRaw('status, COUNT(*) as total')->groupBy('status')->pluck('total', 'status');

        $overdue = (clone $base)
            ->whereHas('task', fn ($q) => $q->whereNotNull('due_date')->where('due_date', '<', now()->toDateString()))
            ->whereNotIn('status', ['completed', 'cancelled', 'approved', 'delivered'])
            ->count();

        return ApiResponse::success([
            'assigned'           => $counts['queued'] ?? 0,
            'in_progress'        => $counts['in_progress'] ?? 0,
            'blocked'            => $counts['blocked'] ?? 0,
            'submitted'          => $counts['submitted'] ?? 0,
            'revision_requested' => $counts['revision_requested'] ?? 0,
            'approved'           => $counts['approved'] ?? 0,
            'delivered'          => $counts['delivered'] ?? 0,
            'completed'          => $counts['completed'] ?? 0,
            'cancelled'          => $counts['cancelled'] ?? 0,
            'overdue'            => $overdue,
        ]);
    }

    // GET /admin/projects/{id}/deliverables
    public function deliverables(int $projectId): JsonResponse
    {
        $project = Project::whereIn('company_id', $this->companyIds())->findOrFail($projectId);

        return ApiResponse::success(
            Deliverable::where('project_id', $project->id)->with(['uploadedBy:id,name', 'task:id,title'])->orderByDesc('id')->get()
        );
    }

    public function storeDeliverable(Request $request, int $projectId): JsonResponse
    {
        $project = Project::whereIn('company_id', $this->companyIds())->findOrFail($projectId);

        if ($project->isDraft()) {
            return ApiResponse::error(Project::DRAFT_BLOCKED_MESSAGE, 422);
        }

        if ($project->status === 'closed') {
            return ApiResponse::error('This project is closed and read-only. Reopen it first to make changes.', 422);
        }

        $validated = $request->validate([
            'task_id' => ['nullable', 'integer', 'exists:tasks,id'],
            'file'    => ['required', 'file', 'max:51200'],
            'title'   => ['required', 'string', 'max:255'],
        ]);

        $file = $request->file('file');
        $path = $file->store($project->storage_folder . '/deliverables');

        $deliverable = Deliverable::create([
            'project_id'      => $project->id,
            'task_id'         => $validated['task_id'] ?? null,
            // uploaded_by FKs to `users`; Company Admin actor isn't a User row
            'uploaded_by'     => null,
            'title'           => $validated['title'],
            'file_path'       => $path,
            'file_name'       => $file->getClientOriginalName(),
            'file_type'       => $file->getClientOriginalExtension(),
            'file_size_bytes' => $file->getSize(),
            'status'          => 'delivered',
            'delivered_at'    => now(),
        ]);

        $this->logDeliverableActivity($deliverable, 'deliverable_submitted', ['deliverable_id' => $deliverable->id, 'title' => $deliverable->title]);
        $this->logTaskRevision($deliverable->task_id, "{$this->adminName()} uploaded deliverable \"{$deliverable->title}\"");

        $this->notifyDeliverableEvent(
            $deliverable, $project->project_manager_id,
            'deliverable_submitted', 'Deliverable submitted for review',
            "{$this->admin()->name} submitted deliverable \"{$deliverable->title}\" in project \"{$project->name}\"."
        );

        return ApiResponse::success($deliverable, 'Deliverable uploaded', 201);
    }

    public function verifyDeliverable(int $id): JsonResponse
    {
        $deliverable = Deliverable::whereHas('project', fn($p) => $p->whereIn('company_id', $this->companyIds()))
            ->findOrFail($id);

        $deliverable->update(['status' => 'approved', 'approved_at' => now()]);

        // Under the QA pipeline (see TaskStatusService), approving a
        // deliverable means "QA Passed" rather than silently leaving the
        // task's own status untouched as before — PM/QA/Admin must still
        // explicitly move it Ready for Production -> In Production -> Done.
        if ($deliverable->task_id) {
            ProductionQueue::where('task_id', $deliverable->task_id)->update(['status' => 'approved']);

            $task = Task::find($deliverable->task_id);
            if ($task) {
                $task->update(['progress' => $this->progressForStatus('approved'), 'approved_at' => now(), 'delivered_at' => now()]);

                \App\Services\TaskStatusService::applyTransition($task, 'qa_passed', null, [
                    'type' => 'admin', 'id' => $this->admin()->id, 'name' => $this->adminName(),
                ]);
            }
        }

        $this->logDeliverableActivity($deliverable, 'deliverable_approved', ['deliverable_id' => $deliverable->id]);
        $this->logTaskRevision($deliverable->task_id, "{$this->adminName()} approved this task's deliverable");

        $taskTitle = $deliverable->task?->title;
        $taskNumber = $deliverable->task?->task_number;
        $this->notifyDeliverableEvent(
            $deliverable, $deliverable->uploaded_by,
            'deliverable_approved', 'Deliverable approved',
            $taskTitle
                ? "Your deliverable for task {$taskNumber} - \"{$taskTitle}\" has been approved."
                : "Your deliverable \"{$deliverable->title}\" has been approved."
        );

        return ApiResponse::success($deliverable, 'Deliverable verified');
    }

    // POST /admin/deliverables/{id}/request-revision
    public function requestRevision(Request $request, int $id): JsonResponse
    {
        $deliverable = Deliverable::whereHas('project', fn($p) => $p->whereIn('company_id', $this->companyIds()))
            ->findOrFail($id);

        // QA Failed / Revision Required requires a reason when it drives a
        // linked task's status — a project-level deliverable (no task_id)
        // keeps the feedback optional as before.
        $validated = $request->validate([
            'feedback' => [$deliverable->task_id ? 'required' : 'nullable', 'string', 'max:1000'],
        ]);

        $revision = Revision::create([
            'deliverable_id' => $deliverable->id,
            // requested_by FKs to `users`; Company Admin actor isn't a User row
            'requested_by'   => null,
            'feedback'       => $validated['feedback'] ?? null,
            'status'         => 'open',
        ]);

        $deliverable->update(['status' => 'revision_requested']);

        if ($deliverable->task_id) {
            $task = Task::find($deliverable->task_id);
            if ($task) {
                \App\Services\TaskStatusService::applyTransition($task, 'qa_failed', $validated['feedback'] ?? null, [
                    'type' => 'admin', 'id' => $this->admin()->id, 'name' => $this->adminName(),
                ]);
            }
        }

        $this->logDeliverableActivity($deliverable, 'revision_requested', [
            'deliverable_id' => $deliverable->id, 'revision_id' => $revision->id, 'feedback' => $revision->feedback,
        ]);
        $this->logTaskRevision($deliverable->task_id, "{$this->adminName()} requested a revision" . ($revision->feedback ? ": " . \Illuminate\Support\Str::limit($revision->feedback, 80) : ''));

        $taskTitle = $deliverable->task?->title;
        $taskNumber = $deliverable->task?->task_number;
        $this->notifyDeliverableEvent(
            $deliverable, $deliverable->uploaded_by,
            'revision_requested', 'Revision requested',
            $taskTitle
                ? "{$this->admin()->name} requested revision on task {$taskNumber} - \"{$taskTitle}\" in project \"{$deliverable->project->name}\"."
                : "{$this->admin()->name} requested revision on your deliverable \"{$deliverable->title}\"."
        );

        return ApiResponse::success($revision->load('requestedBy:id,name'), 'Revision requested', 201);
    }

    /**
     * Logs a deliverable-related action against its task when one is linked
     * (so it surfaces in ProjectController::activity()'s Task bucket), else
     * against the project directly — a deliverable always has a project_id
     * but task_id is optional.
     */
    private function logDeliverableActivity(Deliverable $deliverable, string $action, array $values): void
    {
        SystemAuditLog::create([
            'company_id'  => $deliverable->project->company_id,
            'user_id'     => null,
            'action'      => $action,
            'module_key'  => 'project_management',
            'entity_type' => $deliverable->task_id ? 'Task' : 'Project',
            'entity_id'   => $deliverable->task_id ?? $deliverable->project_id,
            'new_values'  => $values,
        ]);
    }

    // Surfaces a deliverable/revision event in the task's own History feed
    // (not just SystemAuditLog above, which is a separate company-wide audit
    // trail) — "who fixed it" per the task activity log.
    private function logTaskRevision(?int $taskId, string $description): void
    {
        if (!$taskId) return;
        Task::find($taskId)?->logActivity('revision', $description, $this->adminName());
    }

    // GET /admin/deliverables/{id}/revisions
    public function revisions(int $deliverableId): JsonResponse
    {
        $deliverable = Deliverable::whereHas('project', fn($p) => $p->whereIn('company_id', $this->companyIds()))
            ->findOrFail($deliverableId);

        return ApiResponse::success($deliverable->revisions()->with('requestedBy:id,name')->orderByDesc('id')->get());
    }

    public function resolveRevision(int $id): JsonResponse
    {
        $revision = Revision::whereHas('deliverable.project', fn($p) => $p->whereIn('company_id', $this->companyIds()))
            ->findOrFail($id);

        $revision->update(['status' => 'resolved', 'resolved_at' => now()]);

        $this->logDeliverableActivity($revision->deliverable, 'revision_resolved', ['revision_id' => $revision->id]);
        $this->logTaskRevision($revision->deliverable->task_id, "{$this->adminName()} fixed/resolved the requested revision");

        $task = $revision->deliverable->task_id ? Task::find($revision->deliverable->task_id) : null;
        $projectManagerId = $task?->project?->project_manager_id;
        if ($task && $projectManagerId) {
            \App\Services\NotificationService::send([
                'company_id'        => $task->project->company_id,
                'recipient_user_id' => $projectManagerId,
                'actor_admin_id'    => $this->admin()->id,
                'module'            => 'project_management',
                'type'              => 'revision_resolved',
                'title'             => 'Revision resolved',
                'message'           => "{$this->adminName()} resolved the requested revision for task '{$task->task_number} - {$task->title}'.",
                'entity_type'       => 'Task',
                'entity_id'         => $task->id,
                'url'               => "/projects/{$task->project_id}/tasks/{$task->id}",
            ]);
        }

        return ApiResponse::success($revision, 'Revision resolved');
    }
}
