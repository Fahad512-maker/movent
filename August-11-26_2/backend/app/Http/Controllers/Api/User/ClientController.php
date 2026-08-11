<?php

namespace App\Http\Controllers\Api\User;

use App\Helpers\ApiResponse;
use App\Http\Controllers\Controller;
use App\Mail\ClientPortalWelcomeMail;
use App\Models\Client;
use App\Models\ClientPortalPermission;
use App\Models\Company;
use App\Models\User;
use App\Models\UserCompanyPermission;
use App\Services\ClientPortalService;
use App\Support\PermissionDebug;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Mail;

class ClientController extends Controller
{
    private function user() { return auth('sanctum')->user(); }

    // canViewClients/canCreateClients/canEditClients are granted identically
    // whether the company purchased the Client module or the Sales module
    // ("basic client access included with Sales") — check both buckets so a
    // Sales-only grant still works here, mirroring the same fix applied to
    // the frontend's can() helper.
    private function can(string $permKey): bool
    {
        $user = $this->user();
        $result = UserCompanyPermission::where('user_id', $user->id)
            ->where('company_id', $user->company_id)
            ->whereIn('module_key', ['client', 'sales'])
            ->where('permission_key', $permKey)
            ->exists();
        PermissionDebug::log($user->id, $user->company_id, $user->role_type, 'client/sales', $permKey, $result);
        return $result;
    }

    // Same-company clients this user may see/act on — every client if
    // canViewAllCompanyClients is held, otherwise only clients they're the
    // account manager for, whose originating lead is assigned/transferred to
    // them, who has an invoice they created, or who has a project handed off
    // to them as seller. Mirrors Api\User\LeadController::visibleLeads() and
    // Api\User\ProjectController::visibleProjects()'s ownership-scoping
    // pattern, applied to Client for the first time — this controller
    // previously showed every active company client to anyone with
    // canViewClients regardless of ownership.
    private function visibleClients()
    {
        $user = $this->user();
        $base = Client::where('company_id', $user->company_id);

        if ($this->can('canViewAllCompanyClients')) {
            return $base;
        }

        return $base->where(function ($q) use ($user) {
            $q->where('account_manager', $user->id)
              ->orWhereHas('lead', fn ($l) => $l->where('assigned_to', $user->id)->orWhere('transferred_to', $user->id))
              ->orWhereHas('invoices', fn ($i) => $i->where('created_by', $user->id))
              ->orWhereHas('projects', fn ($p) => $p->where('seller_id', $user->id));
        });
    }

    // GET /user/clients — returns clients belonging to the sub user's company
    public function index(): JsonResponse
    {
        if (!$this->can('canViewClients')) {
            return ApiResponse::error('Permission denied', 403);
        }

        $clients = $this->visibleClients()
            ->where('status', 'active')
            ->orderBy('name')
            ->get(['id', 'name', 'company_name', 'email', 'phone', 'address', 'notes', 'status']);

        return ApiResponse::success($clients);
    }

    // Mirrors Api\Admin\ClientController::PORTAL_TO_COMPANY — which DB
    // module(s) must be purchased for a given portal module to actually be
    // offerable to the client.
    private const PORTAL_TO_COMPANY = [
        'projects'  => ['client_portal', 'projects'],
        'invoices'  => ['client_portal', 'invoices'],
        'payments'  => ['client_portal', 'payments'],
        'documents' => ['client_portal', 'documents'],
        'chat'      => ['client_portal', 'chat'],
        'support'   => ['client_portal'],
        'reports'   => ['client_portal', 'reports'],
    ];

    // GET /user/clients/{id}
    public function show(int $id): JsonResponse
    {
        if (!$this->can('canViewClients')) {
            return ApiResponse::error('Permission denied', 403);
        }

        $client = $this->visibleClients()
            ->with(['user:id,email,role_type,is_active', 'company.modules'])
            ->findOrFail($id);

        // Portal permissions are only meaningful (and only sent) to a user
        // who can actually manage them — everyone else just gets the client.
        if (!$this->can('canEnableClientPortal') && !$this->can('canDisableClientPortal')) {
            return ApiResponse::success($client);
        }

        $companyModules = $client->company->modules
            ->where('is_enabled', true)
            ->pluck('module_key')
            ->toArray();

        $permissions = ClientPortalPermission::where('client_id', $id)
            ->get(['module_key', 'is_enabled'])
            ->keyBy('module_key')
            ->map(fn($p) => $p->is_enabled);

        $allModules = [];
        foreach (ClientPortalPermission::MODULES as $key => $label) {
            $required  = self::PORTAL_TO_COMPANY[$key] ?? [$key];
            $purchased = count(array_intersect((array) $required, $companyModules)) > 0;
            $allModules[$key] = [
                'label'      => $label,
                'is_enabled' => $purchased ? (bool) ($permissions[$key] ?? true) : false,
                'purchased'  => $purchased,
            ];
        }

        // Kept as an extra attribute on the same Client payload (not a
        // {client, permissions} envelope) so this endpoint's response shape
        // never changes regardless of who's asking — every existing caller
        // of GET /user/clients/{id} already expects a plain Client back.
        $data = $client->toArray();
        $data['portal_permissions'] = $allModules;

        return ApiResponse::success($data);
    }

    // POST /user/clients — basic client record only; document/support
    // features remain Admin-only and out of scope. Portal access itself is
    // available via enablePortal()/disablePortal() below, gated by their own
    // permissions, rather than as a flag on this create form.
    public function store(Request $request): JsonResponse
    {
        if (!$this->can('canCreateClients')) {
            return ApiResponse::error('Permission denied', 403);
        }

        $validated = $request->validate([
            'name'         => ['required', 'string', 'max:255'],
            'email'        => ['nullable', 'email', 'max:255'],
            'phone'        => ['nullable', 'string', 'max:50'],
            'company_name' => ['nullable', 'string', 'max:255'],
            'address'      => ['nullable', 'string', 'max:500'],
            'notes'        => ['nullable', 'string'],
            'status'       => ['nullable', 'in:active,inactive,blocked'],
        ]);

        $companyId = $this->user()->company_id;

        // Same company-scoped duplicate guard as Api\User\LeadController::
        // convert() — a Seller creating a client by hand must hit the same
        // "already exists" wall as one converting a lead.
        if (!empty($validated['email']) && Client::where('company_id', $companyId)->where('email', $validated['email'])->exists()) {
            return ApiResponse::error('Client with this email already exists.', 422);
        }

        $validated['company_id'] = $companyId;
        $validated['status']   ??= 'active';
        // Whoever creates this client becomes its account manager by
        // default — without this, a Seller who just created a client would
        // immediately lose visibility into it under visibleClients() above.
        $validated['account_manager'] = $this->user()->id;

        $client = Client::create($validated);

        return ApiResponse::success($client, 'Client created', 201);
    }

    // PUT /user/clients/{id}
    public function update(Request $request, int $id): JsonResponse
    {
        if (!$this->can('canEditClients')) {
            return ApiResponse::error('Permission denied', 403);
        }

        $client = $this->visibleClients()->findOrFail($id);

        $validated = $request->validate([
            'name'         => ['sometimes', 'string', 'max:255'],
            'email'        => ['nullable', 'email', 'max:255'],
            'phone'        => ['nullable', 'string', 'max:50'],
            'company_name' => ['nullable', 'string', 'max:255'],
            'address'      => ['nullable', 'string', 'max:500'],
            'notes'        => ['nullable', 'string'],
            'status'       => ['sometimes', 'in:active,inactive,blocked'],
        ]);

        // Same company-scoped duplicate guard as store() — editing a
        // client's email must not collide with a different client's.
        if (!empty($validated['email'])) {
            $duplicate = Client::where('company_id', $client->company_id)
                ->where('email', $validated['email'])
                ->where('id', '!=', $client->id)
                ->exists();
            if ($duplicate) {
                return ApiResponse::error('Client with this email already exists.', 422);
            }
        }

        $client->update($validated);

        return ApiResponse::success($client, 'Client updated');
    }

    // DELETE /user/clients/{id} — gated behind canDeleteClients, not on by
    // default for any role (Company Admin decides who gets it, e.g. a
    // Project Manager). Soft delete only (Client uses SoftDeletes) — see
    // Api\Admin\ClientController::destroy()'s comment: a real row delete
    // would cascade-wipe the client's invoices, a soft delete never does.
    // Also deactivates the linked portal login (if any).
    public function destroy(int $id): JsonResponse
    {
        if (!$this->can('canDeleteClients')) {
            return ApiResponse::error('Permission denied', 403);
        }

        $client = $this->visibleClients()->findOrFail($id);

        if ($client->user_id) {
            User::where('id', $client->user_id)->update(['is_active' => false]);
        }

        $client->delete();

        return ApiResponse::success(null, 'Client deleted');
    }

    // PUT /user/clients/{id}/permissions — which portal modules this client
    // can see; either portal permission implies "manages portal" broadly,
    // matching Admin's own updatePermissions() (no dedicated key there since
    // Company Admin is unrestricted by guard).
    public function updatePermissions(Request $request, int $id): JsonResponse
    {
        if (!$this->can('canEnableClientPortal') && !$this->can('canDisableClientPortal')) {
            return ApiResponse::error('Permission denied', 403);
        }

        $client = $this->visibleClients()->findOrFail($id);

        $request->validate([
            'permissions'   => 'required|array',
            'permissions.*' => 'boolean',
        ]);

        $allowed = array_keys(ClientPortalPermission::MODULES);

        foreach ($request->permissions as $moduleKey => $isEnabled) {
            if (!in_array($moduleKey, $allowed)) continue;
            ClientPortalPermission::updateOrCreate(
                ['client_id' => $client->id, 'module_key' => $moduleKey],
                ['is_enabled' => (bool) $isEnabled]
            );
        }

        return ApiResponse::success(null, 'Permissions updated');
    }

    // POST /user/clients/{id}/enable-portal — was previously reachable only
    // via the admin guard despite canEnableClientPortal existing in
    // ModuleCatalog since introduction; nothing ever checked it. Mirrors
    // Api\Admin\ClientController::enablePortal() exactly, via the shared
    // App\Services\ClientPortalService so the seat-limit / portal-login
    // logic can't drift between the two guards.
    public function enablePortal(Request $request, int $id): JsonResponse
    {
        if (!$this->can('canEnableClientPortal')) {
            return ApiResponse::error('Permission denied', 403);
        }

        $request->validate([
            'portal_email'    => 'required|email|max:255',
            'portal_password' => 'required|string|min:6|max:100',
        ]);

        $user   = $this->user();
        $client = $this->visibleClients()->findOrFail($id);

        if (ClientPortalService::emailBelongsToAnotherAccount($request->portal_email)) {
            return ApiResponse::error('This email is already registered as a staff or Company Admin account.', 422);
        }

        if (!$client->portal_access) {
            $admin = $user->company->admin;
            $seat  = ClientPortalService::seatInfo($admin, $client->company_id);
            if (!$seat['can_add']) {
                return ApiResponse::error(
                    "Seat limit reached for this company ({$seat['portal_used']}/{$seat['limit']}). Ask your Company Admin to upgrade the package.",
                    422
                );
            }
        }

        $error = ClientPortalService::createOrUpdatePortalUser($client, $request->portal_email, $request->portal_password);
        if ($error) {
            return ApiResponse::error($error, 422);
        }
        ClientPortalService::seedPermissions($client->id);

        // Same login-details email as Api\Admin\ClientController::enablePortal()
        // — non-blocking, never fails this action.
        try {
            Mail::to($request->portal_email)->send(new ClientPortalWelcomeMail(
                $client, $client->company ?? Company::find($client->company_id), $request->portal_email, $request->portal_password
            ));
        } catch (\Throwable) {
            // Don't fail portal enablement if mail fails
        }

        return ApiResponse::success($client->fresh(), 'Portal access enabled');
    }

    // POST /user/clients/{id}/disable-portal
    public function disablePortal(int $id): JsonResponse
    {
        if (!$this->can('canDisableClientPortal')) {
            return ApiResponse::error('Permission denied', 403);
        }

        $client = $this->visibleClients()->findOrFail($id);
        $client->update(['portal_access' => false]);

        return ApiResponse::success(null, 'Portal access disabled');
    }
}
