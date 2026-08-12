<?php

namespace App\Http\Controllers\Api\User;

use App\Helpers\ApiResponse;
use App\Http\Controllers\Controller;
use App\Models\CompanyModule;
use App\Models\Invoice;
use App\Models\Lead;
use App\Models\Notification;
use App\Models\Project;
use App\Models\ProjectFolder;
use App\Models\ProjectTeamMember;
use App\Models\ProjectComment;
use App\Models\SystemAuditLog;
use App\Models\Task;
use App\Models\User;
use App\Models\UserCompanyPermission;
use App\Services\ProjectChatService;
use App\Services\ProjectCompletionService;
use App\Services\ProjectSellerAssignmentService;
use App\Support\PermissionDebug;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;

class ProjectController extends Controller
{
    // Mirrors Api\Admin\ProjectController::SYSTEM_FOLDERS — every project gets
    // the same starter folder set regardless of who created it.
    private const SYSTEM_FOLDERS = [
        'documents', 'tasks', 'production', 'compliance', 'invoices',
        'client-files', 'internal-notes', 'deliverables', 'revisions', 'timesheets',
    ];

    private function user() { return auth('sanctum')->user(); }

    private function can(string $permKey, string $moduleKey = 'project_management'): bool
    {
        $user = $this->user();
        $result = UserCompanyPermission::where('user_id', $user->id)
            ->where('company_id', $user->company_id)
            ->where('module_key', $moduleKey)
            ->where('permission_key', $permKey)
            ->exists();
        PermissionDebug::log($user->id, $user->company_id, $user->role_type, $moduleKey, $permKey, $result);
        return $result;
    }

    private function moduleActive(string $dbModuleKey): bool
    {
        return CompanyModule::where('company_id', $this->user()->company_id)
            ->where('module_key', $dbModuleKey)
            ->where('is_enabled', true)
            ->exists();
    }

    private function anyCan(array $permKeys): bool
    {
        foreach ($permKeys as $key) {
            if ($this->can($key)) return true;
        }
        return false;
    }

    private function logActivity(int $companyId, string $action, string $entityType, int $entityId, array $newValues = []): void
    {
        SystemAuditLog::create([
            'company_id' => $companyId, 'user_id' => $this->user()->id,
            'action' => $action, 'module_key' => 'project_management',
            'entity_type' => $entityType, 'entity_id' => $entityId, 'new_values' => $newValues,
        ]);
    }

    // Projects the current staff member can see — purely permission-based, no
    // Data Scope layer: everything in their company if canViewAllCompanyProjects
    // is granted, otherwise only projects where they are the manager, a team
    // member, individually assigned a task, the one who created/handed it
    // off, the seller who initiated its handoff, or — a Seller's own sales
    // activity — the project is linked to a lead or client that's theirs.
    private function visibleProjects()
    {
        $user = $this->user();
        $base = Project::where('company_id', $user->company_id);

        // Draft projects are name-only stubs auto-created by a client's payment
        // (App\Services\PaymentProjectStartService) and are reserved for whoever
        // can actually act on them — Company Admin (a different guard entirely)
        // or a sub-user granted canActivateProjects. Everyone else never sees
        // one, in any list or by id, until it's activated. Applied before the
        // canViewAllCompanyProjects shortcut below so that broad grant doesn't
        // leak drafts.
        if (!$this->can('canActivateProjects')) {
            $base->where('status', '!=', 'draft');
        }

        if ($this->can('canViewAllCompanyProjects')) {
            return $base;
        }

        return $base->where(function ($q) use ($user) {
            $q->where('project_manager_id', $user->id)
              ->orWhere('created_by', $user->id)
              ->orWhere('seller_id', $user->id)
              ->orWhereHas('teamMembers', fn($t) => $t->where('user_id', $user->id))
              ->orWhereHas('tasks', fn($t) => $t->where('assigned_to', $user->id))
              ->orWhereHas('lead', fn($l) => $l->where('assigned_to', $user->id)->orWhere('transferred_to', $user->id))
              ->orWhereHas('client', fn($c) => $c->where('account_manager', $user->id));
        });
    }

    public function index(Request $request): JsonResponse
    {
        // The Project Dashboard page is gated on canViewProjectDashboard alone
        // (a summary view) but pulls its data from this same list endpoint —
        // accept either permission so a dashboard-only grant isn't left with a
        // sidebar link that 403s the moment it loads. canViewLinkedProjects is
        // the Seller-tier equivalent of canViewProjects — same list endpoint,
        // visibleProjects() above naturally narrows it to their own linked work.
        // canViewTeamResources/canAssignTeamResources cover the Team/Resources
        // page, which reuses this same endpoint for its per-project member
        // lists (frontend/app/projects/team/page.tsx) — same reasoning.
        if (!$this->can('canViewProjects') && !$this->can('canViewProjectDashboard') && !$this->can('canViewLinkedProjects')
            && !$this->can('canViewTeamResources') && !$this->can('canAssignTeamResources') && !$this->can('canViewAllCompanyProjects')) {
            return ApiResponse::error('Permission denied', 403);
        }

        $q = $this->visibleProjects()->with(['client:id,name', 'projectManager:id,name,role_type', 'teamMembers.user:id,name,role_type']);

        if ($request->filled('status'))    $q->where('status', $request->status);
        if ($request->filled('client_id')) $q->where('client_id', $request->client_id);

        $projects = $q->orderByDesc('created_at')->get();

        $taskStats = Task::whereIn('project_id', $projects->pluck('id'))
            ->selectRaw('project_id, COUNT(*) as total, SUM(CASE WHEN status = "completed" THEN 1 ELSE 0 END) as done')
            ->groupBy('project_id')
            ->get()
            ->keyBy('project_id');

        $user = $this->user();
        $canViewAll = $this->can('canViewAllCompanyProjects');

        $projects = $projects->map(function ($p) use ($taskStats, $user, $canViewAll) {
            $stats = $taskStats[$p->id] ?? null;
            $p->progress = $stats && $stats->total > 0 ? round(($stats->done / $stats->total) * 100) : 0;
            // Budget is financial data — Company Admin only, never surfaced to staff.
            $p->makeHidden('budget');

            // The viewing user's own relationship to THIS project — the frontend's
            // "Role" column showed the assigned PM's name (wrong: someone else's
            // identity under a header that reads as "your role"). This reflects
            // why visibleProjects() actually surfaced the project to them.
            //
            // seller_id is checked BEFORE project_manager_id/teamRole: a Seller
            // handing off their own project defaults to being its PM (see
            // store()'s handoff branch — they get project_manager_id set to
            // themselves when they don't hold canRequestPMAssignment), but
            // that's an artifact of the handoff, not a real PM appointment —
            // showing "Project Manager" there is misleading, since the person
            // is a Seller by role, just acting as caretaker of their own
            // handed-off project.
            $teamRole = $p->teamMembers->firstWhere('user_id', $user->id)?->role_in_project;
            $p->my_role = match (true) {
                $p->seller_id === $user->id   => 'Seller',
                $p->project_manager_id === $user->id, $teamRole === 'project_manager' => 'Project Manager',
                $teamRole !== null => 'Team Member',
                $p->created_by === $user->id  => 'Creator',
                $p->tasks()->where('assigned_to', $user->id)->exists() => 'Assigned',
                $canViewAll => 'Company-wide Access',
                default => '—',
            };

            return $p;
        });

        return ApiResponse::success($projects);
    }

    // canCreateProjects previously had no effect — sub-users could be granted
    // it, but there was no route or form to actually create a project (only
    // Company Admin could). This gives it a real, gated implementation.
    //
    // A Seller with ONLY canCreateProjectHandoff (not the broader
    // canCreateProjects) can create a project too, but strictly as a handoff:
    // it requires both the Sales ('leads') and Project Management ('projects')
    // DB modules active, and EITHER a Won lead of theirs (lead_id) OR a client
    // of theirs (client_id) — not a general "create any project" right. Such a
    // project is tagged seller_id/source='sales_handoff' (see below) and can't
    // freely name a project_manager_id unless canRequestPMAssignment is also
    // held — that stays a Project Manager-level action otherwise.
    public function store(Request $request): JsonResponse
    {
        $user = $this->user();

        // Hard role_type check, defense-in-depth: a Seller must never get
        // the unrestricted "create any project, no lead/payment needed"
        // path — even if a Company Admin mistakenly also grants them the
        // broader canCreateProjects (a PM-tier permission) alongside their
        // intended canCreateProjectHandoff. Without this, canCreateProjects
        // alone flips $isHandoff to false below, skipping the entire
        // Deal-eligibility gate this controller exists to enforce. Matches
        // the same hard role_type='seller' pattern already used throughout
        // TaskController/ProjectAttachmentController/ProjectMessengerController.
        $canFullCreate = $this->can('canCreateProjects') && $user->role_type !== 'seller';
        $canHandoff    = $this->can('canCreateProjectHandoff');

        if (!$canFullCreate && !$canHandoff) {
            return ApiResponse::error('Permission denied', 403);
        }

        $companyId = $user->company_id;
        $isHandoff = !$canFullCreate;
        // Set only when this handoff is triggered from a paid invoice (as
        // opposed to the original Won-lead/own-client triggers below, which
        // stay completely unchanged) — used after project creation to
        // back-link project.invoice_id / invoice.project_id.
        $sourceInvoice  = null;
        $overrideReason = null;

        if ($isHandoff) {
            if (!$this->moduleActive('leads') || !$this->moduleActive('projects')) {
                return ApiResponse::error('Both Sales and Project Management must be active to hand off a project.', 403);
            }

            $sourceInvoiceId = $request->input('source_invoice_id');
            $leadId   = $request->input('lead_id');
            $clientId = $request->input('client_id');
            $canAllLeads        = $this->can('canViewAllCompanyLeads', 'sales');
            $canOverridePayment = $this->can('canOverrideProjectCreationBeforePayment');
            $canManageInvoices  = $this->can('canManageProjectInvoices');

            if ($sourceInvoiceId) {
                $sourceInvoice = Invoice::where('company_id', $companyId)->where('id', $sourceInvoiceId)->first();
                if (!$sourceInvoice) {
                    return ApiResponse::error('Invoice not found.', 404);
                }
                if ($sourceInvoice->status !== 'paid') {
                    // A company that allows partial-payment project start
                    // (the same CompanyDealSettings toggle the Won-lead path
                    // below already reads) also unlocks a handoff from a
                    // Partially Paid invoice with some confirmed payment —
                    // previously this path was strict paid-only, silently
                    // rejecting the same partial payment the lead-based path
                    // would already accept.
                    $dealSettings = \App\Models\CompanyDealSettings::forAdmin(
                        \App\Models\Company::find($companyId)?->admin_id ?? 0
                    );
                    $partiallyEligible = $sourceInvoice->status === 'partially_paid'
                        && $dealSettings->startsOnPartialPayment()
                        && (float) $sourceInvoice->paid_amount > 0;

                    if (!$partiallyEligible && !$canOverridePayment) {
                        $message = $sourceInvoice->status === 'partially_paid'
                            ? 'Project can be created after the required deposit payment is completed.'
                            : 'Project can be created after payment is received.';
                        return ApiResponse::error($message, 422);
                    }
                }
                if ($sourceInvoice->created_by !== $user->id && !$canAllLeads && !$canOverridePayment) {
                    return ApiResponse::error('You do not have permission to create project from this invoice.', 403);
                }
                if ($sourceInvoice->project_id && !$canManageInvoices) {
                    return ApiResponse::error('This invoice is already linked to a project.', 422);
                }
                // A paid invoice (already ownership/permission-checked above)
                // is itself sufficient authorization — feed its own lead_id/
                // client_id into the standard validation below rather than
                // re-running the Won-lead/account-manager checks meant for
                // the other two trigger paths.
                $leadId   = $sourceInvoice->lead_id;
                $clientId = $sourceInvoice->client_id;
                $request->merge(['lead_id' => $leadId, 'client_id' => $clientId]);
            } elseif ($leadId) {
                $leadQuery = Lead::where('company_id', $companyId)->where('id', $leadId);
                if (!$canAllLeads) {
                    $leadQuery->where(fn($q) => $q->where('assigned_to', $user->id)->orWhere('transferred_to', $user->id));
                }
                $lead = $leadQuery->first();
                if (!$lead) {
                    return ApiResponse::error('You can only hand off a project from your own lead.', 403);
                }
                if ($lead->status !== 'won') {
                    return ApiResponse::error('A project can only be handed off from a Won lead.', 422);
                }

                // Duplicate-project prevention — a Deal gets at most one
                // handoff project. A second attempt (double-click, retry)
                // returns the existing project instead of erroring the
                // seller into creating a second one.
                $existingProject = $lead->projects()->first();
                if ($existingProject) {
                    return ApiResponse::success(
                        $existingProject->makeHidden('budget'),
                        "Project {$existingProject->reference} has already been created for this Deal.",
                        200
                    );
                }

                // Core rule: marking a Lead Won never by itself makes it
                // eligible for a project — the Deal must have cleared its
                // kickoff-payment requirement first (see
                // App\Services\DealEligibilityService). A company that has
                // enabled "allow partial-payment project start" only
                // requires SOME verified payment, not the full amount.
                $dealSettings = \App\Models\CompanyDealSettings::forAdmin(
                    \App\Models\Company::find($companyId)?->admin_id ?? 0
                );
                $eligible = $dealSettings->startsOnPartialPayment()
                    ? \App\Services\DealEligibilityService::netPaidAmount($lead) > 0
                    : \App\Services\DealEligibilityService::isEligible($lead);

                if (!$eligible) {
                    if (!$canOverridePayment || !$dealSettings->allow_admin_override) {
                        return ApiResponse::error('The Deal has not received the required kickoff payment.', 422);
                    }

                    $overrideReason = trim((string) $request->input('override_reason'));
                    if ($overrideReason === '') {
                        return ApiResponse::error('An override reason is required to create this project before payment.', 422);
                    }
                }
            } elseif ($clientId) {
                $clientQuery = \App\Models\Client::where('company_id', $companyId)->where('id', $clientId);
                if (!$canAllLeads) {
                    $clientQuery->where('account_manager', $user->id);
                }
                if (!$clientQuery->exists()) {
                    return ApiResponse::error('You can only create a project handoff for your own client.', 403);
                }
            } else {
                return ApiResponse::error('A Won lead_id, your own client_id, or a paid source_invoice_id is required to hand off a project.', 422);
            }
        }

        $validated = $request->validate([
            'client_id'          => ['nullable', 'integer', Rule::exists('clients', 'id')->where('company_id', $companyId)],
            // Sales → Project handoff: links this project back to the won
            // lead it came from, so Sales can show "Linked Projects".
            'lead_id'            => ['nullable', 'integer', Rule::exists('leads', 'id')->where('company_id', $companyId)],
            'project_manager_id' => ['nullable', 'integer', Rule::exists('users', 'id')->where('company_id', $companyId)],
            'name'               => ['required', 'string', 'max:255'],
            'description'        => ['nullable', 'string'],
            'status'             => ['nullable', 'in:planning,active,on_hold,completed,cancelled'],
            'priority'           => ['nullable', 'in:low,medium,high,urgent'],
            'start_date'         => ['nullable', 'date'],
            'deadline'           => ['nullable', 'date'],
            // Budget is Company Admin-only financial data (see makeHidden('budget')
            // throughout this controller) — deliberately not accepted here.
        ]);

        // Naming a project_manager_id is a PM-level action for a handoff-only
        // Seller — requires the explicit "Request PM Assignment" permission,
        // otherwise it's silently dropped (they still end up as PM themselves
        // via the default below, same as before).
        if ($isHandoff && !$this->can('canRequestPMAssignment')) {
            unset($validated['project_manager_id']);
        }

        $validated['company_id'] = $companyId;
        $validated['status']   ??= 'active';
        $validated['priority'] ??= 'medium';
        $validated['created_by'] = $user->id;
        $validated['reference']  = $this->nextProjectReference();
        if ($isHandoff) {
            $validated['seller_id'] = $user->id;
            $validated['source']    = $sourceInvoice
                ? ($sourceInvoice->status === 'paid' ? 'paid_invoice_handoff' : 'partial_paid_invoice_handoff')
                : 'sales_handoff';
        }
        if ($sourceInvoice) {
            $validated['invoice_id'] = $sourceInvoice->id;
        }
        // Default the creator to project manager unless they named someone else.
        $validated['project_manager_id'] ??= $user->id;

        $project = DB::transaction(function () use ($validated, $user) {
            $project = Project::create($validated);
            $this->createProjectFolders($project, $user->id);
            return $project;
        });

        // Complete the back-link: the invoice now knows which project it's
        // billed under, same as any additional invoice linked later via the
        // dedicated link-invoice endpoint.
        if ($sourceInvoice) {
            $sourceInvoice->update(['project_id' => $project->id]);
        }

        // Whoever ends up as project_manager_id must also have a
        // ProjectTeamMember row, or visibleProjects()'s guard scope never
        // actually grants them access via the team-membership leg.
        ProjectTeamMember::updateOrCreate(
            ['project_id' => $project->id, 'user_id' => $project->project_manager_id],
            ['role_in_project' => 'project_manager', 'assigned_by' => $user->id]
        );

        if ($project->project_manager_id !== $user->id) {
            Notification::create([
                'user_id'    => $project->project_manager_id,
                'company_id' => $project->company_id,
                'type'       => 'project_assigned',
                'title'      => 'New project assigned',
                'body'       => "You were assigned as project manager for \"{$project->name}\".",
                'data'       => ['project_id' => $project->id, 'link' => "/projects/{$project->id}"],
            ]);
        }

        // A Seller handing themselves off a project (seller_id === creator)
        // is dropped straight into its chat — same reasoning as
        // ProjectSellerAssignmentService::assign(). Without this they'd hold
        // canViewProjectChat/canSendProjectChatMessage but still 403 on their
        // own project until a PM/Admin separately opened "Manage
        // Participants" — see ProjectChatService::addSeller().
        if ($isHandoff) {
            ProjectChatService::addSeller($project, $user->id);
        }

        $this->logActivity($project->company_id, 'created', 'Project', $project->id, $validated);

        if ($project->lead_id) {
            $lead = \App\Models\Lead::find($project->lead_id);
            if ($lead) {
                $lead->logActivity('note_added', "Project \"{$project->name}\" created from this lead", $user->name ?? 'User');
                SystemAuditLog::create([
                    'company_id'  => $project->company_id,
                    'user_id'     => $user->id,
                    'action'      => 'project_handoff_created',
                    'module_key'  => 'sales',
                    'entity_type' => 'Lead',
                    'entity_id'   => $lead->id,
                    'new_values'  => ['preview' => "Project \"{$project->name}\" created from lead \"{$lead->name}\"", 'author' => $user->name],
                ]);

                // Deal fulfillment_status flips to project_created now that
                // lead->projects()->exists() is true.
                \App\Services\DealEligibilityService::recomputeFulfillmentStatus($lead);

                if ($overrideReason !== null) {
                    $lead->logActivity('admin_override_used',
                        "Project created before required payment — override reason: {$overrideReason}",
                        $user->name ?? 'User', ['override_reason' => $overrideReason, 'overridden_by' => $user->id]);
                    SystemAuditLog::create([
                        'company_id'  => $project->company_id,
                        'user_id'     => $user->id,
                        'action'      => 'project_creation_override',
                        'module_key'  => 'project_management',
                        'entity_type' => 'Project',
                        'entity_id'   => $project->id,
                        'new_values'  => [
                            'preview' => "Project \"{$project->name}\" created before required payment",
                            'override_reason' => $overrideReason,
                            'payment_amount_at_override' => \App\Services\DealEligibilityService::netPaidAmount($lead),
                        ],
                    ]);
                }

                // Client-facing activity trail — mirrors
                // InvoicePaymentService::logClientActivity()'s exact shape.
                if ($lead->client_id) {
                    SystemAuditLog::create([
                        'company_id'  => $project->company_id,
                        'user_id'     => null,
                        'action'      => 'client_project_activated',
                        'module_key'  => 'client',
                        'entity_type' => 'Client',
                        'entity_id'   => $lead->client_id,
                        'new_values'  => ['preview' => "Project \"{$project->name}\" ({$project->reference}) has been activated", 'project_id' => $project->id],
                    ]);
                }
            }
        }

        $project = $project->fresh(['client:id,name', 'projectManager:id,name,role_type', 'folders', 'createdBy:id,name']);
        $project->makeHidden('budget');

        return ApiResponse::success($project, 'Project created', 201);
    }

    // Next PRJ-{year}-{seq} reference — same generator pattern as
    // Api\User\LeadController's deal_reference / InvoiceController's
    // invoice_number.
    // withTrashed() on BOTH queries is essential, not defensive: Project is
    // soft-deleting, so a deleted project's row — and its reference — stays in
    // the table behind projects_reference_unique. Without it the uniqueness
    // probe reports "free" for a reference the index still holds, the loop exits
    // on the first candidate, and Project::create() dies on a duplicate key —
    // i.e. project creation broke permanently once any project was deleted.
    private function nextProjectReference(): string
    {
        $year = now()->year;
        $last = Project::withTrashed()
            ->whereYear('created_at', $year)
            ->where('reference', 'like', "PRJ-{$year}-%")
            ->latest('id')
            ->value('reference');

        $seq = $last ? ((int) substr($last, -4)) + 1 : 1;

        do {
            $reference = sprintf('PRJ-%d-%04d', $year, $seq++);
        } while (Project::withTrashed()->where('reference', $reference)->exists());

        return $reference;
    }

    // POST /user/projects/{id}/invoices/link — attach an EXISTING invoice
    // (deposit/milestone/final/change-request) to a project that already
    // exists, distinct from the store()-time paid-invoice handoff above.
    public function linkInvoice(Request $request, int $id): JsonResponse
    {
        if (!$this->can('canManageProjectInvoices')) {
            return ApiResponse::error('You do not have permission to link invoices to this project.', 403);
        }

        $user = $this->user();
        $project = $this->visibleProjects()->findOrFail($id);

        $validated = $request->validate([
            'invoice_id' => ['required', 'integer'],
        ]);

        $invoice = Invoice::where('company_id', $user->company_id)->find($validated['invoice_id']);
        if (!$invoice) {
            return ApiResponse::error('Invoice not found.', 404);
        }
        if ($invoice->project_id && $invoice->project_id !== $project->id) {
            return ApiResponse::error('This invoice is already linked to another project.', 422);
        }

        $invoice->update(['project_id' => $project->id]);
        $this->logActivity($project->company_id, 'invoice_linked', 'Project', $project->id,
            ['invoice_id' => $invoice->id, 'invoice_number' => $invoice->invoice_number]);

        return ApiResponse::success(null, 'Invoice linked to project');
    }

    // DELETE /user/projects/{id}/invoices/{invoiceId} — unlink.
    public function unlinkInvoice(int $id, int $invoiceId): JsonResponse
    {
        if (!$this->can('canManageProjectInvoices')) {
            return ApiResponse::error('You do not have permission to unlink invoices from this project.', 403);
        }

        $project = $this->visibleProjects()->findOrFail($id);
        $invoice = Invoice::where('company_id', $this->user()->company_id)
            ->where('project_id', $project->id)
            ->find($invoiceId);

        if (!$invoice) {
            return ApiResponse::error('Invoice not found on this project.', 404);
        }

        $invoice->update(['project_id' => null]);

        return ApiResponse::success(null, 'Invoice unlinked from project');
    }

    // POST /user/projects/{id}/invoices — create a brand-new invoice already
    // linked to this project ("Create Invoice for this Project"). Mirrors
    // Api\User\InvoiceController::store()'s validation/creation shape,
    // narrowed to what a project-billing invoice needs, plus project_id.
    public function createInvoice(Request $request, int $id): JsonResponse
    {
        if (!$this->can('canManageProjectInvoices')) {
            return ApiResponse::error('You do not have permission to create invoices for this project.', 403);
        }
        if (!$this->moduleActive('invoices')) {
            return ApiResponse::error('The Invoice module must be active to create project invoices.', 403);
        }

        $user = $this->user();
        $project = $this->visibleProjects()->findOrFail($id);

        $data = $request->validate([
            'due_date'            => 'nullable|date',
            'currency'            => 'nullable|string|max:10',
            'tax_rate'            => 'nullable|numeric|min:0|max:100',
            'discount_amount'     => 'nullable|numeric|min:0',
            'notes'               => 'nullable|string|max:2000',
            'items'               => 'required|array|min:1',
            'items.*.description' => 'required|string|max:500',
            'items.*.quantity'    => 'required|numeric|min:0.01',
            'items.*.unit_price'  => 'required|numeric|min:0',
        ]);

        $taxRate  = (float) ($data['tax_rate']        ?? 0);
        $discount = (float) ($data['discount_amount'] ?? 0);

        $subtotal = 0;
        $items    = $data['items'];
        foreach ($items as &$item) {
            $item['total'] = round((float) $item['quantity'] * (float) $item['unit_price'], 2);
            $subtotal += $item['total'];
        }
        unset($item);
        $taxAmt = round($subtotal * $taxRate / 100, 2);

        $year   = now()->year;
        $prefix = \App\Models\Company::find($project->company_id)?->invoicingProfile()['invoice_prefix'] ?? 'INV';
        $last   = Invoice::whereYear('created_at', $year)->where('invoice_number', 'like', "{$prefix}-{$year}-%")->latest('id')->value('invoice_number');
        $seq    = $last ? ((int) substr($last, -4)) + 1 : 1;
        do {
            $number = sprintf('%s-%d-%04d', $prefix, $year, $seq++);
        } while (Invoice::where('invoice_number', $number)->exists());

        $invoice = Invoice::create([
            'company_id'      => $project->company_id,
            'client_id'       => $project->client_id,
            'lead_id'         => $project->lead_id,
            'project_id'      => $project->id,
            'created_by'      => $user->id,
            'invoice_number'  => $number,
            'subtotal'        => $subtotal,
            'tax_rate'        => $taxRate,
            'tax_amount'      => $taxAmt,
            'discount_amount' => $discount,
            'total_amount'    => $subtotal + $taxAmt - $discount,
            'paid_amount'     => 0,
            'currency'        => $data['currency'] ?? 'PKR',
            'status'          => 'draft',
            'due_date'        => $data['due_date'] ?? null,
            'notes'           => $data['notes']    ?? null,
        ]);

        foreach ($items as $i => $item) {
            \App\Models\InvoiceItem::create([
                'invoice_id'  => $invoice->id,
                'description' => $item['description'],
                'quantity'    => $item['quantity'],
                'unit_price'  => $item['unit_price'],
                'total'       => $item['total'],
                'sort_order'  => $i,
            ]);
        }

        $this->logActivity($project->company_id, 'invoice_created', 'Project', $project->id,
            ['invoice_id' => $invoice->id, 'invoice_number' => $invoice->invoice_number]);

        return ApiResponse::success($invoice->load('items'), 'Invoice created for project', 201);
    }

    // Mirrors Api\Admin\ProjectController::createProjectFolders() — same
    // starter folder layout, just attributed to the creating staff member
    // instead of null (Company Admin isn't a `users` row so has no id here).
    private function createProjectFolders(Project $project, int $createdByUserId): void
    {
        $slug     = Str::slug($project->name) ?: 'project';
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
                    ['folder_path' => $folderPath, 'is_system' => true, 'created_by' => $createdByUserId]
                );
            }
        } catch (\Throwable $e) {
            foreach (array_reverse($createdDirs) as $dir) {
                Storage::deleteDirectory($dir);
            }
            throw $e;
        }
    }

    public function show(int $id): JsonResponse
    {
        if (!$this->can('canViewProjects') && !$this->can('canViewLinkedProjects') && !$this->can('canViewProjectDashboard')
            && !$this->can('canViewTeamResources') && !$this->can('canAssignTeamResources') && !$this->can('canViewAllCompanyProjects')) {
            return ApiResponse::error('Permission denied', 403);
        }

        // Task data is only ever surfaced to actors with real Task visibility
        // (canViewTasks) — a Seller (canViewLinkedProjects only) must never
        // see any task via this project payload, same as the Tasks tab being
        // fully hidden for them on the frontend.
        $canViewTasks = $this->can('canViewTasks');

        $project = $this->visibleProjects()
            ->with([
                'client:id,name,email',
                'projectManager:id,name,role_type',
                'seller:id,name,email',
                'createdBy:id,name',
                'createdByAdmin:id,name',
                'teamMembers.user:id,name,role_type',
                'folders' => fn($q) => $q->whereNull('parent_folder_id'),
            ])
            ->findOrFail($id);

        if ($canViewTasks) {
            $project->load(['tasks' => fn($q) => $q->with(['assignedTo:id,name', 'assignedBy:id,name', 'productionQueue'])]);
        } else {
            $project->setRelation('tasks', collect());
        }

        $totalTasks = $project->tasks->count();
        $doneTasks  = $project->tasks->where('status', 'completed')->count();
        $project->progress = $totalTasks > 0 ? round(($doneTasks / $totalTasks) * 100) : 0;

        // Budget is financial data — Company Admin only, never surfaced to staff.
        $project->makeHidden('budget');

        // Invoices billed under this project + a running billing summary —
        // gated behind canManageProjectInvoices (folds in "View Project
        // Invoices"/"View Project Billing Summary" per the consolidated
        // permission design). A Seller without it still sees the project
        // itself, just not this financial block.
        if ($this->can('canManageProjectInvoices')) {
            $project->load(['invoices' => fn($q) => $q->select(
                'id', 'invoice_number', 'total_amount', 'paid_amount', 'status', 'due_date', 'currency', 'project_id'
            )->orderByDesc('created_at')]);

            $totalInvoiced = (float) $project->invoices->sum('total_amount');
            $totalPaid     = (float) $project->invoices->sum('paid_amount');
            $project->billing_summary = [
                'total_invoiced' => $totalInvoiced,
                'total_paid'     => $totalPaid,
                'outstanding'    => max(0, round($totalInvoiced - $totalPaid, 2)),
            ];
        } else {
            $project->setRelation('invoices', collect());
        }

        return ApiResponse::success($project);
    }

    public function update(Request $request, int $id): JsonResponse
    {
        if (!$this->can('canEditProjects')) {
            return ApiResponse::error('Permission denied', 403);
        }

        $project = $this->visibleProjects()->findOrFail($id);

        // Closed is a terminal, read-only state — only reopen() can move a
        // project out of it.
        if ($project->status === 'closed') {
            return ApiResponse::error('This project is closed and read-only. Reopen it first to make changes.', 422);
        }

        $validated = $request->validate([
            'name'        => ['sometimes', 'string', 'max:255'],
            'description' => ['nullable', 'string'],
            // 'completed' and 'closed' are reached only via complete()/close()
            // below (readiness checks, activity log, notifications) — never as
            // a bare status write through this generic update endpoint.
            'status'      => ['sometimes', 'in:planning,active,on_hold,blocked,cancelled'],
            'priority'    => ['sometimes', 'in:low,medium,high,urgent'],
            'start_date'  => ['nullable', 'date'],
            'deadline'    => ['nullable', 'date'],
        ]);

        $project->update($validated);

        // Budget is financial data — Company Admin only, never surfaced to staff.
        $project->makeHidden('budget');

        return ApiResponse::success($project, 'Project updated');
    }

    // Picker list for assignee/team-member selection — active, same-company
    // users only. Includes email/role/Project-Management-access-status so
    // the PM can see upfront whether a candidate can actually use the module
    // after being added (team membership and permission grants are separate,
    // unlinked actions — this surfaces that instead of hiding it).
    private function sellerAssignmentService(): ProjectSellerAssignmentService
    {
        return app(ProjectSellerAssignmentService::class);
    }

    // GET /projects/sellers — active Sellers of this staff member's own
    // company, for the "Assign/Switch Seller" dropdown. Gated the same as
    // assignSeller() below — no point exposing the picker to someone who
    // can't act on it.
    public function sellers(): JsonResponse
    {
        if (!$this->can('canAssignProjectSeller')) {
            return ApiResponse::error('You do not have permission to assign seller to project.', 403);
        }

        $user = $this->user();
        $sellers = User::where('company_id', $user->company_id)
            ->where('is_active', true)
            ->where('status', 'active')
            ->where('role_type', 'seller')
            ->orderBy('name')
            ->get(['id', 'name', 'email']);

        return ApiResponse::success($sellers);
    }

    // PATCH /projects/{id}/seller — assign or switch this project's Seller.
    // Company Admin has an equivalent, unrestricted endpoint on the Admin
    // guard; here a PM (or anyone else) needs canAssignProjectSeller, which
    // is never granted by default (see RoleDefaultPermissions) — Company
    // Admin must explicitly grant it. A plain Seller can never hold this key
    // (see RoleDefaultPermissions::MAP's 'seller' bundle), so this also
    // structurally satisfies "Seller cannot switch project seller."
    public function assignSeller(Request $request, int $id): JsonResponse
    {
        if (!$this->can('canAssignProjectSeller')) {
            return ApiResponse::error('You do not have permission to assign seller to project.', 403);
        }

        $project = $this->visibleProjects()->findOrFail($id);

        if ($project->status === 'closed') {
            return ApiResponse::error('This project is closed and read-only. Reopen it first to make changes.', 422);
        }

        $validated = $request->validate([
            'seller_id' => ['required', 'integer'],
            'reason'    => ['nullable', 'string', 'max:1000'],
        ]);

        $user = $this->user();
        $seller = $this->sellerAssignmentService()->assignableSeller($user->company_id, (int) $validated['seller_id']);
        if (!$seller) {
            return ApiResponse::error('Selected seller does not belong to this company.', 422);
        }

        $result = $this->sellerAssignmentService()->assign(
            $project, $seller, $validated['reason'] ?? null, $user->id, null, $user->name
        );

        return ApiResponse::success(
            $project->fresh(['seller:id,name,email']),
            $result['is_switch'] ? 'Seller switched' : 'Seller assigned'
        );
    }

    public function companyUsers(): JsonResponse
    {
        if (!$this->anyCan(['canCreateTasks', 'canEditTasks', 'canAssignTeamResources', 'canViewTeamResources'])) {
            return ApiResponse::error('Permission denied', 403);
        }

        $user = $this->user();

        $users = User::where('company_id', $user->company_id)
            ->where('is_active', true)
            ->orderBy('name')
            ->get(['id', 'name', 'email', 'role_type']);

        $withAccess = UserCompanyPermission::where('company_id', $user->company_id)
            ->where('module_key', 'project_management')
            ->whereIn('user_id', $users->pluck('id'))
            ->distinct()
            ->pluck('user_id')
            ->all();

        $users = $users->map(function ($u) use ($withAccess) {
            $u->has_project_management_access = in_array($u->id, $withAccess);
            return $u;
        });

        return ApiResponse::success($users);
    }

    public function assignTeam(Request $request, int $id): JsonResponse
    {
        if (!$this->can('canAssignTeamResources')) {
            return ApiResponse::error('Permission denied', 403);
        }

        $project = $this->visibleProjects()->findOrFail($id);

        if ($project->status === 'closed') {
            return ApiResponse::error('This project is closed and read-only. Reopen it first to make changes.', 422);
        }

        // Team members must be real, existing users of this staff member's
        // own company — not just any user id in the system.
        $validated = $request->validate([
            'members'                    => ['required', 'array'],
            'members.*.user_id'          => ['required', 'integer', Rule::exists('users', 'id')->where('company_id', $this->user()->company_id)],
            'members.*.role_in_project'  => ['required', 'in:project_manager,production_user,team_member,reviewer'],
        ]);

        $actor = $this->user();

        foreach ($validated['members'] as $member) {
            ProjectTeamMember::updateOrCreate(
                ['project_id' => $project->id, 'user_id' => $member['user_id']],
                ['role_in_project' => $member['role_in_project'], 'assigned_by' => $actor->id]
            );

            // Skip self-notification — a PM re-saving/expanding the team
            // roster can legitimately include themselves in the payload.
            if ($member['user_id'] === $actor->id) {
                continue;
            }

            Notification::create([
                'user_id'    => $member['user_id'],
                'company_id' => $project->company_id,
                'type'       => 'project_team_assigned',
                'title'      => 'Added to project team',
                'body'       => "{$actor->name} added you to project \"{$project->name}\".",
                'data'       => ['project_id' => $project->id, 'link' => "/projects/{$project->id}"],
            ]);
        }

        $this->logActivity($project->company_id, 'team_assigned', 'Project', $project->id, $validated);

        return ApiResponse::success($project->teamMembers()->with('user:id,name,role_type')->get(), 'Team updated');
    }

    public function removeTeamMember(int $id, int $memberId): JsonResponse
    {
        if (!$this->can('canAssignTeamResources')) {
            return ApiResponse::error('Permission denied', 403);
        }

        $project = $this->visibleProjects()->findOrFail($id);

        if ($project->status === 'closed') {
            return ApiResponse::error('This project is closed and read-only. Reopen it first to make changes.', 422);
        }

        $removedUserId = $project->teamMembers()->where('id', $memberId)->value('user_id');
        $project->teamMembers()->where('id', $memberId)->delete();

        // Losing their team row can also mean losing their project chat
        // access — but only if they're not still tied to the project some
        // other way (e.g. still assigned to an open task).
        if ($removedUserId) {
            ProjectChatService::removeParticipantIfNoLongerEligible($project, $removedUserId);
        }

        return ApiResponse::success(null, 'Team member removed');
    }

    private function completionService(): ProjectCompletionService
    {
        return app(ProjectCompletionService::class);
    }

    // GET /projects/{id}/completion-status — backs the "Mark as Complete"
    // pre-flight checklist modal. Gated on the same permission as the action
    // itself (canCompleteProjects) rather than canViewProjects, since only
    // someone who could actually complete the project needs the checklist.
    public function completionStatus(int $id): JsonResponse
    {
        if (!$this->can('canCompleteProjects')) {
            return ApiResponse::error('Permission denied', 403);
        }

        $project = $this->visibleProjects()->findOrFail($id);
        $service = $this->completionService();
        $readiness = $service->checkReadiness($project);

        return ApiResponse::success([
            'status'             => $project->status,
            'ready'              => $readiness['ready'],
            'blockers'           => $readiness['blockers'],
            'has_unpaid_invoice' => $service->hasUnpaidInvoice($project),
        ]);
    }

    // Production User, Team Member, Seller, and Viewer never hold
    // canCompleteProjects (not part of any role's defaults — see
    // RoleDefaultPermissions) so they're excluded from this action simply by
    // never having the permission, without needing a role_type check here.
    // Activate a draft project — the name-only stub auto-created when a client's
    // invoice payment starts one (see App\Services\PaymentProjectStartService).
    // canActivateProjects is what both reveals drafts to this user (see
    // visibleProjects()) and permits this transition; it is granted to no role
    // by default, so Company Admin must hand it out deliberately.
    //
    // Folders are created here rather than at auto-creation time: a draft that
    // nobody activates shouldn't leave storage behind.
    public function activate(int $id): JsonResponse
    {
        if (!$this->can('canActivateProjects')) {
            return ApiResponse::error('Permission denied', 403);
        }

        $project = $this->visibleProjects()->findOrFail($id);
        $user = $this->user();

        if ($project->status !== 'draft') {
            return ApiResponse::error("Only a draft project can be activated — this one is {$project->status}.", 422);
        }

        $project->update(['status' => 'active']);

        if ($project->folders()->count() === 0) {
            $this->createProjectFolders($project, $user->id);
        }

        $project->logActivity('activated', "Draft project activated by {$user->name}.", $user->name);
        $this->logActivity($project->company_id, 'activated', 'Project', $project->id);

        $this->notifyLifecycle($project, 'project_activated', 'Project activated', "\"{$project->name}\" was activated by {$user->name}.");

        return ApiResponse::success($project->fresh(), 'Project activated');
    }

    public function complete(int $id): JsonResponse
    {
        if (!$this->can('canCompleteProjects')) {
            return ApiResponse::error('Permission denied', 403);
        }

        $project = $this->visibleProjects()->findOrFail($id);
        $user = $this->user();

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
            'status'       => 'completed',
            'completed_at' => now(),
            'completed_by' => $user->id,
        ]);

        $project->logActivity('completed', "Project marked as completed by {$user->name}.", $user->name);
        $this->logActivity($project->company_id, 'completed', 'Project', $project->id);

        $this->notifyLifecycle($project, 'project_completed', 'Project completed', "\"{$project->name}\" was marked as completed by {$user->name}.");

        return ApiResponse::success($project->fresh(), 'Project marked as completed');
    }

    public function close(Request $request, int $id): JsonResponse
    {
        if (!$this->can('canCloseProjects')) {
            return ApiResponse::error('Permission denied', 403);
        }

        $project = $this->visibleProjects()->findOrFail($id);
        $user = $this->user();

        $validated = $request->validate([
            'force'                  => ['nullable', 'boolean'],
            'reason'                 => ['nullable', 'string', 'max:1000'],
            'confirm_unpaid_invoice' => ['nullable', 'boolean'],
        ]);
        $force = (bool) ($validated['force'] ?? false);

        if ($force && !$this->can('canForceCloseProjects')) {
            return ApiResponse::error('Permission denied', 403);
        }

        // A never-activated draft isn't something to "close" — it's a stub.
        if ($project->status === 'draft') {
            return ApiResponse::error('Activate this draft project before closing it.', 422);
        }

        if ($project->status === 'closed') {
            return ApiResponse::error('Project is already closed.', 422);
        }

        if ($project->status !== 'completed' && !$force) {
            $project->logActivity('close_blocked', "Close attempted by {$user->name} but project is not yet Completed.", $user->name);
            return ApiResponse::error('Project must be Completed before it can be closed. Use Force Close to close anyway.', 422);
        }

        if ($force && empty($validated['reason'])) {
            return ApiResponse::error('A reason is required to force-close a project that is not yet Completed.', 422);
        }

        if ($this->completionService()->hasUnpaidInvoice($project) && empty($validated['confirm_unpaid_invoice'])) {
            return ApiResponse::error('This project has an unpaid invoice. Confirm to close anyway.', 422, ['warning' => 'unpaid_invoice']);
        }

        $project->update([
            'status'       => 'closed',
            'closed_at'    => now(),
            'closed_by'    => $user->id,
            'close_reason' => $validated['reason'] ?? null,
        ]);

        $project->logActivity(
            'closed',
            "Project closed by {$user->name}." . (!empty($validated['reason']) ? " Reason: {$validated['reason']}" : ''),
            $user->name
        );
        $this->logActivity($project->company_id, 'closed', 'Project', $project->id);

        $this->notifyLifecycle($project, 'project_closed', 'Project closed', "\"{$project->name}\" was closed by {$user->name}.");

        return ApiResponse::success($project->fresh(), 'Project closed');
    }

    public function reopen(Request $request, int $id): JsonResponse
    {
        if (!$this->can('canReopenProjects')) {
            return ApiResponse::error('Permission denied', 403);
        }

        $project = $this->visibleProjects()->findOrFail($id);
        $user = $this->user();

        $validated = $request->validate([
            'reason' => ['required', 'string', 'max:1000'],
        ]);

        if (!in_array($project->status, ['completed', 'closed'])) {
            return ApiResponse::error('Only a Completed or Closed project can be reopened.', 422);
        }

        $project->update([
            'status'                => 'active',
            'reopened_at'           => now(),
            'reopened_by'           => $user->id,
            'reopen_reason'         => $validated['reason'],
            'completed_at'          => null,
            'completed_by'          => null,
            'completed_by_admin_id' => null,
            'closed_at'             => null,
            'closed_by'             => null,
            'closed_by_admin_id'    => null,
            'close_reason'          => null,
        ]);

        $project->logActivity('reopened', "Project reopened by {$user->name}. Reason: {$validated['reason']}", $user->name);
        $this->logActivity($project->company_id, 'reopened', 'Project', $project->id);

        $this->notifyLifecycle($project, 'project_reopened', 'Project reopened', "\"{$project->name}\" was reopened by {$user->name}. Reason: {$validated['reason']}");

        return ApiResponse::success($project->fresh(), 'Project reopened');
    }

    // Mirrors Api\Admin\ProjectController::activity() exactly (SystemAuditLog
    // + ProjectComment merged into one chronological feed), scoped through
    // visibleProjects() instead of companyIds() so a PM/staff member gets the
    // same unified timeline Company Admin already has.
    public function activity(int $id): JsonResponse
    {
        $project = $this->visibleProjects()->findOrFail($id);
        $taskIds = Task::where('project_id', $project->id)->pluck('id');

        $logs = SystemAuditLog::where(function ($q) use ($id, $taskIds) {
                $q->where(['entity_type' => 'Project', 'entity_id' => $id])
                  ->orWhere(function ($q2) use ($taskIds) {
                      $q2->where('entity_type', 'Task')->whereIn('entity_id', $taskIds);
                  });
            })
            ->where('action', 'not like', '%_comment_added')
            ->get()
            ->map(fn ($log) => [
                'type'        => 'log',
                'action'      => $log->action,
                'entity_type' => $log->entity_type,
                'created_at'  => $log->created_at,
            ]);

        $comments = ProjectComment::where('project_id', $id)
            ->with(['authorAdmin:id,name', 'authorUser:id,name'])
            ->get()
            ->map(fn ($c) => [
                'type'       => 'comment',
                'body'       => $c->body,
                'task_id'    => $c->task_id,
                'author'     => $c->authorAdmin?->name ?? $c->authorUser?->name ?? 'Unknown',
                'created_at' => $c->created_at,
            ]);

        $activity = $logs->concat($comments)->sortByDesc('created_at')->values();

        return ApiResponse::success($activity);
    }

    // Notifies PM/team/production/seller via the existing per-user
    // Notification channel, plus a visibility='client' system comment if
    // Client Portal is active — the only client-facing channel this codebase
    // has. Excludes the acting user themselves from the fan-out.
    private function notifyLifecycle(Project $project, string $type, string $title, string $body): void
    {
        $service = $this->completionService();
        $actingUserId = $this->user()->id;

        foreach ($service->notificationTargetUserIds($project) as $userId) {
            if ($userId === $actingUserId) continue;

            Notification::create([
                'user_id' => $userId, 'company_id' => $project->company_id,
                'type' => $type, 'title' => $title, 'body' => $body,
                'data' => ['project_id' => $project->id, 'link' => "/projects/{$project->id}"],
            ]);
        }

        if ($service->clientPortalActive($project)) {
            ProjectComment::create([
                'company_id'     => $project->company_id,
                'project_id'     => $project->id,
                'author_user_id' => $actingUserId,
                'body'           => $body,
                'visibility'     => 'client',
            ]);
        }
    }
}
