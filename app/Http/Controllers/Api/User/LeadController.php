<?php

namespace App\Http\Controllers\Api\User;

use App\Helpers\ApiResponse;
use App\Http\Controllers\Controller;
use App\Models\Client;
use App\Models\Lead;
use App\Models\LeadTransfer;
use App\Models\Notification;
use App\Models\SystemAuditLog;
use App\Models\User;
use App\Models\UserCompanyPermission;
use App\Support\PermissionDebug;
use Illuminate\Database\QueryException;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class LeadController extends Controller
{
    private function user()       { return auth('sanctum')->user(); }
    private function userName(): string { return $this->user()->name ?? 'User'; }

    private function can(string $permKey): bool
    {
        $user = $this->user();
        $result = UserCompanyPermission::where('user_id', $user->id)
            ->where('company_id', $user->company_id)
            ->where('module_key', 'sales')
            ->where('permission_key', $permKey)
            ->exists();
        PermissionDebug::log($user->id, $user->company_id, $user->role_type, 'sales', $permKey, $result);
        return $result;
    }

    // canCreateClients is granted identically whether the company purchased
    // the Client module or the Sales module ("basic client access included
    // with Sales") — mirrors Api\User\ClientController::can()'s dual-bucket
    // check so a Sales-only grant (the default for Seller) still works here.
    private function canCreateClient(): bool
    {
        $user = $this->user();
        return UserCompanyPermission::where('user_id', $user->id)
            ->where('company_id', $user->company_id)
            ->whereIn('module_key', ['client', 'sales'])
            ->where('permission_key', 'canCreateClients')
            ->exists();
    }

    // Leads this Seller can see: every company lead if canViewAllCompanyLeads
    // is granted, otherwise only leads assigned to them. Mirrors
    // Api\User\ProjectController::visibleProjects()'s pattern. A Lead
    // Manager's default permission set includes canViewAllCompanyLeads, so
    // they get full company-wide visibility through this same mechanism —
    // no role-specific branch needed.
    private function visibleLeads()
    {
        $user = $this->user();
        $base = Lead::where('company_id', $user->company_id);

        if ($this->can('canViewAllCompanyLeads')) {
            return $base;
        }

        return $base->where('assigned_to', $user->id);
    }

    // The one target a lead can ever be assigned/transferred TO via
    // transfer()/companyUsers() below: an ACTIVE Seller of the SAME company
    // — never cross-company, never a Developer/PM/Production/HR/Finance
    // user, even if a Lead Manager holds canTransferLeads/canAssignLeadOwner
    // themselves. Company Admin's own LeadController is intentionally left
    // unrestricted ("Company Admin can still assign leads as before") —
    // this check only ever applies to this User guard.
    private function assignableSeller(int $userId, int $companyId): ?User
    {
        return User::where('id', $userId)
            ->where('company_id', $companyId)
            ->where('is_active', true)
            ->where('role_type', 'seller')
            ->first();
    }

    // Writes a company-wide audit-log entry (surfaces in Company Admin's
    // notification bell via Api\Admin\NotificationController, which reads
    // SystemAuditLog unfiltered by action — Admin isn't a `users` row so has
    // no Notification rows of its own).
    private function auditLog(Lead $lead, string $action, string $preview): void
    {
        SystemAuditLog::create([
            'company_id'  => $lead->company_id,
            'user_id'     => $this->user()->id,
            'action'      => $action,
            'module_key'  => 'sales',
            'entity_type' => 'Lead',
            'entity_id'   => $lead->id,
            'new_values'  => ['preview' => $preview, 'author' => $this->userName(), 'lead' => $lead->name],
        ]);
    }

    // Notifies a staff user (in-app) unless they're the one who made the
    // change themselves.
    private function notifyUser(?int $userId, Lead $lead, string $type, string $title, string $body): void
    {
        if (!$userId || $userId === $this->user()->id) return;

        Notification::create([
            'user_id'    => $userId,
            'company_id' => $lead->company_id,
            'type'       => $type,
            'title'      => $title,
            'body'       => $body,
            'data'       => ['lead_id' => $lead->id, 'link' => "/leads/{$lead->id}"],
        ]);
    }

    public function index(Request $request): JsonResponse
    {
        if (!$this->can('canViewLeads')) {
            return ApiResponse::error('Permission denied', 403);
        }

        $q = $this->visibleLeads()
            ->with(['assignedTo:id,name'])
            ->orderByDesc('created_at');

        if ($request->filled('status'))   $q->where('status',   $request->status);
        if ($request->filled('priority')) $q->where('priority', $request->priority);
        if ($request->filled('search')) {
            $s = '%' . $request->search . '%';
            $q->where(fn($x) => $x->where('name', 'like', $s)
                ->orWhere('email', 'like', $s)
                ->orWhere('company_name', 'like', $s)
                ->orWhere('phone', 'like', $s));
        }

        return ApiResponse::success(['leads' => $q->get()->map(fn($l) => $this->format($l))]);
    }

    public function show(int $id): JsonResponse
    {
        if (!$this->can('canViewLeads')) {
            return ApiResponse::error('Permission denied', 403);
        }

        // client:id,lead_id,name — lead_id (the hasOne FK) must be in the
        // restricted column list, or Eloquent can't match the loaded Client
        // row back to this Lead and $lead->client silently resolves to
        // null even when a real Client row exists (format()'s 'client_id'
        // then always came back null for an already-converted lead).
        $lead = $this->visibleLeads()
            ->with(['assignedTo:id,name', 'client:id,lead_id,name', 'followUps.assignedTo:id,name', 'activities'])
            ->findOrFail($id);

        $data               = $this->format($lead);
        $data['follow_ups'] = $lead->followUps->map(fn($f) => $this->formatFollowUp($f))->values();
        $data['activities'] = $lead->activities->map(fn($a) => [
            'id'          => $a->id,
            'type'        => $a->type,
            'description' => $a->description,
            'causer_name' => $a->causer_name,
            'meta'        => $a->meta,
            'created_at'  => $a->created_at->toDateTimeString(),
        ])->values();

        return ApiResponse::success($data);
    }

    public function store(Request $request): JsonResponse
    {
        if (!$this->can('canCreateLeads')) {
            return ApiResponse::error('Permission denied', 403);
        }

        $user = $this->user();

        $validated = $request->validate([
            'name'               => ['required', 'string', 'max:150'],
            'email'              => ['nullable', 'email', 'max:255'],
            'phone'              => ['nullable', 'string', 'max:30'],
            'company_name'       => ['nullable', 'string', 'max:200'],
            'source'             => ['nullable', 'in:website,referral,cold_call,social,event,other'],
            'status'             => ['nullable', 'in:new,contacted,qualified,proposal,negotiation,won,lost'],
            'priority'           => ['nullable', 'in:low,medium,high,urgent'],
            'estimated_value'    => ['nullable', 'numeric', 'min:0'],
            'notes'              => ['nullable', 'string'],
            'next_followup_date' => ['nullable', 'date'],
            'next_followup_time' => ['nullable', 'date_format:H:i'],
            // Company-scoped (not a bare exists:users,id) — assigned_to is
            // otherwise a second, unguarded path to the exact cross-company
            // assignment transfer()/companyUsers() above are specifically
            // hardened against.
            'assigned_to'        => ['nullable', 'integer', Rule::exists('users', 'id')->where('company_id', $user->company_id)->where('is_active', true)],
        ]);

        // Same company-scoped duplicate guard as Api\User\ClientController::
        // store() — a Lead with this email already exists for this company.
        if (!empty($validated['email']) && Lead::where('company_id', $user->company_id)->where('email', $validated['email'])->exists()) {
            return ApiResponse::error('A lead with this email already exists.', 422);
        }

        $validated['company_id'] = $user->company_id;
        $validated['assigned_to'] ??= $user->id;
        $validated['status']   ??= 'new';
        $validated['priority'] ??= 'medium';

        $lead = Lead::create($validated);
        $lead->logActivity('created', "Lead \"{$lead->name}\" created", $this->userName());
        $this->auditLog($lead, 'lead_created', "Lead \"{$lead->name}\" created");

        if ($lead->assigned_to) {
            $this->notifyUser($lead->assigned_to, $lead, 'lead_assigned', 'New lead assigned',
                "You were assigned lead \"{$lead->name}\".");
        }

        $lead->load(['assignedTo:id,name']);

        return ApiResponse::success($this->format($lead), 'Lead created', 201);
    }

    public function update(Request $request, int $id): JsonResponse
    {
        if (!$this->can('canEditLeads')) {
            return ApiResponse::error('Permission denied', 403);
        }

        $user = $this->user();
        $lead = $this->visibleLeads()->findOrFail($id);
        $old  = $lead->only(['status', 'priority', 'assigned_to', 'notes']);

        $validated = $request->validate([
            'name'               => ['sometimes', 'string', 'max:150'],
            'email'              => ['nullable', 'email', 'max:255'],
            'phone'              => ['nullable', 'string', 'max:30'],
            'company_name'       => ['nullable', 'string', 'max:200'],
            'source'             => ['nullable', 'in:website,referral,cold_call,social,event,other'],
            'status'             => ['nullable', 'in:new,contacted,qualified,proposal,negotiation,won,lost'],
            'priority'           => ['nullable', 'in:low,medium,high,urgent'],
            'estimated_value'    => ['nullable', 'numeric', 'min:0'],
            'notes'              => ['nullable', 'string'],
            'next_followup_date' => ['nullable', 'date'],
            'next_followup_time' => ['nullable', 'date_format:H:i'],
            'lost_reason'        => ['nullable', 'string'],
            // Company-scoped (not a bare exists:users,id) — assigned_to is
            // otherwise a second, unguarded path to the exact cross-company
            // assignment transfer()/companyUsers() above are specifically
            // hardened against.
            'assigned_to'        => ['nullable', 'integer', Rule::exists('users', 'id')->where('company_id', $user->company_id)->where('is_active', true)],
        ]);

        // Same company-scoped duplicate guard as store() — editing a lead's
        // email must not collide with a different lead's.
        if (!empty($validated['email']) && $validated['email'] !== $lead->email
            && Lead::where('company_id', $lead->company_id)->where('email', $validated['email'])->where('id', '!=', $lead->id)->exists()) {
            return ApiResponse::error('A lead with this email already exists.', 422);
        }

        // Same one-way Won lock as updateStatus() — the plain Edit form must
        // not be a backdoor around it.
        $earlierStages = ['new', 'contacted', 'qualified', 'proposal', 'negotiation'];
        if ($old['status'] === 'won' && isset($validated['status']) && in_array($validated['status'], $earlierStages, true)) {
            return ApiResponse::error('This lead has already been won and cannot be moved back to an earlier stage.', 422);
        }

        $lead->update($validated);

        $name = $this->userName();
        if (isset($validated['status']) && $validated['status'] !== $old['status']) {
            $lead->logActivity('status_changed', "Status changed from {$old['status']} to {$validated['status']}", $name,
                ['from' => $old['status'], 'to' => $validated['status']]);
            $this->auditLog($lead, 'lead_status_changed', "Status changed from {$old['status']} to {$validated['status']}");
            $this->notifyUser($lead->assigned_to, $lead, 'lead_status_changed', 'Lead status changed',
                "Lead \"{$lead->name}\" status changed to \"{$validated['status']}\".");
        }
        if (isset($validated['assigned_to']) && $validated['assigned_to'] !== $old['assigned_to']) {
            $assignee = $validated['assigned_to'] ? User::find($validated['assigned_to'])?->name : 'unassigned';
            $lead->logActivity('assigned', "Lead assigned to {$assignee}", $name, ['to' => $assignee]);
            $this->auditLog($lead, 'lead_assigned', "Lead \"{$lead->name}\" assigned to {$assignee}");
            $this->notifyUser($validated['assigned_to'], $lead, 'lead_assigned', 'New lead assigned',
                "You were assigned lead \"{$lead->name}\".");
        }
        if (isset($validated['notes']) && $validated['notes'] !== $old['notes'] && $validated['notes']) {
            $lead->logActivity('note_added', 'Notes updated', $name);
        }

        $lead->load(['assignedTo:id,name']);
        return ApiResponse::success($this->format($lead));
    }

    // Next DEAL-{year}-{seq} reference — mirrors Api\User\InvoiceController's
    // nextNumber() pattern exactly, just for the deal_reference namespace.
    private function nextDealReference(): string
    {
        $year = now()->year;
        $maxSeq = Lead::withTrashed()
            ->where('deal_reference', 'like', "DEAL-{$year}-%")
            ->pluck('deal_reference')
            ->map(fn ($reference) => (int) substr($reference, -4))
            ->max();

        $seq = $maxSeq ? $maxSeq + 1 : 1;

        do {
            $reference = sprintf('DEAL-%d-%04d', $year, $seq++);
        } while (Lead::withTrashed()->where('deal_reference', $reference)->exists());

        return $reference;
    }

    public function updateStatus(Request $request, int $id): JsonResponse
    {
        if (!$this->can('canManagePipeline')) {
            return ApiResponse::error('Permission denied', 403);
        }

        $lead = $this->visibleLeads()->findOrFail($id);
        $old  = $lead->status;

        $becomingWon = $request->input('status') === 'won' && $old !== 'won';

        // Once Won, a deal can never be walked back to an earlier pipeline
        // stage — mirrors the existing one-way Lost lock (which requires the
        // explicit "Reopen" action to leave, never a plain status edit).
        // Marking a Won deal Lost afterward (it fell through) is still
        // allowed; re-saving status=won on an already-won lead is a no-op,
        // not a revert.
        $earlierStages = ['new', 'contacted', 'qualified', 'proposal', 'negotiation'];
        if ($old === 'won' && in_array($request->input('status'), $earlierStages, true)) {
            return ApiResponse::error('This lead has already been won and cannot be moved back to an earlier stage.', 422);
        }

        $rules = [
            'status'      => ['required', 'in:new,contacted,qualified,proposal,negotiation,won,lost'],
            'lost_reason' => ['nullable', 'string'],
        ];
        // The first time a Lead is marked Won, it becomes a Deal.
        // proposed_project_title is no longer required up front — the
        // frontend's confirmation modal was removed (flow is now Won ->
        // Convert to Client -> Create Invoice, no popup) — it defaults to
        // "{name} — Project" below when not supplied.
        if ($becomingWon) {
            $rules['proposed_project_title']    = ['nullable', 'string', 'max:255'];
            $rules['service_category']          = ['nullable', 'string', 'max:100'];
            $rules['scope_summary']             = ['nullable', 'string'];
            $rules['detailed_scope']             = ['nullable', 'string'];
            $rules['quotation_reference']       = ['nullable', 'string', 'max:100'];
            $rules['required_kickoff_amount']   = ['nullable', 'numeric', 'min:0'];
            $rules['required_kickoff_percentage'] = ['nullable', 'numeric', 'min:0', 'max:100'];
            $rules['expected_start_date']       = ['nullable', 'date'];
            $rules['expected_end_date']         = ['nullable', 'date'];
        }
        $request->validate($rules);

        $data = ['status' => $request->status];
        if ($request->status === 'won' && !$lead->converted_at) {
            $data['converted_at'] = now();
        }
        if ($request->status === 'lost' && $request->filled('lost_reason')) {
            $data['lost_reason'] = $request->lost_reason;
        }

        if ($becomingWon) {
            $data['won_at']             = now();
            $data['fulfillment_status'] = 'awaiting_invoice';
            // No confirmation modal on the frontend anymore — default the
            // title instead of requiring it up front.
            $data['proposed_project_title'] = $request->filled('proposed_project_title')
                ? $request->input('proposed_project_title')
                : "{$lead->name} — Project";
            foreach ([
                'service_category', 'scope_summary', 'detailed_scope',
                'quotation_reference', 'required_kickoff_amount', 'required_kickoff_percentage',
                'expected_start_date', 'expected_end_date',
            ] as $field) {
                if ($request->filled($field)) {
                    $data[$field] = $request->input($field);
                }
            }

            // nextDealReference()'s read-last-then-pick-next-free check isn't
            // atomic — two concurrent "mark as won" requests can both land on
            // the same number and one loses to the unique constraint. Retry
            // with a freshly recomputed reference a few times rather than
            // losing this whole update (and every deal field submitted
            // alongside it) to an unhandled 1062.
            $attempts = 0;
            while (true) {
                $data['deal_reference'] = $this->nextDealReference();
                try {
                    $lead->update($data);
                    break;
                } catch (QueryException $e) {
                    $isDealRefCollision = (int) $e->getCode() === 23000
                        && str_contains($e->getMessage(), 'leads_deal_reference_unique');
                    if (!$isDealRefCollision || ++$attempts >= 5) {
                        throw $e;
                    }
                }
            }
        } else {
            $lead->update($data);
        }

        if ($becomingWon) {
            $lead->logActivity('deal_created', "Deal {$lead->deal_reference} created — {$lead->proposed_project_title}",
                $this->userName(), ['deal_reference' => $lead->deal_reference]);
        }

        $type = match($request->status) {
            'won'  => 'won',
            'lost' => 'lost',
            default => 'status_changed',
        };
        $lead->logActivity($type, "Status changed from {$old} to {$request->status}", $this->userName(),
            ['from' => $old, 'to' => $request->status]);

        $auditAction = match ($request->status) {
            'won'   => 'lead_won',
            'lost'  => 'lead_lost',
            default => 'lead_status_changed',
        };
        $this->auditLog($lead, $auditAction, "Lead \"{$lead->name}\" status changed from {$old} to {$request->status}");
        $this->notifyUser($lead->assigned_to, $lead, $auditAction,
            $request->status === 'won' ? 'Lead won!' : ($request->status === 'lost' ? 'Lead lost' : 'Lead status changed'),
            "Lead \"{$lead->name}\" status changed to \"{$request->status}\".");

        $lead->load(['assignedTo:id,name']);
        return ApiResponse::success($this->format($lead));
    }

    // POST /user/leads/{id}/convert — mirrors Api\Admin\LeadController::convert().
    // Was previously admin-only (no User-guard route existed at all), leaving
    // Sellers with no way to turn a won lead into a Client despite already
    // holding canCreateClients by default.
    public function convert(int $id): JsonResponse
    {
        if (!$this->can('canManagePipeline') || !$this->canCreateClient()) {
            return ApiResponse::error('You do not have permission to convert this lead.', 403);
        }

        $lead = $this->visibleLeads()->findOrFail($id);

        if ($lead->client()->exists()) {
            return ApiResponse::error('Lead already converted to a client', 422);
        }

        // Same company-scoped duplicate guard as Api\User\ClientController::
        // store()/update() — converting a lead must not silently create a
        // second Client row for an email that already exists in this company.
        if (!empty($lead->email) && Client::where('company_id', $lead->company_id)->where('email', $lead->email)->exists()) {
            return ApiResponse::error('Client with this email already exists.', 422);
        }

        $client = Client::create([
            'company_id'      => $lead->company_id,
            'name'            => $lead->name,
            'email'           => $lead->email,
            'phone'           => $lead->phone,
            'company_name'    => $lead->company_name,
            'notes'           => $lead->notes,
            'status'          => 'active',
            'lead_id'         => $lead->id,
            // The converting Seller becomes this client's account manager —
            // without this, Api\User\ClientController::visibleClients()'s
            // ownership scope would still cover them via the lead_id link,
            // but this makes the ownership explicit and survives the lead
            // later being reassigned away from them.
            'account_manager' => $this->user()->id,
        ]);

        $lead->update(['status' => 'won', 'converted_at' => now()]);
        $lead->logActivity('converted', "Lead converted to client \"{$client->name}\"", $this->userName(),
            ['client_id' => $client->id]);
        $this->auditLog($lead, 'lead_converted', "Lead \"{$lead->name}\" converted to client \"{$client->name}\"");

        return ApiResponse::success(['client_id' => $client->id], 'Lead converted to client', 201);
    }

    // POST /user/leads/{id}/transfer — reassigns lead ownership, keeping a
    // full audit trail (old owner, new owner, reason, who did it, when) in
    // lead_transfers, distinct from the single-row assigned_to update that
    // update() already does.
    public function transfer(Request $request, int $id): JsonResponse
    {
        $user = $this->user();
        $lead = $this->visibleLeads()->findOrFail($id);
        $fromUserId = $lead->assigned_to;

        if ($lead->status === 'won') {
            return ApiResponse::error('Won leads cannot be transferred.', 422);
        }

        // "Assign Lead Owner" only covers giving an UNOWNED lead its first
        // owner; moving a lead that already has an owner to someone else is
        // specifically "Transfer Leads" — holding only the former must never
        // let a user reassign a lead away from its current owner (previously
        // both permissions were treated as interchangeable here, so
        // unchecking "Transfer Leads" alone didn't actually revoke this).
        $authorized = $fromUserId === null
            ? ($this->can('canAssignLeadOwner') || $this->can('canTransferLeads'))
            : $this->can('canTransferLeads');

        if (!$authorized) {
            return ApiResponse::error('You do not have permission to assign leads.', 403);
        }

        $validated = $request->validate([
            'to_user_id' => ['required', 'integer'],
            'reason'     => ['nullable', 'string', 'max:1000'],
        ]);

        $toUserId = (int) $validated['to_user_id'];

        if (!$this->assignableSeller($toUserId, $user->company_id)) {
            return ApiResponse::error('Selected seller does not belong to this company.', 422);
        }

        if ($fromUserId === $toUserId) {
            return ApiResponse::error('Lead is already assigned to this user.', 422);
        }

        LeadTransfer::create([
            'lead_id'                => $lead->id,
            'company_id'             => $lead->company_id,
            'from_user_id'           => $fromUserId,
            'to_user_id'             => $toUserId,
            'transferred_by_user_id' => $user->id,
            'reason'                 => $validated['reason'] ?? null,
        ]);

        $lead->update(['assigned_to' => $toUserId, 'transferred_to' => $toUserId, 'transferred_at' => now()]);

        $toName = User::find($toUserId)?->name ?? 'Unknown';
        $fromName = $fromUserId ? (User::find($fromUserId)?->name ?? 'Unknown') : null;
        // causer_name (passed separately below) already carries the actor's
        // name for the activity feed's own "{causer}: {description}"
        // rendering — matching every other logActivity() call in this file,
        // so it's deliberately not re-embedded into the description text.
        $description = $fromName
            ? "transferred from {$fromName} to {$toName}" . (!empty($validated['reason']) ? ". Reason: {$validated['reason']}" : '')
            : "assigned to {$toName}";
        $lead->logActivity('transferred', "Lead {$description}",
            $this->userName(), ['from' => $fromUserId, 'to' => $toUserId, 'reason' => $validated['reason'] ?? null]);
        $this->auditLog($lead, 'lead_transferred', "Lead \"{$lead->name}\" {$description}");
        $this->notifyUser($toUserId, $lead, 'lead_transferred', 'New lead assigned',
            "{$this->userName()} assigned lead \"{$lead->name}\" to you.");
        // The seller it was taken FROM also hears about it — silent
        // reassignment away from someone was the one gap here before.
        if ($fromUserId) {
            $this->notifyUser($fromUserId, $lead, 'lead_transferred_away', 'Lead reassigned',
                "{$this->userName()} transferred lead \"{$lead->name}\" from you to {$toName}" . (!empty($validated['reason']) ? " — {$validated['reason']}" : '') . '.');
        }

        $lead->load(['assignedTo:id,name']);
        return ApiResponse::success($this->format($lead), 'Lead transferred');
    }

    // GET /user/leads/{id}/project-eligibility — Deal financial summary +
    // whether it currently clears the kickoff-payment bar for project
    // creation. Single source of truth: App\Services\DealEligibilityService.
    public function projectEligibility(int $id): JsonResponse
    {
        if (!$this->can('canViewLeads')) {
            return ApiResponse::error('Permission denied', 403);
        }

        $lead = $this->visibleLeads()->findOrFail($id);

        return ApiResponse::success(\App\Services\DealEligibilityService::summary($lead));
    }

    // GET /user/leads/company-users — picker list for the Transfer Lead
    // modal. Only active Sellers of this same company — never a Developer/
    // PM/Production/HR/Finance user, and never another company's — matching
    // assignableSeller()'s rule exactly so this picker can never offer a
    // choice transfer() would then reject.
    public function companyUsers(): JsonResponse
    {
        if (!$this->can('canTransferLeads') && !$this->can('canAssignLeadOwner')) {
            return ApiResponse::error('You do not have permission to assign leads.', 403);
        }

        $user = $this->user();
        $users = User::where('company_id', $user->company_id)
            ->where('is_active', true)
            ->where('role_type', 'seller')
            ->orderBy('name')
            ->get(['id', 'name', 'email']);

        return ApiResponse::success($users);
    }

    public function pipeline(Request $request): JsonResponse
    {
        if (!$this->can('canViewLeads')) {
            return ApiResponse::error('Permission denied', 403);
        }

        $leads = $this->visibleLeads()
            ->whereNotIn('status', ['won', 'lost'])
            ->with(['assignedTo:id,name'])
            ->orderByRaw("FIELD(status,'new','contacted','qualified','proposal','negotiation')")
            ->orderByDesc('created_at')
            ->get()
            ->map(fn($l) => $this->format($l));

        return ApiResponse::success(['leads' => $leads]);
    }

    private function format(Lead $lead): array
    {
        return [
            'id'                 => $lead->id,
            'company_id'         => $lead->company_id,
            'name'               => $lead->name,
            'email'              => $lead->email,
            'phone'              => $lead->phone,
            'company_name'       => $lead->company_name,
            'source'             => $lead->source,
            'status'             => $lead->status,
            'priority'           => $lead->priority,
            'estimated_value'    => (float) $lead->estimated_value,
            'notes'              => $lead->notes,
            'next_followup_date' => $lead->next_followup_date?->toDateString(),
            'next_followup_time' => $lead->next_followup_time ? substr($lead->next_followup_time, 0, 5) : null,
            'lost_reason'        => $lead->lost_reason,
            'assigned_to'        => $lead->assigned_to,
            'assigned_user'      => $lead->assignedTo ? ['id' => $lead->assignedTo->id, 'name' => $lead->assignedTo->name] : null,
            'converted_at'       => $lead->converted_at?->toDateTimeString(),
            'client_id'          => $lead->client?->id ?? null,
            'created_at'         => $lead->created_at->toDateTimeString(),
            'updated_at'         => $lead->updated_at->toDateTimeString(),
            // Deal fields
            'deal_reference'             => $lead->deal_reference,
            'proposed_project_title'     => $lead->proposed_project_title,
            'service_category'           => $lead->service_category,
            'scope_summary'               => $lead->scope_summary,
            'detailed_scope'              => $lead->detailed_scope,
            'quotation_reference'         => $lead->quotation_reference,
            'required_kickoff_amount'     => $lead->required_kickoff_amount !== null ? (float) $lead->required_kickoff_amount : null,
            'required_kickoff_percentage' => $lead->required_kickoff_percentage !== null ? (float) $lead->required_kickoff_percentage : null,
            'expected_start_date'         => $lead->expected_start_date?->toDateString(),
            'expected_end_date'           => $lead->expected_end_date?->toDateString(),
            'fulfillment_status'          => $lead->fulfillment_status,
            'won_at'                      => $lead->won_at?->toDateTimeString(),
        ];
    }

    private function formatFollowUp($f): array
    {
        return [
            'id'               => $f->id,
            'type'             => $f->type,
            'scheduled_at'     => $f->scheduled_at->toDateTimeString(),
            'completed_at'     => $f->completed_at?->toDateTimeString(),
            'notes'            => $f->notes,
            'status'           => $f->status,
            'reminder_enabled' => $f->reminder_enabled,
            'assigned_to'      => $f->assigned_to,
            'assigned_user'    => $f->assignedTo ? ['id' => $f->assignedTo->id, 'name' => $f->assignedTo->name] : null,
            'created_at'       => $f->created_at->toDateTimeString(),
        ];
    }
}
