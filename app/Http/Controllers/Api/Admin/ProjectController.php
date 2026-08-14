<?php

namespace App\Http\Controllers\Api\Admin;

use App\Helpers\ApiResponse;
use App\Http\Controllers\Controller;
use App\Models\CompanyUserAssignment;
use App\Models\Notification;
use App\Models\Project;
use App\Models\ProjectComment;
use App\Models\ProjectFolder;
use App\Models\ProjectTeamMember;
use App\Models\SystemAuditLog;
use App\Models\Task;
use App\Models\User;
use App\Services\ProjectChatService;
use App\Services\ProjectCompletionService;
use App\Services\NotificationService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;
use Symfony\Component\HttpFoundation\StreamedResponse;

class ProjectController extends Controller
{
    // System subfolders created under every project on creation.
    private const SYSTEM_FOLDERS = [
        'documents', 'tasks', 'production', 'compliance', 'invoices',
        'client-files', 'internal-notes', 'deliverables', 'revisions', 'timesheets',
    ];

    private function admin()   { return auth('admin')->user(); }
    private function adminName(): string { return $this->admin()->name ?? 'Admin'; }

    private function companyIds(): array
    {
        return $this->admin()->companies()->pluck('id')->toArray();
    }

    // Active company-membership user ids for ONE specific company — used to
    // validate project_manager_id/team member ids belong to the project's own
    // company, not just "any company this admin owns" (companyIds() is too
    // broad for that check when an admin owns multiple companies).
    private function companyUserIds(int $companyId): array
    {
        return CompanyUserAssignment::where('company_id', $companyId)
            ->where('status', 'active')
            ->pluck('user_id')
            ->toArray();
    }

    // GET /admin/companies/{companyId}/project-users — assignable users for
    // the Project create/edit/team screens, grouped by role_type and scoped
    // to ONE company (not this admin's whole multi-company companyIds()).
    public function projectUsers(int $companyId): JsonResponse
    {
        if (!in_array($companyId, $this->companyIds(), true)) {
            return ApiResponse::error('Company not found', 404);
        }

        $users = User::whereIn('id', $this->companyUserIds($companyId))
            ->where('is_active', true)
            ->where('status', 'active')
            ->orderBy('name')
            ->get(['id', 'name', 'email', 'role_type']);

        $toOption = fn ($u) => [
            'user_id' => $u->id, 'name' => $u->name, 'email' => $u->email, 'role' => $u->role_type,
        ];
        $group = fn (array $roles) => $users->whereIn('role_type', $roles)->values()->map($toOption);

        // Every internal (non-Seller/Client/Invoice/HR/Finance/Compliance) role
        // that can meaningfully be added to a project team.
        $internalRoles = ['project_manager', 'production', 'developer', 'designer', 'qa', 'team_member'];

        // Sellers are queried directly off `users.company_id`, NOT via
        // companyUserIds()/company_user_assignments like the groups above —
        // that table isn't populated for every Seller (verified against real
        // data), so scoping through it would silently hide valid active
        // Sellers from this dropdown. Mirrors
        // Api\User\LeadController::assignableSeller()'s same-company/
        // is_active/status/role_type check.
        $sellers = User::where('company_id', $companyId)
            ->where('is_active', true)
            ->where('status', 'active')
            ->where('role_type', 'seller')
            ->orderBy('name')
            ->get(['id', 'name', 'email', 'role_type'])
            ->map($toOption);

        return ApiResponse::success([
            'project_managers'     => $group(['project_manager']),
            'production_users'     => $group(['production']),
            'developers'           => $group(['developer']),
            'designers'            => $group(['designer']),
            'qa_users'             => $group(['qa']),
            'team_members'         => $group($internalRoles),
            'all_assignable_users' => $group($internalRoles),
            // Active Sellers of this company only — deliberately excluded
            // from all_assignable_users/internalRoles above (a Seller is
            // never added to a project's internal team). Backs the "Assign
            // Seller" dropdown on the project detail page.
            'sellers'              => $sellers,
        ]);
    }

    private function sellerAssignmentService(): \App\Services\ProjectSellerAssignmentService
    {
        return app(\App\Services\ProjectSellerAssignmentService::class);
    }

    // PATCH /admin/projects/{id}/seller — assign or switch this project's
    // Seller to any active Seller of the same company. Company Admin is
    // always structurally allowed, mirroring every other action in this
    // guard (no permission check here).
    public function assignSeller(Request $request, int $id): JsonResponse
    {
        $project = Project::whereIn('company_id', $this->companyIds())->findOrFail($id);

        if ($project->status === 'closed') {
            return ApiResponse::error('This project is closed and read-only. Reopen it first to make changes.', 422);
        }

        $validated = $request->validate([
            'seller_id' => ['required', 'integer'],
            'reason'    => ['nullable', 'string', 'max:1000'],
        ]);

        $seller = $this->sellerAssignmentService()->assignableSeller($project->company_id, (int) $validated['seller_id']);
        if (!$seller) {
            return ApiResponse::error('Selected seller does not belong to this company.', 422);
        }

        $result = $this->sellerAssignmentService()->assign(
            $project, $seller, $validated['reason'] ?? null, null, $this->admin()->id, $this->adminName()
        );

        return ApiResponse::success(
            $project->fresh(['seller:id,name,email']),
            $result['is_switch'] ? 'Seller switched' : 'Seller assigned'
        );
    }

    public function index(Request $request): JsonResponse
    {
        $companyIds = $this->companyIds();

        $q = Project::whereIn('company_id', $companyIds)
            ->with(['company:id,name', 'client:id,name', 'projectManager:id,name,role_type', 'teamMembers.user:id,name,role_type', 'createdBy:id,name', 'createdByAdmin:id,name']);

        // Aggregates every company this admin owns by default (matches
        // ClientController::index() — the list itself is never restricted to
        // one company; only its seat-info sub-panel defaults to companyIds[0]).
        // ?company_id= still narrows to one, validated by the whereIn above.
        if ($request->filled('company_id')) $q->where('company_id', $request->company_id);
        if ($request->filled('status'))     $q->where('status', $request->status);
        if ($request->filled('priority'))   $q->where('priority', $request->priority);
        if ($request->filled('client_id'))  $q->where('client_id', $request->client_id);
        if ($request->filled('search'))     $q->where('name', 'like', '%' . $request->search . '%');

        $projects = $q->orderByDesc('created_at')->get();

        $taskStats = Task::whereIn('project_id', $projects->pluck('id'))
            ->selectRaw('project_id, COUNT(*) as total, SUM(CASE WHEN status = "completed" THEN 1 ELSE 0 END) as done')
            ->groupBy('project_id')
            ->get()
            ->keyBy('project_id');

        $projects = $projects->map(function ($p) use ($taskStats) {
            $stats = $taskStats[$p->id] ?? null;
            $p->progress  = $stats && $stats->total > 0 ? round(($stats->done / $stats->total) * 100) : 0;
            $p->is_overdue = $p->deadline && $p->deadline->isPast() && $p->status !== 'completed';
            return $p;
        });

        return ApiResponse::success($projects);
    }

    public function dashboard(Request $request): JsonResponse
    {
        $companyIds = $this->companyIds();
        $base = Project::whereIn('company_id', $companyIds);

        $counts = (clone $base)->selectRaw('status, COUNT(*) as total')->groupBy('status')->pluck('total', 'status');

        // A draft carries a deadline from nobody — and isn't started work — so it
        // must not be counted overdue alongside completed/cancelled.
        $overdue = (clone $base)->where('deadline', '<', now())
            ->whereNotIn('status', ['draft', 'completed', 'cancelled'])
            ->count();

        $assignedToMe = (clone $base)->where('project_manager_id', $this->admin()->id ?? 0)->count();

        return ApiResponse::success([
            'total'        => (clone $base)->count(),
            // Payment-started projects awaiting activation — see
            // App\Services\PaymentProjectStartService.
            'draft'        => $counts['draft'] ?? 0,
            'planning'     => $counts['planning'] ?? 0,
            'active'       => $counts['active'] ?? 0,
            'on_hold'      => $counts['on_hold'] ?? 0,
            'completed'    => $counts['completed'] ?? 0,
            'cancelled'    => $counts['cancelled'] ?? 0,
            'overdue'      => $overdue,
            'assigned'     => $assignedToMe,
        ]);
    }

    public function store(Request $request): JsonResponse
    {
        $companyIds = $this->companyIds();
        $requestedCompanyId = (int) $request->input('company_id');

        $validated = $request->validate([
            'company_id'         => ['required', 'integer', 'in:' . implode(',', $companyIds)],
            'client_id'           => ['nullable', 'integer', 'exists:clients,id'],
            'lead_id'             => ['nullable', 'integer', 'exists:leads,id'],
            'invoice_id'          => ['nullable', 'integer', 'exists:invoices,id'],
            // Must be an active member of THIS project's company specifically
            // — not just any company this admin owns (companyIds() is too
            // broad when the admin owns multiple companies).
            'project_manager_id'  => [
                'nullable', 'integer',
                Rule::exists('company_user_assignments', 'user_id')
                    ->where('company_id', $requestedCompanyId)
                    ->where('status', 'active'),
            ],
            'name'                => ['required', 'string', 'max:255'],
            'description'         => ['nullable', 'string'],
            'status'              => ['nullable', 'in:planning,active,on_hold,completed,cancelled'],
            'priority'            => ['nullable', 'in:low,medium,high,urgent'],
            'budget'              => ['nullable', 'numeric', 'min:0'],
            'start_date'          => ['nullable', 'date'],
            'deadline'            => ['nullable', 'date'],
        ], [
            'project_manager_id.exists' => 'Selected user does not belong to this company.',
        ]);

        $validated['status']   ??= 'active';
        $validated['priority'] ??= 'medium';
        // created_by FKs to `users` (staff) only; the Company Admin creating
        // this project isn't a `users` row, so record them via the parallel
        // created_by_admin_id column instead (created_by stays null/reserved
        // for a future staff-creation path, matching this module's dual
        // admin/user actor-tracking convention).
        $validated['created_by_admin_id'] = $this->admin()->id;

        // A lead named here without an explicit client_id has usually already
        // been converted to a Client (Api\Admin\LeadController::convert()) —
        // without this, the project would carry lead_id but a null
        // client_id, making it permanently invisible to the Client Portal
        // (Api\Client\ProjectController filters strictly on client_id, no
        // lead_id fallback).
        if (empty($validated['client_id']) && !empty($validated['lead_id'])) {
            $validated['client_id'] = \App\Models\Lead::find($validated['lead_id'])?->client?->id;
        }

        $project = DB::transaction(function () use ($validated) {
            $project = Project::create($validated);
            $this->createProjectFolders($project);
            return $project;
        });

        // Complete the back-link so the invoice shows up in the project's
        // own invoices() list (and billing summary), not just as the
        // project's single "originating invoice" field.
        if (!empty($validated['invoice_id'])) {
            \App\Models\Invoice::where('id', $validated['invoice_id'])->update(['project_id' => $project->id]);
        }

        SystemAuditLog::create([
            'company_id'  => $project->company_id,
            'user_id'     => null, // SystemAuditLog.user_id FKs to `users`; Company Admin actor isn't a User row
            'action'      => 'created',
            'module_key'  => 'project_management',
            'entity_type' => 'Project',
            'entity_id'   => $project->id,
            'new_values'  => $validated,
        ]);

        $project->logActivity('created', "Project \"{$project->name}\" created by {$this->adminName()}.", $this->adminName(), [
            'created_by_admin_id' => $this->admin()->id,
        ]);

        if ($project->project_manager_id) {
            $this->addAsProjectManager($project, $project->project_manager_id);
            $managerName = User::find($project->project_manager_id)?->name ?? 'Unknown';
            $project->logActivity('manager_assigned', "{$this->adminName()} assigned {$managerName} as project manager.", $this->adminName(), [
                'to' => $project->project_manager_id,
            ]);

            Notification::create([
                'user_id'    => $project->project_manager_id,
                'company_id' => $project->company_id,
                'type'       => 'project_assigned',
                'title'      => 'New project assigned',
                'body'       => "You were assigned as project manager for \"{$project->name}\".",
                // Recipient is always a real User (PM) — never Admin — so the
                // link must be the User-guard route, not /admin/projects/...
                'data'       => ['project_id' => $project->id, 'link' => "/projects/{$project->id}"],
            ]);
        }

        return ApiResponse::success($project->fresh(['client', 'projectManager', 'folders', 'createdByAdmin:id,name']), 'Project created', 201);
    }

    // Whoever is set as project_manager_id must also have a ProjectTeamMember
    // row, or the staff-guard visibility scope (project_manager_id OR
    // teamMembers OR assigned task) never actually grants them access via the
    // team-membership leg — keeps both signals in sync automatically.
    private function addAsProjectManager(Project $project, int $userId): void
    {
        ProjectTeamMember::updateOrCreate(
            ['project_id' => $project->id, 'user_id' => $userId],
            // assigned_by FKs to `users`; Company Admin actor isn't a User row
            ['role_in_project' => 'project_manager', 'assigned_by' => null]
        );
    }

    public function show(Request $request, int $id): JsonResponse
    {
        $project = Project::whereIn('company_id', $this->companyIds())
            ->with([
                'client:id,name,email',
                'invoice:id,invoice_number,total_amount,status',
                'invoices:id,invoice_number,total_amount,paid_amount,status,due_date,currency,project_id',
                'projectManager:id,name,role_type',
                'seller:id,name,email',
                'createdBy:id,name',
                'createdByAdmin:id,name',
                'deliverySubmittedBy:id,name',
                'deliveryApprovedByAdmin:id,name',
                'tasks' => fn($q) => $q->with('assignedTo:id,name'),
                'teamMembers.user:id,name,role_type',
                'folders' => fn($q) => $q->whereNull('parent_folder_id')->orderBy('sort_order'),
                'deliverables',
            ])
            ->findOrFail($id);

        $totalTasks = $project->tasks->count();
        $doneTasks  = $project->tasks->where('status', 'completed')->count();
        $project->progress = $totalTasks > 0 ? round(($doneTasks / $totalTasks) * 100) : 0;

        $totalInvoiced = (float) $project->invoices->sum('total_amount');
        $totalPaid     = (float) $project->invoices->sum('paid_amount');
        $project->billing_summary = [
            'total_invoiced' => $totalInvoiced,
            'total_paid'     => $totalPaid,
            'outstanding'    => max(0, round($totalInvoiced - $totalPaid, 2)),
        ];

        return ApiResponse::success($project);
    }

    // POST /admin/projects/{id}/invoices/link — attach an existing invoice
    // (deposit/milestone/final/change-request) to a project.
    public function linkInvoice(Request $request, int $id): JsonResponse
    {
        $project = Project::whereIn('company_id', $this->companyIds())->findOrFail($id);

        $validated = $request->validate(['invoice_id' => ['required', 'integer']]);

        $invoice = \App\Models\Invoice::where('company_id', $project->company_id)->find($validated['invoice_id']);
        if (!$invoice) {
            return ApiResponse::error('Invoice not found.', 404);
        }
        if ($invoice->project_id && $invoice->project_id !== $project->id) {
            return ApiResponse::error('This invoice is already linked to another project.', 422);
        }

        $invoice->update(['project_id' => $project->id]);
        $project->logActivity('invoice_linked', "{$this->adminName()} linked invoice {$invoice->invoice_number} to this project.", $this->adminName(), [
            'invoice_id' => $invoice->id,
        ]);

        return ApiResponse::success(null, 'Invoice linked to project');
    }

    // DELETE /admin/projects/{id}/invoices/{invoiceId}
    public function unlinkInvoice(int $id, int $invoiceId): JsonResponse
    {
        $project = Project::whereIn('company_id', $this->companyIds())->findOrFail($id);
        $invoice = \App\Models\Invoice::where('project_id', $project->id)->find($invoiceId);

        if (!$invoice) {
            return ApiResponse::error('Invoice not found on this project.', 404);
        }

        $invoice->update(['project_id' => null]);
        $project->logActivity('invoice_unlinked', "{$this->adminName()} unlinked invoice {$invoice->invoice_number} from this project.", $this->adminName(), [
            'invoice_id' => $invoice->id,
        ]);

        return ApiResponse::success(null, 'Invoice unlinked from project');
    }

    public function update(Request $request, int $id): JsonResponse
    {
        $companyIds = $this->companyIds();
        $project = Project::whereIn('company_id', $companyIds)->findOrFail($id);

        // Closed is a terminal, read-only state — only reopen() can move a
        // project out of it. Blocking here (not just hiding the button in the
        // UI) matches the "Closed project becomes read-only" requirement.
        if ($project->status === 'closed') {
            return ApiResponse::error('This project is closed and read-only. Reopen it first to make changes.', 422);
        }

        $validated = $request->validate([
            'client_id'           => ['sometimes', 'nullable', 'integer', 'exists:clients,id'],
            'invoice_id'          => ['nullable', 'integer', 'exists:invoices,id'],
            // Must belong to THIS project's own company — not just any
            // company this admin owns.
            'project_manager_id'  => [
                'nullable', 'integer',
                Rule::exists('company_user_assignments', 'user_id')
                    ->where('company_id', $project->company_id)
                    ->where('status', 'active'),
            ],
            'name'                => ['sometimes', 'string', 'max:255'],
            'description'         => ['nullable', 'string'],
            // 'completed' and 'closed' are reached only via complete()/close()
            // below (readiness checks, activity log, notifications) — never as
            // a bare status write through this generic update endpoint.
            'status'              => ['sometimes', 'in:planning,active,on_hold,blocked,cancelled'],
            'priority'            => ['sometimes', 'in:low,medium,high,urgent'],
            'budget'              => ['nullable', 'numeric', 'min:0'],
            'start_date'          => ['nullable', 'date'],
            'deadline'            => ['nullable', 'date'],
        ], [
            'project_manager_id.exists' => 'Selected user does not belong to this company.',
        ]);

        $wasManagerId = $project->project_manager_id;
        $before = $project->only(array_keys($validated));

        $project->update($validated);

        SystemAuditLog::create([
            'company_id'  => $project->company_id,
            'user_id'     => null, // SystemAuditLog.user_id FKs to `users`; Company Admin actor isn't a User row
            'action'      => 'updated',
            'module_key'  => 'project_management',
            'entity_type' => 'Project',
            'entity_id'   => $project->id,
            'new_values'  => $validated,
        ]);

        if (isset($validated['project_manager_id']) && $validated['project_manager_id'] !== $wasManagerId) {
            $oldManagerName = $wasManagerId ? (User::find($wasManagerId)?->name ?? 'Unknown') : null;
            $newManagerName = $validated['project_manager_id'] ? (User::find($validated['project_manager_id'])?->name ?? 'Unknown') : null;
            $managerType = $newManagerName ? ($oldManagerName ? 'manager_switched' : 'manager_assigned') : 'manager_unassigned';
            $managerDescription = $newManagerName
                ? ($oldManagerName
                    ? "{$this->adminName()} changed project manager from {$oldManagerName} to {$newManagerName}."
                    : "{$this->adminName()} assigned {$newManagerName} as project manager.")
                : "{$this->adminName()} unassigned project manager {$oldManagerName}.";
            $project->logActivity($managerType, $managerDescription, $this->adminName(), [
                'from' => $wasManagerId,
                'to' => $validated['project_manager_id'],
            ]);

            // Notification.user_id is NOT NULL — unassigning (new value null,
            // e.g. via the Projects listing's "Unassigned" option) must never
            // reach the Notification::create below, or it throws a DB
            // constraint violation.
            if ($validated['project_manager_id']) {
                $this->addAsProjectManager($project, $validated['project_manager_id']);

                Notification::create([
                    'user_id'    => $validated['project_manager_id'],
                    'company_id' => $project->company_id,
                    'type'       => 'project_assigned',
                    'title'      => 'Project assigned to you',
                    'body'       => "You were assigned as project manager for \"{$project->name}\".",
                    'data'       => ['project_id' => $project->id, 'link' => "/projects/{$project->id}"],
                ]);
            }
        }

        $changedFields = collect(array_keys($validated))
            ->filter(fn ($field) => $field !== 'project_manager_id' && ($before[$field] ?? null) != $project->{$field})
            ->values();

        if ($changedFields->contains('status')) {
            $project->logActivity('status_changed', "{$this->adminName()} changed status from {$before['status']} to {$project->status}.", $this->adminName(), [
                'from' => $before['status'] ?? null,
                'to' => $project->status,
            ]);
        }

        $otherFields = $changedFields->reject(fn ($field) => $field === 'status')->values();
        if ($otherFields->isNotEmpty()) {
            $project->logActivity('updated', "{$this->adminName()} updated " . $otherFields->implode(', ') . '.', $this->adminName(), [
                'fields' => $otherFields->all(),
            ]);
        }

        return ApiResponse::success($project->fresh(['client', 'projectManager']), 'Project updated');
    }

    public function destroy(int $id): JsonResponse
    {
        $project = Project::whereIn('company_id', $this->companyIds())->findOrFail($id);
        $project->delete();

        SystemAuditLog::create([
            'company_id'  => $project->company_id,
            'user_id'     => null, // SystemAuditLog.user_id FKs to `users`; Company Admin actor isn't a User row
            'action'      => 'deleted',
            'module_key'  => 'project_management',
            'entity_type' => 'Project',
            'entity_id'   => $project->id,
        ]);

        return ApiResponse::success(null, 'Project deleted');
    }

    public function assignTeam(Request $request, int $id): JsonResponse
    {
        $project = Project::whereIn('company_id', $this->companyIds())->findOrFail($id);

        if ($project->status === 'closed') {
            return ApiResponse::error('This project is closed and read-only. Reopen it first to make changes.', 422);
        }

        // Team members must be active members of THIS project's own company —
        // not just any company this admin owns (a multi-company admin could
        // otherwise pull a Company B user onto a Company A project).
        $validated = $request->validate([
            'members'                    => ['required', 'array'],
            'members.*.user_id'          => [
                'required', 'integer',
                Rule::exists('company_user_assignments', 'user_id')
                    ->where('company_id', $project->company_id)
                    ->where('status', 'active'),
            ],
            'members.*.role_in_project'  => ['required', 'in:project_manager,production_user,team_member,reviewer'],
        ], [
            'members.*.user_id.exists' => 'Selected user does not belong to this company.',
        ]);

        foreach ($validated['members'] as $member) {
            $existingMember = ProjectTeamMember::where('project_id', $project->id)
                ->where('user_id', $member['user_id'])
                ->first();
            $wasRole = $existingMember?->role_in_project;
            ProjectTeamMember::updateOrCreate(
                ['project_id' => $project->id, 'user_id' => $member['user_id']],
                // assigned_by FKs to `users`; Company Admin actor isn't a User row
                ['role_in_project' => $member['role_in_project'], 'assigned_by' => null]
            );
            $memberUser = User::find($member['user_id']);
            $memberName = $memberUser?->name ?? 'Unknown';

            // Being formally added to the team is itself the authorization
            // to chat — see ProjectChatService::addTeamMember(). Never for a
            // Seller: mirrors syncFormalTeamParticipants()'s hard "Seller
            // can never be auto-added" rule (added instead only via the
            // explicit Manage Participants path).
            if ($memberUser && $memberUser->role_type !== 'seller') {
                ProjectChatService::addTeamMember($project, $memberUser->id);
            }

            if (!$existingMember) {
                $project->logActivity('team_assigned', "{$this->adminName()} added {$memberName} to the project team as " . str_replace('_', ' ', $member['role_in_project']) . '.', $this->adminName(), [
                    'to' => $member['user_id'],
                    'role_in_project' => $member['role_in_project'],
                ]);
            } elseif ($wasRole !== $member['role_in_project']) {
                $project->logActivity('team_member_role_changed', "{$this->adminName()} changed {$memberName}'s project role from " . str_replace('_', ' ', $wasRole) . ' to ' . str_replace('_', ' ', $member['role_in_project']) . '.', $this->adminName(), [
                    'user_id' => $member['user_id'],
                    'from' => $wasRole,
                    'to' => $member['role_in_project'],
                ]);
            }

            Notification::create([
                'user_id'    => $member['user_id'],
                'company_id' => $project->company_id,
                'type'       => 'project_team_assigned',
                'title'      => 'Added to project team',
                'body'       => "You were added to the team for \"{$project->name}\".",
                'data'       => ['project_id' => $project->id, 'link' => "/projects/{$project->id}"],
            ]);
        }

        SystemAuditLog::create([
            'company_id'  => $project->company_id,
            'user_id'     => null, // SystemAuditLog.user_id FKs to `users`; Company Admin actor isn't a User row
            'action'      => 'team_assigned',
            'module_key'  => 'project_management',
            'entity_type' => 'Project',
            'entity_id'   => $project->id,
            'new_values'  => $validated,
        ]);

        return ApiResponse::success($project->teamMembers()->with('user:id,name,role_type')->get(), 'Team updated');
    }

    // PATCH /admin/projects/{id}/team/{memberId} — change an already-added
    // member's role without removing and re-adding them.
    public function updateMemberRole(Request $request, int $id, int $memberId): JsonResponse
    {
        $project = Project::whereIn('company_id', $this->companyIds())->findOrFail($id);
        $member  = $project->teamMembers()->findOrFail($memberId);

        if ($project->status === 'closed') {
            return ApiResponse::error('This project is closed and read-only. Reopen it first to make changes.', 422);
        }

        $validated = $request->validate([
            'role_in_project' => ['required', 'in:project_manager,production_user,team_member,reviewer'],
        ]);

        $wasRole = $member->role_in_project;
        if ($validated['role_in_project'] === $wasRole) {
            return ApiResponse::success($member->fresh('user:id,name,role_type'), 'Role unchanged');
        }

        $member->update(['role_in_project' => $validated['role_in_project']]);

        // Keep projects.project_manager_id in sync when a member is promoted
        // to Project Manager via this control — mirrors the one-directional
        // sync addAsProjectManager() already does from the other direction.
        if ($validated['role_in_project'] === 'project_manager' && $project->project_manager_id !== $member->user_id) {
            $project->update(['project_manager_id' => $member->user_id]);
        }

        Notification::create([
            'user_id'    => $member->user_id,
            'company_id' => $project->company_id,
            'type'       => 'project_role_changed',
            'title'      => 'Project role updated',
            'body'       => "Your role on \"{$project->name}\" was changed to " . str_replace('_', ' ', $validated['role_in_project']) . '.',
            'data'       => ['project_id' => $project->id, 'link' => "/projects/{$project->id}"],
        ]);

        SystemAuditLog::create([
            'company_id'  => $project->company_id,
            'user_id'     => null, // Company Admin actor isn't a User row
            'action'      => 'team_member_role_changed',
            'module_key'  => 'project_management',
            'entity_type' => 'Project',
            'entity_id'   => $project->id,
            'old_values'  => ['user_id' => $member->user_id, 'role_in_project' => $wasRole],
            'new_values'  => ['user_id' => $member->user_id, 'role_in_project' => $validated['role_in_project']],
        ]);
        $memberName = $member->user?->name ?? User::find($member->user_id)?->name ?? 'Unknown';
        $project->logActivity('team_member_role_changed', "{$this->adminName()} changed {$memberName}'s project role from " . str_replace('_', ' ', $wasRole) . ' to ' . str_replace('_', ' ', $validated['role_in_project']) . '.', $this->adminName(), [
            'user_id' => $member->user_id,
            'from' => $wasRole,
            'to' => $validated['role_in_project'],
        ]);

        return ApiResponse::success($member->fresh('user:id,name,role_type'), 'Role updated');
    }

    public function removeTeamMember(int $id, int $memberId): JsonResponse
    {
        $project = Project::whereIn('company_id', $this->companyIds())->findOrFail($id);
        $member  = $project->teamMembers()->findOrFail($memberId);

        if ($project->status === 'closed') {
            return ApiResponse::error('This project is closed and read-only. Reopen it first to make changes.', 422);
        }

        $removedUserId = $member->user_id;
        $removedUserName = $member->user?->name ?? User::find($removedUserId)?->name ?? 'Unknown';
        $member->delete();

        // Losing their team row can also mean losing their project chat
        // access — but only if they're not still tied to the project some
        // other way (e.g. still assigned to an open task).
        ProjectChatService::removeParticipantIfNoLongerEligible($project, $removedUserId);

        SystemAuditLog::create([
            'company_id'  => $project->company_id,
            'user_id'     => null, // Company Admin actor isn't a User row
            'action'      => 'team_member_removed',
            'module_key'  => 'project_management',
            'entity_type' => 'Project',
            'entity_id'   => $project->id,
            'old_values'  => ['user_id' => $removedUserId],
        ]);
        $project->logActivity('team_member_removed', "{$this->adminName()} removed {$removedUserName} from the project team.", $this->adminName(), [
            'user_id' => $removedUserId,
        ]);

        return ApiResponse::success(null, 'Team member removed');
    }

    private function completionService(): ProjectCompletionService
    {
        return app(ProjectCompletionService::class);
    }

    // GET /admin/projects/{id}/completion-status — backs the "Mark as
    // Complete" pre-flight checklist modal on the frontend.
    public function completionStatus(int $id): JsonResponse
    {
        $project = Project::whereIn('company_id', $this->companyIds())->findOrFail($id);
        $service = $this->completionService();
        $readiness = $service->checkReadiness($project);

        return ApiResponse::success([
            'status'             => $project->status,
            'ready'              => $readiness['ready'],
            'blockers'           => $readiness['blockers'],
            'has_unpaid_invoice' => $service->hasUnpaidInvoice($project),
        ]);
    }

    // Activate a draft project — the name-only stub auto-created when a client's
    // invoice payment starts one (see App\Services\PaymentProjectStartService).
    // Until this runs the project is invisible to the client portal and to any
    // sub-user without canActivateProjects. Company Admin is always structurally
    // allowed, same as complete/close/reopen below.
    //
    // Folders are created here rather than at auto-creation time: a draft that
    // nobody activates shouldn't leave storage behind.
    public function activate(int $id): JsonResponse
    {
        $project = Project::whereIn('company_id', $this->companyIds())->findOrFail($id);

        if ($project->status !== 'draft') {
            return ApiResponse::error("Only a draft project can be activated — this one is {$project->status}.", 422);
        }

        $project->update(['status' => 'active']);

        if ($project->folders()->count() === 0) {
            $this->createProjectFolders($project);
        }

        $project->logActivity('activated', "Draft project activated by {$this->adminName()}.", $this->adminName());

        SystemAuditLog::create([
            'company_id' => $project->company_id, 'user_id' => null,
            'action' => 'activated', 'module_key' => 'project_management',
            'entity_type' => 'Project', 'entity_id' => $project->id,
        ]);

        $this->notifyLifecycle($project, 'project_activated', 'Project activated', "\"{$project->name}\" was activated by {$this->adminName()}.");

        return ApiResponse::success($project->fresh(), 'Project activated');
    }

    // Company Admin is always structurally allowed to complete/close/reopen —
    // no permission gate here, mirroring how this guard never checks
    // UserCompanyPermission anywhere else in this controller.
    public function complete(int $id): JsonResponse
    {
        $project = Project::whereIn('company_id', $this->companyIds())->findOrFail($id);

        // A draft has no work to complete — it must be activated first.
        if ($project->status === 'draft') {
            return ApiResponse::error('Activate this draft project before completing it.', 422);
        }

        if (in_array($project->status, ['completed', 'closed'])) {
            return ApiResponse::error("Project is already {$project->status}.", 422);
        }

        $readiness = $this->completionService()->checkReadiness($project);
        if (!$readiness['ready']) {
            return ApiResponse::error('Project cannot be completed yet — outstanding work remains.', 422, ['blockers' => $readiness['blockers']]);
        }

        $project->update([
            'status'                => 'completed',
            'completed_at'          => now(),
            'completed_by_admin_id' => $this->admin()->id,
        ]);

        $project->logActivity('completed', "Project marked as completed by {$this->adminName()}.", $this->adminName());

        SystemAuditLog::create([
            'company_id' => $project->company_id, 'user_id' => null,
            'action' => 'completed', 'module_key' => 'project_management',
            'entity_type' => 'Project', 'entity_id' => $project->id,
        ]);

        $this->notifyLifecycle($project, 'project_completed', 'Project completed', "\"{$project->name}\" was marked as completed by {$this->adminName()}.");

        return ApiResponse::success($project->fresh(), 'Project marked as completed');
    }

    public function downloadDelivery(int $id): StreamedResponse
    {
        $project = Project::whereIn('company_id', $this->companyIds())->findOrFail($id);

        if (!$project->delivery_file_path) {
            abort(404, 'Project delivery is not available yet.');
        }

        if (!Storage::exists($project->delivery_file_path)) {
            abort(404, 'Project delivery file not found.');
        }

        return Storage::download($project->delivery_file_path, $project->delivery_file_name ?? "{$project->name}-delivery.zip");
    }

    public function approveDelivery(int $id): JsonResponse
    {
        $project = Project::whereIn('company_id', $this->companyIds())
            ->with(['client:id,name,user_id', 'deliverySubmittedBy:id,name'])
            ->findOrFail($id);

        if ($project->status !== 'completed') {
            return ApiResponse::error('Only a completed project can be delivered to the client.', 422);
        }

        if ($project->delivery_status !== 'pending_admin_review' || !$project->delivery_file_path) {
            return ApiResponse::error('No project delivery is pending admin review.', 422);
        }

        if (!Storage::exists($project->delivery_file_path)) {
            return ApiResponse::error('The submitted delivery file is missing from storage.', 422);
        }

        $project->update([
            'delivery_status'               => 'delivered_to_client',
            'delivery_approved_at'          => now(),
            'delivery_approved_by_admin_id' => $this->admin()->id,
        ]);

        $project->logActivity('project_delivery_approved', "{$this->adminName()} approved the final project package and delivered it to the client.", $this->adminName(), [
            'file_name' => $project->delivery_file_name,
        ]);

        SystemAuditLog::create([
            'company_id' => $project->company_id, 'user_id' => null,
            'action' => 'project_delivery_approved', 'module_key' => 'project_management',
            'entity_type' => 'Project', 'entity_id' => $project->id,
            'new_values' => ['file_name' => $project->delivery_file_name],
        ]);

        if ($project->delivery_submitted_by) {
            NotificationService::send([
                'company_id'         => $project->company_id,
                'recipient_user_id'  => $project->delivery_submitted_by,
                'actor_admin_id'     => $this->admin()->id,
                'module'             => 'project_management',
                'type'               => 'project_delivery_approved',
                'title'              => 'Project delivered to client',
                'message'            => "\"{$project->name}\" was approved and delivered to the client.",
                'entity_type'        => 'Project',
                'entity_id'          => $project->id,
                'url'                => "/projects/{$project->id}",
            ]);
        }

        if ($project->client?->user_id) {
            Notification::create([
                'user_id'        => $project->client->user_id,
                'actor_admin_id' => $this->admin()->id,
                'company_id'     => $project->company_id,
                'module'         => 'client_portal',
                'type'           => 'project_delivered',
                'title'          => 'Project delivered',
                'body'           => "\"{$project->name}\" is ready to download.",
                'entity_type'    => 'Project',
                'entity_id'      => $project->id,
                'url'            => "/client/projects/{$project->id}",
                'data'           => ['project_id' => $project->id, 'link' => "/client/projects/{$project->id}"],
            ]);
        }

        ProjectComment::create([
            'company_id'      => $project->company_id,
            'project_id'      => $project->id,
            'author_admin_id' => $this->admin()->id,
            'body'            => "Final project package approved and delivered to the client.",
            'visibility'      => 'client',
        ]);

        return ApiResponse::success(
            $project->fresh(['client:id,name,email,user_id', 'projectManager:id,name,role_type', 'seller:id,name,email', 'deliverySubmittedBy:id,name', 'deliveryApprovedByAdmin:id,name']),
            'Project delivered to client'
        );
    }

    public function close(Request $request, int $id): JsonResponse
    {
        $project = Project::whereIn('company_id', $this->companyIds())->findOrFail($id);

        $validated = $request->validate([
            'force'                  => ['nullable', 'boolean'],
            'reason'                 => ['nullable', 'string', 'max:1000'],
            'confirm_unpaid_invoice' => ['nullable', 'boolean'],
        ]);
        $force = (bool) ($validated['force'] ?? false);

        // A never-activated draft isn't something to "close" — it's a stub.
        if ($project->status === 'draft') {
            return ApiResponse::error('Activate this draft project before closing it.', 422);
        }

        if ($project->status === 'closed') {
            return ApiResponse::error('Project is already closed.', 422);
        }

        if ($project->status !== 'completed' && !$force) {
            $project->logActivity('close_blocked', "Close attempted by {$this->adminName()} but project is not yet Completed.", $this->adminName());
            return ApiResponse::error('Project must be Completed before it can be closed. Use Force Close to close anyway.', 422);
        }

        if ($force && empty($validated['reason'])) {
            return ApiResponse::error('A reason is required to force-close a project that is not yet Completed.', 422);
        }

        if ($this->completionService()->hasUnpaidInvoice($project) && empty($validated['confirm_unpaid_invoice'])) {
            return ApiResponse::error('This project has an unpaid invoice. Confirm to close anyway.', 422, ['warning' => 'unpaid_invoice']);
        }

        $project->update([
            'status'             => 'closed',
            'closed_at'          => now(),
            'closed_by_admin_id' => $this->admin()->id,
            'close_reason'       => $validated['reason'] ?? null,
        ]);

        $project->logActivity(
            'closed',
            "Project closed by {$this->adminName()}." . (!empty($validated['reason']) ? " Reason: {$validated['reason']}" : ''),
            $this->adminName()
        );

        SystemAuditLog::create([
            'company_id' => $project->company_id, 'user_id' => null,
            'action' => 'closed', 'module_key' => 'project_management',
            'entity_type' => 'Project', 'entity_id' => $project->id,
        ]);

        $this->notifyLifecycle($project, 'project_closed', 'Project closed', "\"{$project->name}\" was closed by {$this->adminName()}.");

        return ApiResponse::success($project->fresh(), 'Project closed');
    }

    public function reopen(Request $request, int $id): JsonResponse
    {
        $project = Project::whereIn('company_id', $this->companyIds())->findOrFail($id);

        $validated = $request->validate([
            'reason' => ['required', 'string', 'max:1000'],
        ]);

        if (!in_array($project->status, ['completed', 'closed'])) {
            return ApiResponse::error('Only a Completed or Closed project can be reopened.', 422);
        }

        $project->update([
            'status'                => 'active',
            'reopened_at'           => now(),
            'reopened_by_admin_id'  => $this->admin()->id,
            'reopen_reason'         => $validated['reason'],
            'completed_at'          => null,
            'completed_by'          => null,
            'completed_by_admin_id' => null,
            'closed_at'             => null,
            'closed_by'             => null,
            'closed_by_admin_id'    => null,
            'close_reason'          => null,
        ]);

        $project->logActivity('reopened', "Project reopened by {$this->adminName()}. Reason: {$validated['reason']}", $this->adminName());

        SystemAuditLog::create([
            'company_id' => $project->company_id, 'user_id' => null,
            'action' => 'reopened', 'module_key' => 'project_management',
            'entity_type' => 'Project', 'entity_id' => $project->id,
        ]);

        $this->notifyLifecycle($project, 'project_reopened', 'Project reopened', "\"{$project->name}\" was reopened by {$this->adminName()}. Reason: {$validated['reason']}");

        return ApiResponse::success($project->fresh(), 'Project reopened');
    }

    // Notifies PM/team/production/seller via the existing per-user Notification
    // channel, plus a visibility='client' system comment if Client Portal is
    // active for this project — the only client-facing channel this codebase
    // has. Company Admin itself is notified via the SystemAuditLog entry
    // written alongside each call site (feeds the Admin notification bell).
    private function notifyLifecycle(Project $project, string $type, string $title, string $body): void
    {
        $service = $this->completionService();

        foreach ($service->notificationTargetUserIds($project) as $userId) {
            Notification::create([
                'user_id' => $userId, 'company_id' => $project->company_id,
                'type' => $type, 'title' => $title, 'body' => $body,
                'data' => ['project_id' => $project->id, 'link' => "/projects/{$project->id}"],
            ]);
        }

        if ($service->clientPortalActive($project)) {
            ProjectComment::create([
                'company_id'      => $project->company_id,
                'project_id'      => $project->id,
                'author_admin_id' => $this->admin()->id,
                'body'            => $body,
                'visibility'      => 'client',
            ]);
        }
    }

    /**
     * Merged activity feed for a project: audit-log entries (created/updated/
     * deleted/team_assigned) for the project itself and its tasks, plus any
     * admin/staff-authored comments — sorted newest first.
     */
    public function activity(int $id): JsonResponse
    {
        $project = Project::whereIn('company_id', $this->companyIds())->findOrFail($id);
        $taskIds = Task::where('project_id', $project->id)->pluck('id');

        $projectLogs = $project->activities()
            ->get()
            ->map(fn ($activity) => [
                'type'        => 'log',
                'action'      => $activity->type,
                'entity_type' => 'Project',
                'description' => $activity->description,
                'causer_name' => $activity->causer_name,
                'meta'        => $activity->meta,
                'created_at'  => $activity->created_at,
            ]);

        $projectActivityActions = $projectLogs->pluck('action')->all();

        $logs = SystemAuditLog::where(function ($q) use ($id, $taskIds, $projectActivityActions) {
                $q->where(function ($q2) use ($id, $projectActivityActions) {
                    $q2->where(['entity_type' => 'Project', 'entity_id' => $id])
                        ->when($projectActivityActions, fn ($q3) => $q3->whereNotIn('action', $projectActivityActions));
                })
                ->orWhere(function ($q2) use ($taskIds) {
                    $q2->where('entity_type', 'Task')->whereIn('entity_id', $taskIds);
                });
            })
            // Comment-added actions already appear as proper comment bubbles
            // via the $comments query below — exclude here to avoid showing
            // each comment twice in the merged feed.
            ->where('action', 'not like', '%_comment_added')
            ->get()
            ->map(fn ($log) => [
                'type'       => 'log',
                'action'     => $log->action,
                'entity_type' => $log->entity_type,
                'created_at' => $log->created_at,
            ]);

        $comments = ProjectComment::where('project_id', $id)
            // Task-scoped comments belong on their own Task page only —
            // mirrors ProjectCommentController::index()'s scoping so a task's
            // comments don't leak into this project-level History feed.
            ->whereNull('task_id')
            ->with(['authorAdmin:id,name', 'authorUser:id,name'])
            ->get()
            ->map(fn ($c) => [
                'type'       => 'comment',
                'body'       => $c->body,
                'task_id'    => $c->task_id,
                'author'     => $c->authorAdmin?->name ?? $c->authorUser?->name ?? 'Unknown',
                'created_at' => $c->created_at,
            ]);

        $activity = $projectLogs->concat($logs)->concat($comments)->sortByDesc('created_at')->values();

        return ApiResponse::success($activity);
    }

    /**
     * Creates the project's storage folder plus the 10 system subfolders,
     * both as ProjectFolder rows and as real backing directories.
     * Reuses folders if they already exist (safe to retry); cleans up any
     * directories it created if a later step fails, so nothing is orphaned.
     */
    private function createProjectFolders(Project $project): void
    {
        $slug = Str::slug($project->name) ?: 'project';
        $rootPath = "companies/{$project->company_id}/projects/{$project->id}-{$slug}";

        $createdDirs = [];

        try {
            if (!Storage::exists($rootPath)) {
                Storage::makeDirectory($rootPath);
                $createdDirs[] = $rootPath;
            }

            $project->update(['storage_folder' => $rootPath]);

            foreach (self::SYSTEM_FOLDERS as $name) {
                $folderPath = "{$rootPath}/{$name}";

                if (!Storage::exists($folderPath)) {
                    Storage::makeDirectory($folderPath);
                    $createdDirs[] = $folderPath;
                }

                ProjectFolder::firstOrCreate(
                    ['project_id' => $project->id, 'name' => $name, 'parent_folder_id' => null],
                    ['folder_path' => $folderPath, 'is_system' => true, 'created_by' => null]
                );
            }
        } catch (\Throwable $e) {
            foreach (array_reverse($createdDirs) as $dir) {
                Storage::deleteDirectory($dir);
            }
            throw $e;
        }
    }
}
