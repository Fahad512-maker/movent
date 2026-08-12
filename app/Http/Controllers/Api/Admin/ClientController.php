<?php

namespace App\Http\Controllers\Api\Admin;

use App\Helpers\ApiResponse;
use App\Http\Controllers\Controller;
use App\Models\Client;
use App\Models\ClientPortalPermission;
use App\Models\Company;
use App\Models\CompanyUserAssignment;
use App\Models\User;
use App\Mail\ClientPortalWelcomeMail;
use App\Support\CompanyName;
use App\Support\CrossAccountEmail;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Facades\Storage;

class ClientController extends Controller
{
    private function admin()
    {
        return auth('admin')->user();
    }

    private function companyIds(): array
    {
        return $this->admin()->companies()->pluck('id')->toArray();
    }

    // ─── Per-company seat check: each company has its own independent limit ──────
    private function seatInfo(int $companyId): array
    {
        $admin = $this->admin()->load('package');
        // Per-admin override (paid at registration or via a seat upgrade)
        // takes precedence over the shared Package default — same
        // precedence rule as companyInfo() below and UserController::orgUserLimit().
        $limit = $admin->max_users_per_company ?? $admin->package?->max_users_per_company;

        $portalUsed = User::where('company_id', $companyId)
            ->where('role_type', 'client')
            ->count();

        $clientRecords = Client::where('company_id', $companyId)->count();

        return [
            'limit'         => $limit,
            'portal_used'   => $portalUsed,
            'clients_total' => $clientRecords,
            'remaining'     => $limit !== null ? max($limit - $portalUsed, 0) : null,
            'can_add'       => $limit === null || $portalUsed < $limit,
        ];
    }

    // ─── Company limit check ──────────────────────────────────────────────────
    private function companyInfo(): array
    {
        $admin = $this->admin()->load('package');

        // The company count chosen (and paid for) at registration takes
        // precedence over the shared Package's default — falls back to the
        // Package limit only for admins registered before this column existed.
        $max  = $admin->max_companies ?? $admin->package?->max_companies ?? null;
        $used = $admin->companies()->count();

        return [
            'max'     => $max,
            'used'    => $used,
            'can_add' => $max === null || $used < $max,
        ];
    }

    // ─── Check client_portal module ───────────────────────────────────────────
    private function hasPortalModule(int $companyId): bool
    {
        return Company::find($companyId)
            ?->modules()
            ->whereIn('module_key', ['client_portal', 'clients'])
            ->where('is_enabled', true)
            ->exists() ?? false;
    }

    // ─── Cross-account email guard ─────────────────────────────────────────────
    // Blocks a Company Admin match outright, and a staff match UNLESS that
    // User is already role_type='client' (re-using/re-linking an existing
    // client login — e.g. the same person is a client of two companies — is
    // fine; silently hijacking a Seller/PM/QA/etc.'s login is not).
    private function emailBelongsToAnotherAccount(string $email): bool
    {
        if (CrossAccountEmail::existsAsAdmin($email)) {
            return true;
        }
        $user = User::where('email', $email)->first();
        return $user !== null && $user->role_type !== 'client';
    }

    // ─── Seed default permissions (all enabled) ───────────────────────────────
    private function seedPermissions(int $clientId): void
    {
        foreach (array_keys(ClientPortalPermission::MODULES) as $key) {
            ClientPortalPermission::firstOrCreate(
                ['client_id' => $clientId, 'module_key' => $key],
                ['is_enabled' => true]
            );
        }
    }

    // ─── Create / update portal user ──────────────────────────────────────────
    // Returns an error message on failure, null on success. Callers already
    // check emailBelongsToAnotherAccount() before reaching here — this is a
    // second, defense-in-depth guard against ever silently converting an
    // existing Admin/non-client staff login into a client login.
    private function createOrUpdatePortalUser(Client $client, string $email, string $password): ?string
    {
        if ($this->emailBelongsToAnotherAccount($email)) {
            return 'This email is already registered as a staff or Company Admin account.';
        }

        $user = User::where('email', $email)->first();

        if ($user) {
            $user->update([
                'password'  => Hash::make($password),
                'role_type' => 'client',
                'is_active' => true,
            ]);
        } else {
            $user = User::create([
                'company_id' => $client->company_id,
                'name'       => $client->name,
                'email'      => $email,
                'password'   => Hash::make($password),
                'role_type'  => 'client',
                'is_active'  => true,
            ]);
        }

        $client->update(['user_id' => $user->id, 'portal_access' => true]);

        return null;
    }

    // =========================================================================
    // GET /api/admin/usage
    // =========================================================================
    public function usage(): JsonResponse
    {
        $admin   = $this->admin()->load('package');
        $package = $admin->package;

        // Effective limits — admin-level override (registration or seat/company
        // upgrade purchase) takes precedence over the Package default. Same
        // precedence as seatInfo()/companyInfo() above.
        $effectiveSeatLimit    = $admin->max_users_per_company ?? $package?->max_users_per_company;
        $effectiveCompanyLimit = $admin->max_companies ?? $package?->max_companies;

        $companies = $admin->companies()->withCount([
            'clients',
            // Matches seatInfo()'s enforcement query exactly (User.role_type =
            // 'client'), not Client.portal_access — those two flags can drift
            // apart since portal_access changes don't always keep the paired
            // User row's role_type in lockstep on every code path.
            'users as portal_clients_count' => fn($q) => $q->where('role_type', 'client'),
        ])->get(['id', 'name', 'is_active']);

        $comp = $this->companyInfo();

        // Staff seats — an ORG-WIDE pool (one shared cap across every company
        // this admin owns), not per-company. Mirrors
        // Admin\UserController::orgUserCount()/orgUserLimit() exactly — that's
        // the endpoint that actually enforces this limit when creating/
        // inviting staff, this is just read-only display of the same numbers.
        // Deliberately distinct from the per-company "portal seat" limit
        // below (client-portal logins), which is a different business rule
        // that happens to reuse the same $effectiveSeatLimit value.
        // status='active' filter: a user suspended in every company must
        // free their seat, exactly like orgUserCount().
        $staffSeatsUsed = CompanyUserAssignment::whereIn('company_id', $this->companyIds())
            ->where('status', 'active')
            ->distinct('user_id')->count('user_id') + 1; // +1 for the admin themselves
        $staffSeatsRemaining = $effectiveSeatLimit !== null ? max(0, $effectiveSeatLimit - $staffSeatsUsed) : null;

        // Per-company breakdown of active staff seats — via CompanyUserAssignment
        // (not the `users` relation, which only reflects a user's single
        // PRIMARY company) so a user active in two of this admin's companies
        // is correctly counted in BOTH company rows here, even though
        // $staffSeatsUsed above counts them only once org-wide.
        $staffCountsByCompany = CompanyUserAssignment::whereIn('company_id', $this->companyIds())
            ->where('status', 'active')
            ->selectRaw('company_id, COUNT(DISTINCT user_id) as cnt')
            ->groupBy('company_id')
            ->pluck('cnt', 'company_id');

        $payments = $admin->subscriptionPayments()->orderByDesc('created_at')->get();
        $paymentTypeLabels = [
            'module_purchase'       => 'Module Purchase',
            'seat_upgrade'          => 'Seat Upgrade',
            'company_slot_upgrade'  => 'Company Slot Upgrade',
        ];

        return ApiResponse::success([
            'package' => [
                'name'                  => $package?->name,
                'tier'                  => $package?->tier,
                'max_companies'         => $effectiveCompanyLimit,
                'max_users_per_company' => $effectiveSeatLimit,
            ],
            'subscription' => [
                'status'               => $admin->subscription_status,
                'trial_ends_at'        => $admin->trial_ends_at?->toDateString(),
                'subscription_ends_at' => $admin->subscription_ends_at?->toDateString(),
            ],
            'staff_seats_used'      => $staffSeatsUsed,
            'staff_seats_limit'     => $effectiveSeatLimit,
            'staff_seats_remaining' => $staffSeatsRemaining,
            'companies_used'  => $comp['used'],
            'companies_max'   => $comp['max'],
            'can_add_company' => $comp['can_add'],
            'companies'       => $companies->map(fn($c) => [
                'id'                   => $c->id,
                'name'                 => $c->name,
                'is_active'            => $c->is_active,
                'clients_count'        => $c->clients_count,        // total client records
                'portal_clients_count' => $c->portal_clients_count, // portal-enabled clients
                'active_staff_count'   => $staffCountsByCompany[$c->id] ?? 0, // staff seats used in this company
            ]),
            'payments_total_paid' => $payments->where('status', 'paid')->sum('amount'),
            'payments' => $payments->map(fn($p) => [
                'id'         => $p->id,
                'amount'     => $p->amount,
                'currency'   => $p->currency,
                'gateway'    => $p->gateway,
                'status'     => $p->status,
                // No `meta.type` means the monthly subscription-renewal charge
                // (the only write path that never sets one — see SubscriptionPaymentController).
                'label'      => $paymentTypeLabels[$p->meta['type'] ?? ''] ?? 'Subscription Renewal',
                'created_at' => $p->created_at?->toDateTimeString(),
            ]),
        ]);
    }

    // =========================================================================
    // GET /api/admin/companies  (dropdown list)
    // =========================================================================
    public function companies(): JsonResponse
    {
        $companies = $this->admin()->companies()
            ->select('id', 'name', 'currency')
            ->where('is_active', true)
            ->orderBy('name')
            ->get();

        return ApiResponse::success($companies);
    }

    // =========================================================================
    // POST /api/admin/companies  (create new company)
    // =========================================================================
    public function storeCompany(Request $request): JsonResponse
    {
        $admin = $this->admin();
        $comp  = $this->companyInfo();

        if (!$comp['can_add']) {
            return ApiResponse::error(
                "Company limit reached ({$comp['used']}/{$comp['max']}). Please upgrade your package.",
                422
            );
        }

        $data = $request->validate([
            'name'     => 'required|string|max:200',
            'currency' => 'required|in:PKR,USD',
            'industry' => 'nullable|string|max:100',
            'email'    => 'nullable|email|max:255',
            'phone'    => 'nullable|string|max:30',
            'address'  => 'nullable|string|max:500',
            'timezone' => 'nullable|string|max:100',
        ]);

        $data['name'] = CompanyName::normalize($data['name']);
        CompanyName::throwIfTaken($data['name'], 'name', null, $admin->id);

        $company = Company::create([
            'admin_id'       => $admin->id,
            'name'           => $data['name'],
            'currency'       => $data['currency'],
            'industry'       => $data['industry'] ?? null,
            'email'          => $data['email'] ?? null,
            'phone'          => $data['phone'] ?? null,
            'address'        => $data['address'] ?? null,
            'timezone'       => $data['timezone'] ?? 'Asia/Karachi',
            'storage_folder' => 'companies/0/',
            'is_active'      => true,
        ]);

        $folder = 'companies/' . $company->id . '/';
        $company->update(['storage_folder' => $folder]);
        Storage::makeDirectory($folder);

        // Copy modules from the admin's first existing company
        $firstCompany = $admin->companies()
            ->where('id', '!=', $company->id)
            ->first();

        if ($firstCompany) {
            $firstCompany->modules()->get()->each(function ($mod) use ($company) {
                $company->modules()->create([
                    'module_key' => $mod->module_key,
                    'is_enabled' => $mod->is_enabled,
                ]);
            });
        }

        return ApiResponse::success([
            'id'   => $company->id,
            'name' => $company->name,
        ], 'Company created successfully');
    }

    // =========================================================================
    // GET /api/admin/companies/{id}  (full details, for the edit form)
    // =========================================================================
    public function showCompany(int $id): JsonResponse
    {
        $company = $this->admin()->companies()->findOrFail($id);

        return ApiResponse::success($company->only([
            'id', 'name', 'currency', 'industry', 'email', 'phone', 'address', 'timezone', 'is_active',
        ]));
    }

    // =========================================================================
    // PUT /api/admin/companies/{id}
    // =========================================================================
    public function updateCompany(Request $request, int $id): JsonResponse
    {
        $company = $this->admin()->companies()->findOrFail($id);

        $data = $request->validate([
            'name'     => 'required|string|max:200',
            'currency' => 'required|in:PKR,USD',
            'industry' => 'nullable|string|max:100',
            'email'    => 'nullable|email|max:255',
            'phone'    => 'nullable|string|max:30',
            'address'  => 'nullable|string|max:500',
            'timezone' => 'nullable|string|max:100',
        ]);

        $data['name'] = CompanyName::normalize($data['name']);
        CompanyName::throwIfTaken($data['name'], 'name', $company->id, $this->admin()->id);

        $company->update($data);

        return ApiResponse::success($company->only([
            'id', 'name', 'currency', 'industry', 'email', 'phone', 'address', 'timezone',
        ]), 'Company updated successfully');
    }

    // =========================================================================
    // GET /api/admin/clients
    // =========================================================================
    public function index(Request $request): JsonResponse
    {
        $companyIds = $this->companyIds();

        $query = Client::whereIn('company_id', $companyIds)
            ->with(['user:id,email,is_active', 'company:id,name'])
            ->orderByDesc('created_at');

        if ($request->filled('search')) {
            $s = $request->search;
            $query->where(fn($q) =>
                $q->where('name', 'like', "%{$s}%")
                  ->orWhere('email', 'like', "%{$s}%")
                  ->orWhere('company_name', 'like', "%{$s}%")
            );
        }

        if ($request->filled('portal')) {
            $query->where('portal_access', $request->portal === 'enabled');
        }

        if ($request->filled('company_id')) {
            $cid = (int) $request->company_id;
            if (in_array($cid, $companyIds)) {
                $query->where('company_id', $cid);
            }
        }

        $clients = $query->get([
            'id', 'company_id', 'user_id', 'name', 'email', 'phone',
            'company_name', 'portal_access', 'status', 'created_at',
        ]);

        // Show seat info for the filtered company, or first company as default
        $seatCompanyId = $request->filled('company_id')
            ? (int) $request->company_id
            : ($companyIds[0] ?? null);

        return ApiResponse::success([
            'clients' => $clients,
            'seat'    => $seatCompanyId ? $this->seatInfo($seatCompanyId) : null,
        ]);
    }

    // Portal module key → required company module key
    private const PORTAL_TO_COMPANY = [
        'projects'  => ['client_portal', 'projects'],
        'invoices'  => ['client_portal', 'invoices'],
        'payments'  => ['client_portal', 'payments'],
        'documents' => ['client_portal', 'documents'],
        'chat'      => ['client_portal', 'chat'],
        'support'   => ['client_portal'],
        'reports'   => ['client_portal', 'reports'],
    ];

    // =========================================================================
    // GET /api/admin/clients/{id}
    // =========================================================================
    public function show(int $id): JsonResponse
    {
        $client = Client::whereIn('company_id', $this->companyIds())
            ->with(['user:id,email,role_type,is_active', 'company.modules'])
            ->findOrFail($id);

        // What modules has this company purchased?
        $companyModules = $client->company->modules
            ->where('is_enabled', true)
            ->pluck('module_key')
            ->toArray();

        $permissions = ClientPortalPermission::where('client_id', $id)
            ->get(['module_key', 'is_enabled'])
            ->keyBy('module_key')
            ->map(fn($p) => $p->is_enabled);

        // Return all portal modules; mark which ones are covered by the company's plan
        $allModules = [];
        foreach (ClientPortalPermission::MODULES as $key => $label) {
            $required   = self::PORTAL_TO_COMPANY[$key] ?? [$key];
            $purchased  = count(array_intersect((array) $required, $companyModules)) > 0;
            $allModules[$key] = [
                'label'      => $label,
                'is_enabled' => $purchased ? (bool) ($permissions[$key] ?? true) : false,
                'purchased'  => $purchased,
            ];
        }

        return ApiResponse::success([
            'client'      => $client,
            'permissions' => $allModules,
            'seat'        => $this->seatInfo($client->company_id),
            // Drives the frontend's Portal tab/"Enable Portal" button — a
            // company without the real Client Portal module only ever gets
            // a Basic Client record, portal login is never offerable.
            'has_portal_module' => in_array('client_portal', $companyModules, true),
        ]);
    }

    // =========================================================================
    // POST /api/admin/clients
    // =========================================================================
    public function store(Request $request): JsonResponse
    {
        $companyIds = $this->companyIds();

        $data = $request->validate([
            'company_id'      => 'required|integer|in:' . implode(',', $companyIds),
            'name'            => 'required|string|max:150',
            'email'           => 'nullable|email|max:255',
            'phone'           => 'nullable|string|max:30',
            'company_name'    => 'nullable|string|max:150',
            'address'         => 'nullable|string|max:500',
            'notes'           => 'nullable|string|max:1000',
            'status'          => 'nullable|in:active,inactive,blocked',
            'enable_portal'   => 'nullable|boolean',
            'portal_email'    => 'nullable|required_if:enable_portal,true|email|max:255',
            'portal_password' => 'nullable|required_if:enable_portal,true|string|min:6|max:100',
        ]);

        $companyId = (int) $data['company_id'];

        // A client's contact email must not collide with an existing staff
        // or Admin login — otherwise enabling portal access for this client
        // later (createOrUpdatePortalUser()) could silently hijack that
        // other account. Checked even when portal access isn't being enabled
        // right now, since the email can still be reused for that later.
        if (!empty($data['email']) && $this->emailBelongsToAnotherAccount($data['email'])) {
            return ApiResponse::error('This email is already registered as a staff or Company Admin account.', 422);
        }

        // Same company-scoped duplicate guard as Api\User\ClientController.
        if (!empty($data['email']) && Client::where('company_id', $companyId)->where('email', $data['email'])->exists()) {
            return ApiResponse::error('Client with this email already exists.', 422);
        }

        // Portal module check only needed when enabling portal access
        if (!empty($data['enable_portal']) && !$this->hasPortalModule($companyId)) {
            return ApiResponse::error('Client portal module is not enabled for this company.', 403);
        }

        // Per-company seat limit check — only matters if portal is being enabled
        if (!empty($data['enable_portal'])) {
            $seat = $this->seatInfo($companyId);
            if (!$seat['can_add']) {
                return ApiResponse::error(
                    "Seat limit reached for this company ({$seat['portal_used']}/{$seat['limit']}). Upgrade your package.",
                    422
                );
            }

            // A Company Admin or non-client staff email must never become a
            // portal-login User row — checked before the Client row itself
            // is created so nothing is left half-created.
            if (!empty($data['portal_email']) && $this->emailBelongsToAnotherAccount($data['portal_email'])) {
                return ApiResponse::error('This email is already registered as a staff or Company Admin account.', 422);
            }
        }

        $client = Client::create([
            'company_id'    => $companyId,
            'name'          => $data['name'],
            'email'         => $data['email'] ?? null,
            'phone'         => $data['phone'] ?? null,
            'company_name'  => $data['company_name'] ?? null,
            'address'       => $data['address'] ?? null,
            'notes'         => $data['notes'] ?? null,
            'status'        => $data['status'] ?? 'active',
            'portal_access' => false,
        ]);

        $this->seedPermissions($client->id);

        if (!empty($data['enable_portal']) && !empty($data['portal_email'])) {
            $error = $this->createOrUpdatePortalUser($client, $data['portal_email'], $data['portal_password']);
            if ($error) {
                return ApiResponse::error($error, 422);
            }

            // Portal login details only ever go out when Portal Access is
            // actually enabled at creation — a client created without it
            // gets no email at all. Non-blocking: a mail failure must never
            // fail the client creation itself (same pattern as PublicController::register()'s WelcomeMail).
            try {
                Mail::to($data['portal_email'])->send(new ClientPortalWelcomeMail(
                    $client, $client->company ?? Company::find($companyId), $data['portal_email'], $data['portal_password']
                ));
            } catch (\Throwable) {
                // Don't fail client creation if mail fails
            }
        }

        $client->load(['user:id,email,is_active', 'company:id,name']);

        return ApiResponse::success($client, 'Client created successfully');
    }

    // =========================================================================
    // PUT /api/admin/clients/{id}
    // =========================================================================
    public function update(Request $request, int $id): JsonResponse
    {
        $client = Client::whereIn('company_id', $this->companyIds())->findOrFail($id);

        $data = $request->validate([
            'name'         => 'sometimes|required|string|max:150',
            'email'        => 'nullable|email|max:255',
            'phone'        => 'nullable|string|max:30',
            'company_name' => 'nullable|string|max:150',
            'address'      => 'nullable|string|max:500',
            'notes'        => 'nullable|string|max:1000',
            'status'       => 'nullable|in:active,inactive,blocked',
        ]);

        // Same guard as store() — see emailBelongsToAnotherAccount().
        if (!empty($data['email']) && $data['email'] !== $client->email && $this->emailBelongsToAnotherAccount($data['email'])) {
            return ApiResponse::error('This email is already registered as a staff or Company Admin account.', 422);
        }

        $client->update($data);
        $client->load(['user:id,email,is_active', 'company:id,name']);

        return ApiResponse::success($client, 'Client updated');
    }

    // =========================================================================
    // DELETE /api/admin/clients/{id}
    // =========================================================================
    // Soft delete (Client uses SoftDeletes — deleted_at, not a real row
    // removal) — deliberately NOT a hard delete: invoices.client_id and
    // projects.client_id both reference clients, and invoices specifically
    // CASCADEs on an actual SQL DELETE (see 2026_06_27_081949_make_client_id_
    // nullable_on_invoices.php), which would wipe the client's entire billing
    // history. A soft delete only ever UPDATEs deleted_at, so that FK cascade
    // never fires — the client just stops showing up in normal queries
    // (Eloquent's default SoftDeletes scope) while every invoice/project
    // record stays intact. Also deactivates the linked portal login (if any)
    // so a "deleted" client can't still sign in to the Client Portal.
    public function destroy(int $id): JsonResponse
    {
        $client = Client::whereIn('company_id', $this->companyIds())->findOrFail($id);

        if ($client->user_id) {
            User::where('id', $client->user_id)->update(['is_active' => false]);
        }

        $client->delete();

        return ApiResponse::success(null, 'Client deleted');
    }

    // =========================================================================
    // PUT /api/admin/clients/{id}/permissions
    // =========================================================================
    public function updatePermissions(Request $request, int $id): JsonResponse
    {
        $client = Client::whereIn('company_id', $this->companyIds())->findOrFail($id);

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

    // =========================================================================
    // POST /api/admin/clients/{id}/enable-portal
    // =========================================================================
    public function enablePortal(Request $request, int $id): JsonResponse
    {
        $request->validate([
            'portal_email'    => 'required|email|max:255',
            'portal_password' => 'required|string|min:6|max:100',
        ]);

        $client = Client::whereIn('company_id', $this->companyIds())->findOrFail($id);

        // A Company Admin or non-client staff email must never become a
        // portal-login User row — see the matching check in store().
        if ($this->emailBelongsToAnotherAccount($request->portal_email)) {
            return ApiResponse::error('This email is already registered as a staff or Company Admin account.', 422);
        }

        // Per-company seat check — only when creating a brand-new portal user
        if (!$client->portal_access) {
            $seat = $this->seatInfo($client->company_id);
            if (!$seat['can_add']) {
                return ApiResponse::error(
                    "Seat limit reached for this company ({$seat['portal_used']}/{$seat['limit']}). Upgrade your package.",
                    422
                );
            }
        }

        $error = $this->createOrUpdatePortalUser($client, $request->portal_email, $request->portal_password);
        if ($error) {
            return ApiResponse::error($error, 422);
        }
        $this->seedPermissions($client->id);

        // Same login-details email as store()'s enable_portal path — a
        // client whose portal is enabled later (not at creation) still needs
        // their credentials. Non-blocking: never fails this action.
        try {
            Mail::to($request->portal_email)->send(new ClientPortalWelcomeMail(
                $client, $client->company ?? Company::find($client->company_id), $request->portal_email, $request->portal_password
            ));
        } catch (\Throwable) {
            // Don't fail portal enablement if mail fails
        }

        return ApiResponse::success([
            'client_id'    => $client->id,
            'portal_email' => $request->portal_email,
        ], 'Portal access enabled');
    }

    // =========================================================================
    // POST /api/admin/clients/{id}/disable-portal
    // =========================================================================
    public function disablePortal(int $id): JsonResponse
    {
        $client = Client::whereIn('company_id', $this->companyIds())->findOrFail($id);
        $client->update(['portal_access' => false]);

        return ApiResponse::success(null, 'Portal access disabled');
    }
}
