<?php

namespace App\Http\Controllers\Api\User;

use App\Helpers\ApiResponse;
use App\Http\Controllers\Controller;
use App\Models\Notification;
use App\Models\Project;
use App\Models\SystemAuditLog;
use App\Models\Task;
use App\Models\User;
use App\Models\UserCompanyPermission;
use App\Support\PermissionDebug;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;

class TaskController extends Controller
{
    private function user() { return auth('sanctum')->user(); }
    // trim()->? , not `?? 'User'` — a blank/whitespace-only name would
    // otherwise pass through and leave a History entry with an empty actor.
    private function userName(): string { return trim((string) ($this->user()->name ?? '')) ?: 'User'; }

    // Tasks can only be assigned to a real user of this staff member's own
    // company — not any user id in the system. A Seller can never be a task
    // assignee, full stop.
    private function assignedToRule()
    {
        // Rule::exists()->where() only supports 2-arg (column, value) equality
        // — a 3-arg (column, operator, value) call silently misparses, so a
        // closure is required for a "!=" condition.
        return Rule::exists('users', 'id')->where('company_id', $this->user()->company_id)
            ->where(fn ($query) => $query->where('role_type', '!=', 'seller'));
    }

    // qa_assigned_to is optional (no dropdown/status-transition requires it
    // anymore) — but whenever it IS set, it must be a real QA-role user of
    // this company.
    private function qaAssignedToRule()
    {
        return Rule::exists('users', 'id')->where('company_id', $this->user()->company_id)
            ->where('role_type', 'qa');
    }

    private function can(string $permKey): bool
    {
        $user = $this->user();
        $result = UserCompanyPermission::where('user_id', $user->id)
            ->where('company_id', $user->company_id)
            ->where('module_key', 'project_management')
            ->where('permission_key', $permKey)
            ->exists();
        PermissionDebug::log($user->id, $user->company_id, $user->role_type, 'project_management', $permKey, $result);
        return $result;
    }

    private function logActivity(int $companyId, string $action, string $entityType, int $entityId, array $newValues = []): void
    {
        SystemAuditLog::create([
            'company_id' => $companyId, 'user_id' => $this->user()->id,
            'action' => $action, 'module_key' => 'project_management',
            'entity_type' => $entityType, 'entity_id' => $entityId, 'new_values' => $newValues,
        ]);
    }

    // Mirrors Api\User\ProjectController::visibleProjects() exactly — kept as a
    // duplicate helper (not shared) to match this codebase's existing
    // convention of each User-guard controller owning its own can()/scope logic.
    // Purely permission-based, no Data Scope layer.
    private function project(int $projectId): Project
    {
        $user = $this->user();
        $base = Project::where('company_id', $user->company_id);

        if ($this->can('canViewAllCompanyProjects')) {
            return $base->findOrFail($projectId);
        }

        return $base->where(function ($q) use ($user) {
                $q->where('project_manager_id', $user->id)
                  ->orWhere('created_by', $user->id)
                  ->orWhere('seller_id', $user->id)
                  ->orWhereHas('teamMembers', fn($t) => $t->where('user_id', $user->id))
                  ->orWhereHas('tasks', fn($t) => $t->where('assigned_to', $user->id))
                  ->orWhereHas('lead', fn($l) => $l->where('assigned_to', $user->id)->orWhere('transferred_to', $user->id))
                  ->orWhereHas('client', fn($c) => $c->where('account_manager', $user->id));
            })
            ->findOrFail($projectId);
    }

    // A worker-level user (Production User / Team Member / Developer — no
    // full task-management rights, not the project's own manager) only ever
    // sees their OWN tasks, never the full task list of an otherwise-visible
    // project. Neither canAssignTasks nor canEditTasks alone is included
    // here — canAssignTasks only grants the ABILITY to hand a task off to
    // someone else (once reassigned away, the task must actually disappear
    // from the reassigner's own list, not linger just because they hold that
    // permission), and canEditTasks is a default permission on every project
    // role (see RoleDefaultPermissions::MAP) letting each of them edit/
    // progress their OWN task — it was never meant to be a company-wide
    // "see everyone's tasks" signal, unlike canViewAllCompanyProjects. Only
    // canViewAllCompanyProjects, or being that specific project's manager,
    // still sees everything.
    private function isTaskManager(?Project $project = null): bool
    {
        if ($this->can('canViewAllCompanyProjects')) {
            return true;
        }
        return $project && $project->project_manager_id === $this->user()->id;
    }

    public function index(Request $request, int $projectId): JsonResponse
    {
        // Sellers must have zero Task visibility, full stop — no "own
        // submitted request" carve-out either, regardless of any
        // canViewTasks/canCreateLinkedProjectTask permission they might hold
        // (a Company Admin's manual grant, or a stale default from before
        // this was locked down, must not reopen this). Same hard role check
        // as myTasks().
        if ($this->user()->role_type === 'seller') {
            return ApiResponse::error('Permission denied', 403);
        }

        $canViewAll = $this->can('canViewTasks');
        $canViewOwnRequests = $this->can('canCreateLinkedProjectTask');
        if (!$canViewAll && !$canViewOwnRequests) {
            return ApiResponse::error('Permission denied', 403);
        }

        $project = $this->project($projectId);

        $q = Task::where('project_id', $project->id)->with(['assignedTo:id,name', 'qaAssignedTo:id,name', 'productionAssignedTo:id,name', 'assignedBy:id,name', 'productionQueue'])->withCount('attachments');

        if (!$canViewAll) {
            $q->where('created_by', $this->user()->id);
        } elseif (!$this->isTaskManager($project) || $request->boolean('mine_only')) {
            $userId = $this->user()->id;
            if ($request->boolean('mine_only')) {
                $q->where('assigned_to', $userId);
            } else {
                // Own regular assigned tasks, plus any task specifically
                // handed to this user for Production/Deployment (any role).
                // QA additionally sees anything handed to them for QA — but
                // only while it's still actually in the QA stage; once moved
                // on to Ready for Production/etc. it must drop out of their
                // queue (qa_assigned_to is a historical record, not active-
                // queue membership).
                $q->where(function ($w) use ($userId) {
                    $w->where('assigned_to', $userId)->orWhere('production_assigned_to', $userId);
                    if ($this->user()->role_type === 'qa') {
                        $w->orWhere(fn ($qa) => $qa->where('qa_assigned_to', $userId)->whereIn('status', ['ready_for_qa', 'in_qa']))
                          ->orWhere(fn ($qa) => $qa->whereIn('status', ['ready_for_qa', 'in_qa'])->whereNull('qa_assigned_to'));
                    }
                });
            }
        }
        if ($request->filled('status')) $q->where('status', $request->status);
        if ($request->filled('search')) {
            $s = $request->search;
            $q->where(fn ($w) => $w->where('title', 'like', "%{$s}%")->orWhere('task_number', 'like', "%{$s}%"));
        }

        return ApiResponse::success($q->orderByDesc('created_at')->get());
    }

    // All tasks assigned to the current user across their visible projects.
    // Unlike index()/indexAll(), this deliberately has no canViewTasks/
    // canCreateLinkedProjectTask gate — Developer/Designer/QA/Production/Team
    // Member may use it even without canViewTasks (see Sidebar's "My Tasks"
    // fallback). Sellers are the one role that must have zero Task access at
    // all, so they're blocked explicitly here rather than relying on a
    // permission they were never meant to hold in the first place.
    public function myTasks(Request $request): JsonResponse
    {
        $user = $this->user();

        if ($user->role_type === 'seller') {
            return ApiResponse::error('Permission denied', 403);
        }

        $q = Task::whereHas('project', fn($p) => $p->where('company_id', $user->company_id))
            ->with(['project:id,name', 'assignedBy:id,name', 'assignedTo:id,name', 'qaAssignedTo:id,name', 'productionAssignedTo:id,name'])
            ->withCount('attachments');

        $q->where(function ($w) use ($user) {
            // Own regular assigned tasks, plus any task specifically handed
            // to this user for the Production/Deployment step (any role —
            // not just QA can be picked as production_assigned_to).
            $w->where('assigned_to', $user->id)
              ->orWhere('production_assigned_to', $user->id);

            // QA additionally sees anything handed to them for QA — but ONLY
            // while it's still actually in the QA stage: once the task moves
            // on to Ready for Production/etc., it must drop out of this
            // QA's queue, not linger forever just because qa_assigned_to
            // still points at them (that column is a historical record, not
            // an active-queue membership).
            if ($user->role_type === 'qa') {
                $visibleProjectIds = $this->visibleProjectIds();
                $w->orWhere(fn ($qa) => $qa->where('qa_assigned_to', $user->id)->whereIn('status', ['ready_for_qa', 'in_qa']))
                  ->orWhere(fn ($qa) => $qa->whereIn('status', ['ready_for_qa', 'in_qa'])->whereNull('qa_assigned_to')->whereIn('project_id', $visibleProjectIds));
            }
        });

        if ($request->filled('status')) $q->where('status', $request->status);

        return ApiResponse::success($q->orderBy('due_date')->get());
    }

    // GET /user/tasks/qa-users — every active QA-role user in this staff
    // member's own company, for the "hand this task off to QA" picker when
    // moving a task to Ready for QA. Deliberately has NO permission gate
    // (unlike ProjectController::companyUsers(), which requires
    // canCreateTasks/canEditTasks/canAssignTeamResources/canViewTeamResources)
    // — a plain Developer/Designer/Production/Team Member who has none of
    // those still needs to see this list to hand off their own task.
    public function qaUsers(): JsonResponse
    {
        $users = User::where('company_id', $this->user()->company_id)
            ->where('role_type', 'qa')
            ->where('is_active', true)
            ->orderBy('name')
            ->get(['id', 'name']);

        return ApiResponse::success($users);
    }

    // GET /user/tasks/production-users — every active Production/Developer/
    // Designer-role user in this company, for the OPTIONAL "assign a
    // Production/Deployment user" picker when moving a task to Ready for
    // Production. Same no-permission-gate reasoning as qaUsers() above.
    public function productionUsers(): JsonResponse
    {
        $users = User::where('company_id', $this->user()->company_id)
            ->whereIn('role_type', ['production', 'developer', 'designer'])
            ->where('is_active', true)
            ->orderBy('name')
            ->get(['id', 'name']);

        return ApiResponse::success($users);
    }

    // GET /user/tasks/assignable-users — every active non-seller user in this
    // company, for the "reassign to anyone" dropdown ANY role sees on their
    // OWN task (see the isOwnTask widening of the assigned_to rule in
    // update() below). Same no-permission-gate reasoning as
    // qaUsers()/productionUsers() above — Api\User\ProjectController::
    // companyUsers() stays gated behind canCreateTasks/canEditTasks/
    // canAssignTeamResources/canViewTeamResources since it also drives
    // project team management, not just this handoff.
    public function assignableUsers(): JsonResponse
    {
        $users = User::where('company_id', $this->user()->company_id)
            ->where('role_type', '!=', 'seller')
            ->where('is_active', true)
            ->orderBy('name')
            ->get(['id', 'name', 'role_type']);

        return ApiResponse::success($users);
    }

    // Cross-project task list across every project the PM/Admin can see —
    // mirrors Admin\TaskController::indexAll(), scoped through visibleProjects()
    // instead of company-wide, since staff visibility is permission-scoped.
    public function indexAll(Request $request): JsonResponse
    {
        // Sellers must have zero Task visibility, full stop — see index()'s
        // matching comment.
        if ($this->user()->role_type === 'seller') {
            return ApiResponse::error('Permission denied', 403);
        }

        $canViewAll = $this->can('canViewTasks');
        $canViewOwnRequests = $this->can('canCreateLinkedProjectTask');
        if (!$canViewAll && !$canViewOwnRequests) {
            return ApiResponse::error('Permission denied', 403);
        }

        $user = $this->user();
        $visibleProjectIds = $this->visibleProjectIds();

        $q = Task::whereIn('project_id', $visibleProjectIds)
            ->with(['assignedTo:id,name', 'qaAssignedTo:id,name', 'productionAssignedTo:id,name', 'assignedBy:id,name', 'productionQueue', 'project:id,name'])
            ->withCount('attachments');

        if (!$canViewAll) {
            $q->where('created_by', $user->id);
        } elseif (!$this->isTaskManager()) {
            $q->where(function ($w) use ($user) {
                $w->where('assigned_to', $user->id)->orWhere('production_assigned_to', $user->id);
                if ($user->role_type === 'qa') {
                    $w->orWhere(fn ($qa) => $qa->where('qa_assigned_to', $user->id)->whereIn('status', ['ready_for_qa', 'in_qa']))
                      ->orWhere(fn ($qa) => $qa->whereIn('status', ['ready_for_qa', 'in_qa'])->whereNull('qa_assigned_to'));
                }
            });
        } elseif ($request->filled('assigned_to')) {
            $q->where('assigned_to', $request->assigned_to);
        }
        if ($request->filled('status'))     $q->where('status', $request->status);
        if ($request->filled('priority'))   $q->where('priority', $request->priority);
        if ($request->filled('project_id')) $q->where('project_id', $request->project_id);
        if ($request->filled('search')) {
            $s = $request->search;
            $q->where(fn ($w) => $w->where('title', 'like', "%{$s}%")->orWhere('task_number', 'like', "%{$s}%"));
        }

        return ApiResponse::success($q->orderByDesc('created_at')->get());
    }

    // GET /user/tasks/{id}/lookup — resolves a bare task id to its
    // project_id for the guard-agnostic /task/{id} share-link redirector.
    // Scoped to this user's own visible projects; the destination User task
    // page does its own full permission check once it has a project_id.
    public function lookup(int $id): JsonResponse
    {
        $task = Task::whereIn('project_id', $this->visibleProjectIds())->findOrFail($id);

        return ApiResponse::success(['project_id' => $task->project_id]);
    }

    // Mirrors Api\User\ProjectController::visibleProjects(), returning ids only.
    private function visibleProjectIds(): array
    {
        $user = $this->user();
        $base = Project::where('company_id', $user->company_id);

        if ($this->can('canViewAllCompanyProjects')) {
            return $base->pluck('id')->all();
        }

        return $base->where(function ($q) use ($user) {
                $q->where('project_manager_id', $user->id)
                  ->orWhere('created_by', $user->id)
                  ->orWhere('seller_id', $user->id)
                  ->orWhereHas('teamMembers', fn($t) => $t->where('user_id', $user->id))
                  ->orWhereHas('tasks', fn($t) => $t->where('assigned_to', $user->id))
                  ->orWhereHas('lead', fn($l) => $l->where('assigned_to', $user->id)->orWhere('transferred_to', $user->id))
                  ->orWhereHas('client', fn($c) => $c->where('account_manager', $user->id));
            })
            ->pluck('id')->all();
    }

    // GET .../tasks/{id}/activity — who created it, who it's been (re)assigned
    // to, every status change, and who marked it done, oldest first.
    public function activity(int $projectId, int $id): JsonResponse
    {
        // Sellers must have zero Task visibility, full stop — see index()'s
        // matching comment.
        if ($this->user()->role_type === 'seller') {
            return ApiResponse::error('Permission denied', 403);
        }

        $canViewAll = $this->can('canViewTasks');
        $canViewOwnRequests = $this->can('canCreateLinkedProjectTask');
        if (!$canViewAll && !$canViewOwnRequests) {
            return ApiResponse::error('Permission denied', 403);
        }

        $project = $this->project($projectId);
        $task = Task::where('project_id', $project->id)->findOrFail($id);

        if (!$canViewAll) {
            if ($task->created_by !== $this->user()->id) {
                return ApiResponse::error('Permission denied', 403);
            }
        }
        // Same "own tasks only" restriction the task list itself enforces.
        elseif (!$this->isTaskManager($project) && $task->assigned_to !== $this->user()->id) {
            return ApiResponse::error('Permission denied', 403);
        }

        // Newest first — the activities() relation's own default order, so
        // the most recent action (e.g. a just-made status change) is
        // immediately visible at the top instead of buried at the bottom of
        // a long history.
        return ApiResponse::success($task->activities()->get());
    }

    // Generates a unique, human-readable task_number (e.g. PRJ-50-TASK-0001)
    // and creates the Task with it, safely under concurrent requests: the
    // project row is locked for the duration of the transaction, so a second
    // simultaneous creation on the same project blocks until the first
    // commits, and its own max(task_sequence) query then correctly sees the
    // first task's row already inserted — no two tasks on the same project
    // can ever land on the same sequence/number. Scoped to the project (not
    // company-wide) since the number already embeds the project id, which
    // is itself globally unique — no separate task_counters table needed.
    private function createTaskWithNumber(Project $project, array $attributes): Task
    {
        return DB::transaction(function () use ($project, $attributes) {
            Project::where('id', $project->id)->lockForUpdate()->first();

            $nextSequence = (int) Task::where('project_id', $project->id)->max('task_sequence') + 1;
            $attributes['task_sequence'] = $nextSequence;
            $attributes['task_number']   = sprintf('PRJ-%d-TASK-%04d', $project->id, $nextSequence);

            return Task::create($attributes);
        });
    }

    // Sellers must have zero Task creation ability, full stop — the old
    // "Client Requirement/General Request" submission path via
    // canCreateLinkedProjectTask has been retired for this role entirely
    // (see index()'s matching comment); this hard role check closes it
    // regardless of any permission a Company Admin might still hold/grant.
    public function store(Request $request, int $projectId): JsonResponse
    {
        if ($this->user()->role_type === 'seller') {
            return ApiResponse::error('Permission denied', 403);
        }

        $canFullCreate = $this->can('canCreateTasks');
        $canLinkedCreate = $this->can('canCreateLinkedProjectTask');

        if (!$canFullCreate && !$canLinkedCreate) {
            return ApiResponse::error('Permission denied', 403);
        }

        $project = $this->project($projectId);

        if ($project->status === 'closed') {
            return ApiResponse::error('This project is closed and read-only. Reopen it first to make changes.', 422);
        }

        $isLinkedOnly = !$canFullCreate;

        $validated = $request->validate([
            'assigned_to'      => ['nullable', 'integer', $this->assignedToRule()],
            'title'            => ['required', 'string', 'max:255'],
            'description'      => ['nullable', 'string'],
            'notes'            => ['nullable', 'string'],
            'priority'         => ['nullable', 'in:low,medium,high,urgent'],
            'status'           => ['nullable', 'in:todo,in_progress,review,completed,cancelled'],
            'estimated_hours'  => ['nullable', 'numeric', 'min:0'],
            'start_date'       => ['nullable', 'date'],
            'due_date'         => ['nullable', 'date'],
            'task_type'        => ['nullable', 'in:general,production,client_request,internal'],
        ]);

        if ($isLinkedOnly) {
            if (in_array($validated['task_type'] ?? null, ['production', 'internal'], true)) {
                return ApiResponse::error('Only Client Requirement or General Request tasks can be submitted here.', 403);
            }
            $validated['task_type'] = $validated['task_type'] ?? 'client_request';
            // "Pending PM Review" — a Project Manager reviews and converts
            // this via the normal update() endpoint (canEditTasks already
            // lets them change type/status/assignee freely).
            $validated['status'] = 'review';
        }

        // Assigning the new task to someone else at creation time requires the
        // dedicated canAssignTasks permission — canCreateTasks/
        // canCreateLinkedProjectTask alone only cover creating a task (which
        // defaults to unassigned/self). A Seller without canAssignTasks can
        // never hand a request straight to a Production/Dev/Design/QA user.
        $assignee = $validated['assigned_to'] ?? null;
        if ($assignee && $assignee !== $this->user()->id && !$this->can('canAssignTasks')) {
            return ApiResponse::error('Permission denied: cannot assign tasks to other users', 403);
        }

        $isProduction = ($validated['task_type'] ?? null) === 'production';

        $validated['project_id']          = $project->id;
        $validated['created_by']          = $this->user()->id;
        $validated['assigned_by']         = ($validated['assigned_to'] ?? null) ? $this->user()->id : null;
        $validated['status']            ??= 'todo';
        $validated['priority']          ??= 'medium';
        $validated['task_type']         ??= 'general';
        $validated['is_production_task']  = $isProduction;

        $task = $this->createTaskWithNumber($project, $validated);

        if ($isProduction) {
            $task->productionQueue()->create([
                'assigned_to' => $task->assigned_to,
                'status'      => 'queued',
            ]);
        }

        if ($task->assigned_to) {
            Notification::create([
                'user_id'    => $task->assigned_to,
                'company_id' => $project->company_id,
                'type'       => 'task_assigned',
                'title'      => 'New task assigned',
                'body'       => "You were assigned task {$task->task_number} - \"{$task->title}\" on \"{$project->name}\".",
                'data'       => ['project_id' => $project->id, 'task_id' => $task->id, 'link' => "/projects/{$project->id}/tasks/{$task->id}"],
            ]);
        }

        $this->logActivity($project->company_id, 'task_created', 'Task', $task->id, $validated);
        if ($task->assigned_to) {
            $this->logActivity($project->company_id, 'task_assigned', 'Task', $task->id, ['assigned_to' => $task->assigned_to]);
        }

        $task->logActivity('created', "Task \"{$task->title}\" created", $this->userName());
        if ($task->assigned_to) {
            $assigneeName = User::find($task->assigned_to)?->name ?? 'someone';
            $task->logActivity('assigned', "Task assigned to {$assigneeName}", $this->userName(), ['to' => $task->assigned_to]);
        }

        return ApiResponse::success($task->fresh(['assignedTo', 'qaAssignedTo', 'productionAssignedTo', 'assignedBy', 'productionQueue']), 'Task created', 201);
    }

    public function update(Request $request, int $projectId, int $id): JsonResponse
    {
        // Sellers must have zero Task access, full stop — see index()'s
        // matching comment. assignedToRule() already keeps a Seller from
        // ever being $task->assigned_to, but this closes the endpoint
        // outright rather than relying on that alone.
        if ($this->user()->role_type === 'seller') {
            return ApiResponse::error('Permission denied', 403);
        }

        $project = $this->project($projectId);
        $task = Task::where('project_id', $project->id)->findOrFail($id);

        if ($project->status === 'closed') {
            return ApiResponse::error('This project is closed and read-only. Reopen it first to make changes.', 422);
        }

        $isOwnTask = $task->assigned_to === $this->user()->id;
        $canEdit   = $this->can('canEditTasks');
        $canAssign = $this->can('canAssignTasks');
        // A QA/reviewer-tier user is neither the assignee nor granted
        // canEditTasks/canAssignTasks, but must still be able to reach the
        // status-only path below (Ready for QA -> In QA -> QA
        // Failed/Passed -> Ready for Production) — gated for real by
        // TaskStatusService::canTransition() further down, not here. $rules
        // only adds title/assigned_to when $canEdit/$canAssign are true, so
        // this broadened gate still can't let a QA-only user touch anything
        // but status/comment.
        $hasTaskStatusPerm = $this->can('canMarkTaskBlocked') || $this->can('canVerifyDeliverables')
            || $this->can('canAssignProductionTasks') || $this->can('canCompleteTasks')
            || $this->can('canReopenTasks') || $this->can('canOverrideTaskStatus');
        if (!$isOwnTask && !$canEdit && !$canAssign && !$hasTaskStatusPerm) {
            return ApiResponse::error('Permission denied', 403);
        }

        $rules = [
            'status'                 => ['sometimes', 'in:' . implode(',', Task::ALL_STATUSES)],
            'comment'                => ['nullable', 'string', 'max:1000'],
            'qa_assigned_to'         => ['nullable', 'integer', $this->qaAssignedToRule()],
            // Optional Production/Deployment handoff when moving to "Ready
            // for Production" — any non-seller company user, same rule as
            // assigned_to (not narrowed to role_type='production', since a
            // developer/designer can just as validly own the production step).
            'production_assigned_to' => ['nullable', 'integer', $this->assignedToRule()],
        ];
        if ($canEdit) {
            $rules += [
                'title'           => ['sometimes', 'string', 'max:255'],
                'description'     => ['nullable', 'string'],
                'notes'           => ['nullable', 'string'],
                'priority'        => ['sometimes', 'in:low,medium,high,urgent'],
                'start_date'      => ['nullable', 'date'],
                'due_date'        => ['nullable', 'date'],
            ];
        }
        // Reassigning is allowed with either canEditTasks or the dedicated
        // canAssignTasks permission — a PM can be granted assign rights
        // without full task-editing rights. ANY role also gets this on their
        // OWN task (no permission needed, no role restriction) — QA,
        // Developer, Team Member, whoever currently holds the task can hand
        // it off to anyone else in the company.
        if ($canEdit || $canAssign || $isOwnTask) {
            $rules['assigned_to'] = ['nullable', 'integer', $this->assignedToRule()];
        }

        $validated = $request->validate($rules);

        $wasAssignee = $task->assigned_to;
        $wasStatus   = $task->status;
        // Snapshot of every other trackable field, for the generic "updated"
        // History entry below — assigned_to/status get their own dedicated
        // entry types instead, so they're deliberately excluded here.
        $trackedFields = ['title', 'description', 'notes', 'priority', 'start_date', 'due_date'];
        $wasValues = collect($trackedFields)->mapWithKeys(fn ($f) => [$f => $task->$f]);

        if (isset($validated['assigned_to']) && $validated['assigned_to'] !== $wasAssignee) {
            $validated['assigned_by'] = $this->user()->id;
        }

        $comment = $validated['comment'] ?? null;
        unset($validated['comment']);

        $qaAssignedToProvided = array_key_exists('qa_assigned_to', $validated);
        $qaAssignedTo = $validated['qa_assigned_to'] ?? null;
        unset($validated['qa_assigned_to']);

        $productionAssignedToProvided = array_key_exists('production_assigned_to', $validated);
        $productionAssignedTo = $validated['production_assigned_to'] ?? null;
        unset($validated['production_assigned_to']);

        $newStatus = $validated['status'] ?? null;
        $statusChanging = $newStatus !== null && $newStatus !== $wasStatus;
        unset($validated['status']);

        // Standalone QA/Production handoff — the listing's dedicated
        // dropdowns let an actor (re)assign who owns the next pipeline step
        // without necessarily changing status in the same request. When the
        // status IS changing into ready_for_qa/ready_for_production here,
        // TaskStatusService::applyTransition() below already owns stamping
        // these columns (plus its own notification) — skip merging here so
        // that path doesn't double-write/double-notify.
        $wasQaAssignedTo = $task->qa_assigned_to;
        $wasProductionAssignedTo = $task->production_assigned_to;
        $qaHandoffStandalone = $qaAssignedToProvided && !($statusChanging && $newStatus === 'ready_for_qa');
        $productionHandoffStandalone = $productionAssignedToProvided && !($statusChanging && $newStatus === 'ready_for_production');
        if ($qaHandoffStandalone) $validated['qa_assigned_to'] = $qaAssignedTo;
        if ($productionHandoffStandalone) $validated['production_assigned_to'] = $productionAssignedTo;

        if ($statusChanging) {
            $actor = [
                'type'        => 'user',
                'id'          => $this->user()->id,
                'name'        => $this->userName(),
                'is_pm'       => $project->project_manager_id === $this->user()->id,
                'is_assignee' => $isOwnTask,
                'role_type'   => $this->user()->role_type,
                'perms'       => array_values(array_filter([
                    $canEdit ? 'canEditTasks' : null,
                    $this->can('canMarkTaskBlocked') ? 'canMarkTaskBlocked' : null,
                    $this->can('canVerifyDeliverables') ? 'canVerifyDeliverables' : null,
                    $this->can('canAssignProductionTasks') ? 'canAssignProductionTasks' : null,
                    $this->can('canCompleteTasks') ? 'canCompleteTasks' : null,
                    $this->can('canReopenTasks') ? 'canReopenTasks' : null,
                    $this->can('canOverrideTaskStatus') ? 'canOverrideTaskStatus' : null,
                ])),
            ];

            $check = \App\Services\TaskStatusService::canTransition($task, $newStatus, $actor);
            if (!$check['allowed']) {
                return ApiResponse::error($check['reason'], 422);
            }
            if ($check['requires_comment'] && !$comment) {
                return ApiResponse::error('A comment is required for this status change.', 422);
            }
        }

        $task->update($validated);

        if ($statusChanging) {
            \App\Services\TaskStatusService::applyTransition($task, $newStatus, $comment, $actor, $qaAssignedTo, $productionAssignedTo);
        }

        if (isset($validated['assigned_to']) && $validated['assigned_to'] !== $wasAssignee) {
            $this->logActivity($project->company_id, 'task_assigned', 'Task', $task->id, ['assigned_to' => $validated['assigned_to']]);

            $oldName = $wasAssignee ? (User::find($wasAssignee)?->name ?? 'someone') : null;
            $newName = $validated['assigned_to'] ? (User::find($validated['assigned_to'])?->name ?? 'someone') : null;
            $description = $newName
                ? ($oldName ? "Task reassigned from {$oldName} to {$newName}" : "Task assigned to {$newName}")
                : "Task unassigned from {$oldName}";
            $task->logActivity('assigned', $description, $this->userName(), ['from' => $wasAssignee, 'to' => $validated['assigned_to']]);

            if ($validated['assigned_to'] && $validated['assigned_to'] !== $this->user()->id) {
                Notification::create([
                    'user_id'    => $validated['assigned_to'],
                    'company_id' => $project->company_id,
                    'type'       => 'task_assigned',
                    'title'      => 'Task assigned to you',
                    'body'       => "You were assigned task {$task->task_number} - \"{$task->title}\" on \"{$project->name}\".",
                    'data'       => ['project_id' => $project->id, 'task_id' => $task->id, 'link' => "/projects/{$project->id}/tasks/{$task->id}"],
                ]);
            }
        }

        if ($qaHandoffStandalone && $qaAssignedTo !== $wasQaAssignedTo) {
            $this->logActivity($project->company_id, 'task_qa_assigned', 'Task', $task->id, ['qa_assigned_to' => $qaAssignedTo]);

            $oldName = $wasQaAssignedTo ? (User::find($wasQaAssignedTo)?->name ?? 'someone') : null;
            $newName = $qaAssignedTo ? (User::find($qaAssignedTo)?->name ?? 'someone') : null;
            $description = $newName
                ? ($oldName ? "QA handoff reassigned from {$oldName} to {$newName}" : "Task handed to {$newName} for QA")
                : "QA handoff removed from {$oldName}";
            $task->logActivity('qa_status_changed', $description, $this->userName(), ['from' => $wasQaAssignedTo, 'to' => $qaAssignedTo]);

            if ($qaAssignedTo && $qaAssignedTo !== $this->user()->id) {
                Notification::create([
                    'user_id'    => $qaAssignedTo,
                    'company_id' => $project->company_id,
                    'type'       => 'task_ready_for_qa',
                    'title'      => 'Task handed to you for QA',
                    'body'       => "You were handed task {$task->task_number} - \"{$task->title}\" for QA.",
                    'data'       => ['project_id' => $project->id, 'task_id' => $task->id, 'link' => "/projects/{$project->id}/tasks/{$task->id}"],
                ]);
            }
        }

        if ($productionHandoffStandalone && $productionAssignedTo !== $wasProductionAssignedTo) {
            $this->logActivity($project->company_id, 'task_production_assigned', 'Task', $task->id, ['production_assigned_to' => $productionAssignedTo]);

            $oldName = $wasProductionAssignedTo ? (User::find($wasProductionAssignedTo)?->name ?? 'someone') : null;
            $newName = $productionAssignedTo ? (User::find($productionAssignedTo)?->name ?? 'someone') : null;
            $description = $newName
                ? ($oldName ? "Production handoff reassigned from {$oldName} to {$newName}" : "Task handed to {$newName} for Production")
                : "Production handoff removed from {$oldName}";
            $task->logActivity('status_changed', $description, $this->userName(), ['from' => $wasProductionAssignedTo, 'to' => $productionAssignedTo]);

            if ($productionAssignedTo && $productionAssignedTo !== $this->user()->id) {
                Notification::create([
                    'user_id'    => $productionAssignedTo,
                    'company_id' => $project->company_id,
                    'type'       => 'task_ready_for_production',
                    'title'      => 'Task handed to you for Production',
                    'body'       => "You were handed task {$task->task_number} - \"{$task->title}\" for Production.",
                    'data'       => ['project_id' => $project->id, 'task_id' => $task->id, 'link' => "/projects/{$project->id}/tasks/{$task->id}"],
                ]);
            }
        }

        if ($statusChanging) {
            $this->logActivity($project->company_id, 'task_status_updated', 'Task', $task->id, ['status' => $newStatus]);

            // Activity logging + PM/QA/assignee/Company-Admin notifications
            // for this transition are entirely handled by
            // TaskStatusService::applyTransition() above.
        }

        // Generic "updated" History entry for any other field edit
        // (title/description/notes/priority/start_date/due_date) —
        // assigned_to/status changes already got their own dedicated entry
        // above, so they're excluded from $trackedFields.
        $changedFields = collect($trackedFields)->filter(fn ($f) => array_key_exists($f, $validated) && $validated[$f] != $wasValues[$f]);
        if ($changedFields->isNotEmpty()) {
            $labels = [
                'title' => 'title', 'description' => 'description', 'notes' => 'notes',
                'priority' => 'priority', 'start_date' => 'start date', 'due_date' => 'due date',
            ];
            $changedLabels = $changedFields->map(fn ($f) => $labels[$f] ?? $f)->implode(', ');
            $task->logActivity('updated', "{$this->userName()} updated {$changedLabels}", $this->userName(), ['fields' => $changedFields->values()->all()]);
        }

        return ApiResponse::success($task->fresh(['assignedTo', 'assignedBy', 'qaAssignedTo', 'productionAssignedTo']), 'Task updated');
    }
}
