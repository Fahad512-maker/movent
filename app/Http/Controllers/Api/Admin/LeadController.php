<?php

namespace App\Http\Controllers\Api\Admin;

use App\Helpers\ApiResponse;
use App\Http\Controllers\Controller;
use App\Models\Client;
use App\Models\Lead;
use App\Models\LeadTransfer;
use App\Models\Notification;
use App\Models\Project;
use App\Models\User;
use Illuminate\Database\QueryException;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class LeadController extends Controller
{
    private function admin()   { return auth('admin')->user(); }
    private function adminName(): string { return $this->admin()->name ?? 'Admin'; }

    private function companyIds(): array
    {
        return $this->admin()->companies()->pluck('id')->toArray();
    }

    // Notifies the assigned staff Seller (in-app) — Company Admin already
    // knows about actions it takes itself, so unlike the User-guard
    // controller this never needs to notify Admin back.
    private function notifyUser(?int $userId, Lead $lead, string $type, string $title, string $body): void
    {
        if (!$userId) return;

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
        $companyIds = $this->companyIds();

        $q = Lead::whereIn('company_id', $companyIds)
            ->with(['assignedTo:id,name'])
            ->orderByDesc('created_at');

        if ($request->filled('company_id'))  $q->where('company_id',  $request->company_id);
        if ($request->filled('status'))      $q->where('status',      $request->status);
        if ($request->filled('priority'))    $q->where('priority',    $request->priority);
        if ($request->filled('source'))      $q->where('source',      $request->source);
        if ($request->filled('assigned_to')) $q->where('assigned_to', $request->assigned_to);
        if ($request->filled('search')) {
            $s = '%' . $request->search . '%';
            $q->where(fn($x) => $x->where('name', 'like', $s)
                ->orWhere('email', 'like', $s)
                ->orWhere('company_name', 'like', $s)
                ->orWhere('phone', 'like', $s));
        }

        return ApiResponse::success(['leads' => $q->get()->map(fn($l) => $this->format($l))]);
    }

    public function store(Request $request): JsonResponse
    {
        $companyIds = $this->companyIds();

        $validated = $request->validate([
            'company_id'         => ['required', 'integer', 'in:' . implode(',', $companyIds)],
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
            'assigned_to'        => ['nullable', 'integer', 'exists:users,id'],
        ]);

        // Same company-scoped duplicate guard as Api\Admin\ClientController::
        // store() — a Lead with this email already exists for this company.
        if (!empty($validated['email']) && Lead::where('company_id', $validated['company_id'])->where('email', $validated['email'])->exists()) {
            return ApiResponse::error('A lead with this email already exists.', 422);
        }

        $validated['status']   ??= 'new';
        $validated['priority'] ??= 'medium';

        $lead = Lead::create($validated);
        $lead->logActivity('created', "Lead \"{$lead->name}\" created", $this->adminName());

        if ($lead->assigned_to) {
            $this->notifyUser($lead->assigned_to, $lead, 'lead_assigned', 'New lead assigned',
                "You were assigned lead \"{$lead->name}\".");
        }

        $lead->load(['assignedTo:id,name']);

        return ApiResponse::success($this->format($lead), 'Lead created', 201);
    }

    public function show(int $id): JsonResponse
    {
        // client:id,lead_id,name — lead_id (the hasOne FK) must be in the
        // restricted column list, or Eloquent can't match the loaded Client
        // row back to this Lead and $lead->client silently resolves to
        // null even when a real Client row exists (format()'s 'client_id'
        // then always came back null for an already-converted lead).
        $lead = Lead::whereIn('company_id', $this->companyIds())
            ->with(['assignedTo:id,name', 'client:id,lead_id,name', 'followUps.assignedTo:id,name', 'activities'])
            ->findOrFail($id);

        $data         = $this->format($lead);
        $data['follow_ups']  = $lead->followUps->map(fn($f) => $this->formatFollowUp($f))->values();
        $data['activities']  = $lead->activities->map(fn($a) => [
            'id'          => $a->id,
            'type'        => $a->type,
            'description' => $a->description,
            'causer_name' => $a->causer_name,
            'meta'        => $a->meta,
            'created_at'  => $a->created_at->toDateTimeString(),
        ])->values();

        return ApiResponse::success($data);
    }

    // GET /admin/leads/{id}/project-eligibility — mirrors
    // Api\User\LeadController::projectEligibility().
    public function projectEligibility(int $id): JsonResponse
    {
        $lead = Lead::whereIn('company_id', $this->companyIds())->findOrFail($id);

        return ApiResponse::success(\App\Services\DealEligibilityService::summary($lead));
    }

    public function update(Request $request, int $id): JsonResponse
    {
        $lead = Lead::whereIn('company_id', $this->companyIds())->findOrFail($id);
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
            'assigned_to'        => ['nullable', 'integer', 'exists:users,id'],
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

        // Log meaningful changes
        $name = $this->adminName();
        if (isset($validated['status']) && $validated['status'] !== $old['status']) {
            $lead->logActivity('status_changed', "Status changed from {$old['status']} to {$validated['status']}", $name,
                ['from' => $old['status'], 'to' => $validated['status']]);
            $this->notifyUser($lead->assigned_to, $lead, 'lead_status_changed', 'Lead status changed',
                "Lead \"{$lead->name}\" status changed to \"{$validated['status']}\".");
        }
        if (isset($validated['assigned_to']) && $validated['assigned_to'] !== $old['assigned_to']) {
            $assignee = $validated['assigned_to'] ? User::find($validated['assigned_to'])?->name : 'unassigned';
            $lead->logActivity('assigned', "Lead assigned to {$assignee}", $name, ['to' => $assignee]);
            $this->notifyUser($validated['assigned_to'], $lead, 'lead_assigned', 'New lead assigned',
                "You were assigned lead \"{$lead->name}\".");
        }
        if (isset($validated['notes']) && $validated['notes'] !== $old['notes'] && $validated['notes']) {
            $lead->logActivity('note_added', 'Notes updated', $name);
        }

        $lead->load(['assignedTo:id,name']);
        return ApiResponse::success($this->format($lead));
    }

    // Next DEAL-{year}-{seq} reference — same sequence/table as
    // Api\User\LeadController's own copy (both query the same `leads` table,
    // so uniqueness holds regardless of which guard generated it).
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
        $lead = Lead::whereIn('company_id', $this->companyIds())->findOrFail($id);
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
        // proposed_project_title is no longer required up front — the
        // frontend's confirmation modal was removed (flow is now Won ->
        // Convert to Client -> Create Invoice, no popup) — it defaults to
        // "{name} — Project" below when not supplied.
        if ($becomingWon) {
            $rules['proposed_project_title']      = ['nullable', 'string', 'max:255'];
            $rules['service_category']            = ['nullable', 'string', 'max:100'];
            $rules['scope_summary']               = ['nullable', 'string'];
            $rules['detailed_scope']              = ['nullable', 'string'];
            $rules['quotation_reference']         = ['nullable', 'string', 'max:100'];
            $rules['required_kickoff_amount']     = ['nullable', 'numeric', 'min:0'];
            $rules['required_kickoff_percentage'] = ['nullable', 'numeric', 'min:0', 'max:100'];
            $rules['expected_start_date']         = ['nullable', 'date'];
            $rules['expected_end_date']           = ['nullable', 'date'];
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
                $this->adminName(), ['deal_reference' => $lead->deal_reference]);
        }

        $type = match($request->status) {
            'won'  => 'won',
            'lost' => 'lost',
            default => 'status_changed',
        };
        $lead->logActivity($type, "Status changed from {$old} to {$request->status}", $this->adminName(),
            ['from' => $old, 'to' => $request->status]);

        $notifyType = match ($request->status) {
            'won'   => 'lead_won',
            'lost'  => 'lead_lost',
            default => 'lead_status_changed',
        };
        $this->notifyUser($lead->assigned_to, $lead, $notifyType,
            $request->status === 'won' ? 'Lead won!' : ($request->status === 'lost' ? 'Lead lost' : 'Lead status changed'),
            "Lead \"{$lead->name}\" status changed to \"{$request->status}\".");

        $lead->load(['assignedTo:id,name']);
        return ApiResponse::success($this->format($lead));
    }

    public function destroy(int $id): JsonResponse
    {
        $lead = Lead::whereIn('company_id', $this->companyIds())->findOrFail($id);
        $lead->delete();
        return ApiResponse::success(null, 'Lead deleted');
    }

    public function convert(int $id): JsonResponse
    {
        $lead = Lead::whereIn('company_id', $this->companyIds())->findOrFail($id);

        if ($lead->client()->exists()) {
            return ApiResponse::error('Lead already converted to a client', 422);
        }

        // Same company-scoped duplicate guard as Api\User\LeadController::convert().
        if (!empty($lead->email) && Client::where('company_id', $lead->company_id)->where('email', $lead->email)->exists()) {
            return ApiResponse::error('Client with this email already exists.', 422);
        }

        $client = Client::create([
            'company_id'   => $lead->company_id,
            'name'         => $lead->name,
            'email'        => $lead->email,
            'phone'        => $lead->phone,
            'company_name' => $lead->company_name,
            'notes'        => $lead->notes,
            'status'       => 'active',
            'lead_id'      => $lead->id,
        ]);

        $lead->update(['status' => 'won', 'converted_at' => now()]);
        $lead->logActivity('converted', "Lead converted to client \"{$client->name}\"", $this->adminName(),
            ['client_id' => $client->id]);

        // Any project auto-created from this lead's paid invoice while it was
        // still a lead (PaymentProjectStartService::createDraftProject()) was
        // stamped with lead_id only — client_id was null since no Client
        // existed yet. Without this, the Client Portal's project list
        // (Api\Client\ProjectController, filtered strictly on client_id)
        // would never surface that project, even once activated and even
        // after portal access is granted.
        Project::where('lead_id', $lead->id)->whereNull('client_id')->update(['client_id' => $client->id]);

        return ApiResponse::success(['client_id' => $client->id], 'Lead converted to client', 201);
    }

    // POST /admin/leads/{id}/transfer — mirrors Api\User\LeadController::transfer().
    public function transfer(Request $request, int $id): JsonResponse
    {
        $lead = Lead::whereIn('company_id', $this->companyIds())->findOrFail($id);

        if ($lead->status === 'won') {
            return ApiResponse::error('Won leads cannot be transferred.', 422);
        }

        $validated = $request->validate([
            'to_user_id' => [
                'required',
                'integer',
                // A lead can be transferred to a Seller (the normal case) or a
                // Lead Manager (who owns/redistributes leads directly per
                // RoleDefaultPermissions — canTransferLeads/canAssignLeadOwner
                // are granted to that role by default) — never any other
                // internal role. Mirrors companyUsers() below exactly, so
                // this picker can never offer a choice transfer() then rejects.
                Rule::exists('users', 'id')
                    ->where('company_id', $lead->company_id)
                    ->where('is_active', true)
                    ->whereIn('role_type', ['seller', 'lead_manager']),
            ],
            'reason'     => ['nullable', 'string', 'max:1000'],
        ]);

        $fromUserId = $lead->assigned_to;
        $toUserId   = $validated['to_user_id'];

        if ($fromUserId === $toUserId) {
            return ApiResponse::error('Lead is already assigned to this user.', 422);
        }

        LeadTransfer::create([
            'lead_id'                   => $lead->id,
            'company_id'                => $lead->company_id,
            'from_user_id'              => $fromUserId,
            'to_user_id'                => $toUserId,
            'transferred_by_admin_name' => $this->adminName(),
            'reason'                    => $validated['reason'] ?? null,
        ]);

        $lead->update(['assigned_to' => $toUserId, 'transferred_to' => $toUserId, 'transferred_at' => now()]);

        $toName = User::find($toUserId)?->name ?? 'Unknown';
        $lead->logActivity('transferred', "Lead transferred to {$toName}" . (!empty($validated['reason']) ? " — {$validated['reason']}" : ''),
            $this->adminName(), ['from' => $fromUserId, 'to' => $toUserId, 'reason' => $validated['reason'] ?? null]);
        $this->notifyUser($toUserId, $lead, 'lead_transferred', 'Lead transferred to you',
            "Lead \"{$lead->name}\" was transferred to you" . (!empty($validated['reason']) ? " — {$validated['reason']}" : '') . '.');

        $lead->load(['assignedTo:id,name']);
        return ApiResponse::success($this->format($lead), 'Lead transferred');
    }

    // GET /admin/leads/company-users?company_id= — picker list for the
    // Transfer Lead modal (Admin manages multiple companies, so the target
    // company must be specified). Sellers and Lead Managers only — mirrors
    // transfer()'s validation exactly.
    public function companyUsers(Request $request): JsonResponse
    {
        $data = $request->validate([
            'company_id' => ['required', 'integer', 'in:' . implode(',', $this->companyIds())],
        ]);

        $users = User::where('company_id', $data['company_id'])
            ->where('is_active', true)
            ->whereIn('role_type', ['seller', 'lead_manager'])
            ->orderBy('name')
            ->get(['id', 'name', 'email']);

        return ApiResponse::success($users);
    }

    // Pipeline: update status via drag-and-drop
    public function pipeline(Request $request): JsonResponse
    {
        $leads = Lead::whereIn('company_id', $this->companyIds())
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
