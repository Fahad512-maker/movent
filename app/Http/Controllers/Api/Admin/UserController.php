<?php

namespace App\Http\Controllers\Api\Admin;

use App\Helpers\ApiResponse;
use App\Http\Controllers\Controller;
use App\Http\Resources\UserResource;
use App\Models\Company;
use App\Models\CompanyUserAssignment;
use App\Models\Deliverable;
use App\Models\Project;
use App\Models\SystemAuditLog;
use App\Models\Task;
use App\Models\Timesheet;
use App\Models\User;
use App\Models\UserCompanyPermission;
use App\Models\UserPermission;
use App\Services\ModuleCatalog;
use App\Services\RoleDefaultPermissions;
use App\Support\CrossAccountEmail;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;

class UserController extends Controller
{
    private const VALID_ROLES = [
        'seller', 'client', 'hr', 'finance', 'project_manager', 'production',
        'invoice_admin', 'invoice_manager', 'invoice_creator', 'invoice_viewer', 'payment_manager',
        // Role-based default permissions roles (Add/Edit User "Select Role") —
        // see App\Services\RoleDefaultPermissions::roleOptions() for the
        // current pickable list; the 5 invoice_* / payment_manager values
        // above are legacy and no longer offered as new picks but still
        // validate so existing users keep them.
        'developer', 'designer', 'qa', 'team_member', 'viewer', 'compliance', 'invoice_user', 'company_admin',
        'lead_manager',
    ];

    private function admin()
    {
        return auth('admin')->user();
    }

    // role_type is purely descriptive (nothing checks it for access control —
    // real enforcement is the granular UserCompanyPermission rows). The admin
    // can now pick it explicitly (validated request field); this auto-derive
    // is only a fallback for callers that don't send one.
    private function roleTypeFromAssignments(array $assignments): string
    {
        // role_type is a strict DB enum (see VALID_ROLES) — catalog module keys
        // (e.g. 'project_management', 'sales') don't match it 1:1, so map to the
        // closest valid value instead of writing the raw key straight through.
        $moduleToRole = [
            'sales'              => 'seller',
            'client'             => 'client',
            'hr'                 => 'hr',
            'finance'            => 'finance',
            'project_management' => 'project_manager',
            'production'         => 'production',
            'invoice'            => 'invoice_manager',
        ];

        foreach ($assignments as $assignment) {
            foreach (($assignment['permissions'] ?? []) as $moduleKey => $permKeys) {
                if (!empty($permKeys) && isset($moduleToRole[$moduleKey])) {
                    return $moduleToRole[$moduleKey];
                }
            }
        }

        return 'seller';
    }

    private function companyIds(): array
    {
        return $this->admin()->companies()->pluck('id')->toArray();
    }

    // Count distinct users linked to any of this admin's companies via an
    // ACTIVE assignment — a user suspended in every company they belong to
    // must free up their seat (status='active' filter), and a user counted
    // once here even if active in several of this admin's companies at once
    // (distinct user_id) so multi-company membership never double-charges a seat.
    private function orgUserCount(): int
    {
        $companyIds = $this->companyIds();
        return CompanyUserAssignment::whereIn('company_id', $companyIds)
            ->where('status', 'active')
            ->distinct('user_id')
            ->count('user_id') + 1; // +1 for the admin themselves
    }

    private function orgUserLimit(): ?int
    {
        $admin = $this->admin()->load('package');

        // The seat count chosen (and paid for) at registration takes
        // precedence over the shared Package's default — falls back to the
        // Package limit only for admins registered before this column existed.
        return $admin->max_users_per_company ?? $admin->package?->max_users_per_company;
    }

    // Standardized seat-limit-reached message — used at every seat-gated
    // action (create, invite, link existing user, reactivate) so the admin
    // sees the same wording (and actual numbers) everywhere.
    private function seatLimitMessage(int $used, int $limit): string
    {
        return "Seat limit reached. You have used {$used} of {$limit} seats. Please upgrade your plan to add more users.";
    }

    // Check if this admin can manage a given user (user belongs to at least one of their companies).
    private function canManageUser(User $user): bool
    {
        $companyIds = $this->companyIds();
        return in_array($user->company_id, $companyIds)
            || CompanyUserAssignment::where('user_id', $user->id)
                   ->whereIn('company_id', $companyIds)
                   ->exists();
    }

    // Picks which of the admin's own companies a per-company action (remove,
    // toggle status, activity) applies to for this user — an explicit request
    // param when given (validated against the admin's own companies), else the
    // first assignment the admin actually owns.
    private function resolveCompanyId(User $user, ?int $requested = null): ?int
    {
        $companyIds = $this->companyIds();

        if ($requested !== null && in_array($requested, $companyIds)) {
            return $requested;
        }

        return CompanyUserAssignment::where('user_id', $user->id)
            ->whereIn('company_id', $companyIds)
            ->value('company_id') ?? (in_array($user->company_id, $companyIds) ? $user->company_id : null);
    }

    // When a user's primary company_id needs to move (their old primary was
    // just removed/suspended), prefer another company still owned by THIS
    // admin over one owned by a different admin entirely — otherwise the
    // account would be silently repointed to a company this admin can't see.
    private function pickReassignmentCompanyId(User $user, int $excludingCompanyId): ?int
    {
        $companyIds = $this->companyIds();
        $active = CompanyUserAssignment::where('user_id', $user->id)
            ->where('company_id', '!=', $excludingCompanyId)
            ->where('status', 'active')
            ->pluck('company_id');

        $ownedFirst = $active->first(fn ($cid) => in_array($cid, $companyIds));

        return $ownedFirst ?? $active->first();
    }

    private function logAudit(Request $request, ?int $companyId, string $action, string $entityType, ?int $entityId, array $old = [], array $new = []): void
    {
        SystemAuditLog::create([
            'company_id'  => $companyId,
            'user_id'     => null, // SystemAuditLog.user_id FKs to `users`; Company Admin actor isn't a User row
            'action'      => $action,
            'module_key'  => 'users',
            'entity_type' => $entityType,
            'entity_id'   => $entityId,
            'old_values'  => $old ?: null,
            'new_values'  => $new ?: null,
            'ip_address'  => $request->ip(),
            'user_agent'  => $request->userAgent(),
        ]);
    }

    // ── List users ────────────────────────────────────────────────────────────

    public function index(Request $request): JsonResponse
    {
        $companyIds = $this->companyIds();

        // Include users assigned to any of the admin's companies (not just primary company)
        $userIds = CompanyUserAssignment::whereIn('company_id', $companyIds)
            ->pluck('user_id')
            ->unique()
            ->values()
            ->toArray();

        $query = User::with([
                // Scoped to the admin's own companies only — a user who also
                // belongs to a company outside this admin's org must never
                // leak that other membership/permissions in this response.
                'companyAssignments' => fn ($q) => $q->whereIn('company_id', $companyIds)->with('company:id,name'),
                'userCompanyPermissions' => fn ($q) => $q->whereIn('company_id', $companyIds),
                'company:id,name',
                'createdBy:id,name',
            ])
            ->whereIn('id', $userIds);

        if ($request->filled('status')) {
            $query->where('status', $request->string('status'));
        }

        $users = $query->latest()->get();

        // Never surface a "primary company" the admin doesn't own.
        $users->each(function (User $u) use ($companyIds) {
            if ($u->company_id && !in_array($u->company_id, $companyIds)) {
                $u->setRelation('company', null);
            }
        });

        return ApiResponse::success([
            'users' => UserResource::collection($users),
            'count' => $users->count(),
            'used'  => $this->orgUserCount(),
            'limit' => $this->orgUserLimit(),
        ]);
    }

    // ── Companies + modules list for the add-user form ────────────────────────

    public function companyOptions(): JsonResponse
    {
        $companies = Company::whereIn('id', $this->companyIds())
            ->select('id', 'name')
            ->orderBy('id')
            ->get()
            ->map(function (Company $c) {
                return [
                    'id'      => $c->id,
                    'name'    => $c->name,
                    'modules' => $c->modules()
                        ->where('is_enabled', true)
                        ->pluck('module_key')
                        ->toArray(),
                ];
            });

        return ApiResponse::success($companies);
    }

    // ── Check if email already exists ─────────────────────────────────────────

    public function checkEmail(Request $request): JsonResponse
    {
        $validated = $request->validate(['email' => ['required', 'email']]);

        // Mirrors the block store()/invite() already enforce — surfaced here
        // too so the live "already exists" hint doesn't stay silent for an
        // email that would actually be rejected on submit.
        if (CrossAccountEmail::existsAsAdmin($validated['email'])) {
            return ApiResponse::success(['exists' => true, 'is_admin' => true, 'name' => null, 'status' => null]);
        }

        // withTrashed(): a soft-deleted user (removed from their last
        // company — see destroy()) still occupies this email in the
        // database's unique index. Without withTrashed() here this reports
        // "available" for an email store()/invite() will then reject with a
        // raw duplicate-key SQL error instead of the intended "link/restore"
        // flow.
        $existing  = User::withTrashed()->where('email', $validated['email'])->first();

        return ApiResponse::success([
            'exists'   => (bool) $existing,
            'is_admin' => false,
            'name'     => $existing?->name,
            'status'   => $existing?->status,
        ]);
    }

    // ── Create user (direct, admin sets password) ─────────────────────────────
    //
    // Rule 1-4: Check if the email already exists.
    //   - If exists + already in requested company → 422 error.
    //   - If exists + not in company → just add the assignment (no new user created).
    //   - If not exists → create user and add assignment.

    public function store(Request $request): JsonResponse
    {
        $companyIds = $this->companyIds();

        $validated = $request->validate([
            'name'                              => ['required', 'string', 'max:150'],
            'email'                             => ['required', 'email'],
            'password'                          => ['nullable', 'string', 'min:8'],
            'role_type'                         => ['nullable', 'string', 'in:' . implode(',', self::VALID_ROLES)],
            // Display-only override for a "Custom Role" (e.g. "Marketing
            // Lead") — role_type above still carries the real permission/
            // behavior bucket this custom role is based on; this is purely
            // what gets shown instead of the generic role_type label.
            'custom_role_label'                 => ['nullable', 'string', 'max:100'],
            'company_assignments'               => ['nullable', 'array'],
            'company_assignments.*.company_id'   => ['required', 'integer', 'in:' . implode(',', $companyIds)],
            'company_assignments.*.permissions'  => ['nullable', 'array'],
            'company_assignments.*.data_scopes'  => ['nullable', 'array'],
        ]);

        $assignments   = $this->withRoleDefaultPermissions($validated['company_assignments'] ?? [], $validated['role_type'] ?? null);
        $defaultCompId = $assignments[0]['company_id'] ?? $companyIds[0] ?? null;
        if (!$defaultCompId) return ApiResponse::error('No company found', 404);

        // withTrashed(): a user soft-deleted after being removed from their
        // last company (see destroy()) still holds this email in the
        // database's unique index — without this, $existingUser comes back
        // null and the User::create() below throws a raw duplicate-key SQL
        // error instead of restoring and linking them like any other
        // existing user.
        $existingUser = User::withTrashed()->where('email', $validated['email'])->first();

        if ($existingUser) {
            if ($existingUser->trashed()) {
                $existingUser->restore();
            }

            // Rule 4: Error if user is already in any of the requested companies.
            foreach ($assignments as $a) {
                $alreadyLinked = CompanyUserAssignment::where('user_id', $existingUser->id)
                    ->where('company_id', $a['company_id'])
                    ->exists();
                if ($alreadyLinked) {
                    return ApiResponse::error('This user is already added to this company.', 422);
                }
            }

            // Rule 11: Check seat limit before adding existing user to a new company.
            $limit = $this->orgUserLimit();
            $used  = $this->orgUserCount();
            if ($limit !== null && $used >= $limit) {
                return ApiResponse::error($this->seatLimitMessage($used, $limit), 422);
            }

            // Rule 2: Link existing user to the new company (no new User row created).
            $this->saveAssignments($existingUser, $assignments);
            foreach ($assignments as $a) {
                $this->logAudit($request, $a['company_id'], 'user.linked_to_company', 'User', $existingUser->id, [], ['email' => $existingUser->email]);
            }

            return ApiResponse::success(
                new UserResource($existingUser->load(['companyAssignments.company:id,name', 'userCompanyPermissions', 'company:id,name'])),
                'User linked to company',
                200
            );
        }

        // An email that's already a Company Admin account must never also
        // become a User row — the two guards would otherwise silently race
        // at login time depending on which table matches first.
        if (CrossAccountEmail::existsAsAdmin($validated['email'])) {
            return ApiResponse::error('This email is already registered as a Company Admin account.', 422);
        }

        // Rule 3: New user — password required.
        if (empty($validated['password'])) {
            return ApiResponse::error('Password is required when adding a new user.', 422);
        }

        // Rule 11: Seat limit check for new user creation.
        $limit = $this->orgUserLimit();
        $used  = $this->orgUserCount();
        if ($limit !== null && $used >= $limit) {
            return ApiResponse::error($this->seatLimitMessage($used, $limit), 422);
        }

        $user = User::create([
            'company_id'        => $defaultCompId,
            'name'              => $validated['name'],
            'email'             => $validated['email'],
            'password'          => $validated['password'],
            'role_type'         => $validated['role_type'] ?? $this->roleTypeFromAssignments($assignments),
            'custom_role_label' => $validated['custom_role_label'] ?? null,
            'is_active'         => true,
            'status'            => 'active',
        ]);

        $this->saveAssignments($user, $assignments);
        foreach ($assignments as $a) {
            $this->logAudit($request, $a['company_id'], 'user.created', 'User', $user->id, [], ['name' => $user->name, 'email' => $user->email]);
        }

        return ApiResponse::success(
            new UserResource($user->load(['companyAssignments.company:id,name', 'userCompanyPermissions', 'company:id,name'])),
            'User created',
            201
        );
    }

    // ── Invite user (token, user sets own password) ───────────────────────────

    public function invite(Request $request): JsonResponse
    {
        $companyIds = $this->companyIds();

        $validated = $request->validate([
            'name'                              => ['required', 'string', 'max:150'],
            'email'                             => ['required', 'email'],
            'role_type'                         => ['nullable', 'string', 'in:' . implode(',', self::VALID_ROLES)],
            'custom_role_label'                 => ['nullable', 'string', 'max:100'],
            'company_assignments'               => ['nullable', 'array'],
            'company_assignments.*.company_id'   => ['required', 'integer', 'in:' . implode(',', $companyIds)],
            'company_assignments.*.permissions'  => ['nullable', 'array'],
            'company_assignments.*.data_scopes'  => ['nullable', 'array'],
        ]);

        $assignments   = $this->withRoleDefaultPermissions($validated['company_assignments'] ?? [], $validated['role_type'] ?? null);
        $defaultCompId = $assignments[0]['company_id'] ?? $companyIds[0] ?? null;
        if (!$defaultCompId) return ApiResponse::error('No company found', 404);

        // withTrashed() — see the matching comment in store(); same reason.
        $existingUser = User::withTrashed()->where('email', $validated['email'])->first();

        if ($existingUser) {
            if ($existingUser->trashed()) {
                $existingUser->restore();
            }

            // Rule 4: Already in this company.
            foreach ($assignments as $a) {
                $alreadyLinked = CompanyUserAssignment::where('user_id', $existingUser->id)
                    ->where('company_id', $a['company_id'])
                    ->exists();
                if ($alreadyLinked) {
                    return ApiResponse::error('This user is already added to this company.', 422);
                }
            }

            $limit = $this->orgUserLimit();
            $used  = $this->orgUserCount();
            if ($limit !== null && $used >= $limit) {
                return ApiResponse::error($this->seatLimitMessage($used, $limit), 422);
            }

            // Rule 2: Link existing user — no invite needed.
            $this->saveAssignments($existingUser, $assignments);
            foreach ($assignments as $a) {
                $this->logAudit($request, $a['company_id'], 'user.linked_to_company', 'User', $existingUser->id, [], ['email' => $existingUser->email]);
            }

            return ApiResponse::success(
                new UserResource($existingUser->load(['companyAssignments.company:id,name', 'userCompanyPermissions', 'company:id,name'])),
                'User linked to company',
                200
            );
        }

        // An email that's already a Company Admin account must never also
        // become a User row — see the matching check in store().
        if (CrossAccountEmail::existsAsAdmin($validated['email'])) {
            return ApiResponse::error('This email is already registered as a Company Admin account.', 422);
        }

        $limit = $this->orgUserLimit();
        $used  = $this->orgUserCount();
        if ($limit !== null && $used >= $limit) {
            return ApiResponse::error($this->seatLimitMessage($used, $limit), 422);
        }

        $user = User::create([
            'company_id'           => $defaultCompId,
            'name'                 => $validated['name'],
            'email'                => $validated['email'],
            'password'             => Hash::make(Str::random(32)),
            'role_type'            => $validated['role_type'] ?? $this->roleTypeFromAssignments($assignments),
            'custom_role_label'    => $validated['custom_role_label'] ?? null,
            'is_active'            => false,
            'status'               => 'invited',
            'invite_token'         => Str::random(64),
            'invite_expires_at'    => now()->addDays(7),
            'must_change_password' => true,
        ]);

        $this->saveAssignments($user, $assignments);
        foreach ($assignments as $a) {
            $this->logAudit($request, $a['company_id'], 'user.invited', 'User', $user->id, [], ['name' => $user->name, 'email' => $user->email]);
        }

        return ApiResponse::success(
            new UserResource($user->load(['companyAssignments.company:id,name', 'userCompanyPermissions', 'company:id,name'])),
            'Invite created',
            201
        );
    }

    // ── Resend invite ─────────────────────────────────────────────────────────

    public function resendInvite(Request $request, User $user): JsonResponse
    {
        if (!$this->canManageUser($user)) {
            return ApiResponse::error('Not found', 404);
        }
        if ($user->status !== 'invited') {
            return ApiResponse::error('User has already accepted the invite', 422);
        }

        $user->update([
            'invite_token'      => Str::random(64),
            'invite_expires_at' => now()->addDays(7),
        ]);

        $this->logAudit($request, $this->resolveCompanyId($user), 'invite.sent', 'User', $user->id);

        return ApiResponse::success(
            new UserResource($user->load(['companyAssignments.company:id,name', 'userCompanyPermissions', 'company:id,name'])),
            'Invite link refreshed'
        );
    }

    // ── Toggle active/suspended ───────────────────────────────────────────────

    public function toggleStatus(Request $request, User $user): JsonResponse
    {
        if (!$this->canManageUser($user)) {
            return ApiResponse::error('Not found', 404);
        }
        if ($user->status === 'invited') {
            return ApiResponse::error('Cannot suspend a pending invite. Remove the user instead.', 422);
        }

        $validated = $request->validate([
            'status'     => ['required', 'in:active,suspended'],
            'company_id' => ['nullable', 'integer'],
        ]);

        $companyId = $this->resolveCompanyId($user, $validated['company_id'] ?? null);
        if (!$companyId) {
            return ApiResponse::error('No company found for this user', 404);
        }

        // Reactivating (suspended → active): only a genuine seat concern if
        // this user isn't already counted via another active assignment
        // under this admin — reactivating a second company for someone
        // already active elsewhere doesn't add a new seat (orgUserCount()
        // dedupes by user_id).
        if ($validated['status'] === 'active') {
            $alreadyCountedElsewhere = CompanyUserAssignment::where('user_id', $user->id)
                ->where('company_id', '!=', $companyId)
                ->where('status', 'active')
                ->exists();
            if (!$alreadyCountedElsewhere) {
                $limit = $this->orgUserLimit();
                $used  = $this->orgUserCount();
                if ($limit !== null && $used >= $limit) {
                    return ApiResponse::error($this->seatLimitMessage($used, $limit), 422);
                }
            }
        }

        // Scoped to THIS company only — a user suspended by one admin must
        // keep working normally in any other company they belong to.
        CompanyUserAssignment::where('user_id', $user->id)
            ->where('company_id', $companyId)
            ->update(['status' => $validated['status']]);

        // Global users.is_active/status is a rollup: active if any assignment
        // is still active, suspended only when every assignment is suspended.
        // Permission checks throughout the app key off users.company_id (the
        // "primary" company) — if we just suspended that one and another
        // active company remains, repoint it so the account stays usable there.
        $anyActive = CompanyUserAssignment::where('user_id', $user->id)->where('status', 'active')->exists();

        $update = [
            'is_active' => $anyActive,
            'status'    => $anyActive ? 'active' : 'suspended',
        ];
        if ($validated['status'] === 'suspended' && $user->company_id === $companyId) {
            $reassignTo = $this->pickReassignmentCompanyId($user, $companyId);
            if ($reassignTo) {
                $update['company_id'] = $reassignTo;
            }
        }
        $user->update($update);

        $this->logAudit(
            $request, $companyId,
            $validated['status'] === 'active' ? 'user.activated' : 'user.deactivated',
            'User', $user->id, [], ['status' => $validated['status']]
        );

        return ApiResponse::success(
            new UserResource($user->load(['companyAssignments.company:id,name', 'userCompanyPermissions', 'company:id,name'])),
            'Status updated'
        );
    }

    // ── Single user ───────────────────────────────────────────────────────────

    public function show(User $user): JsonResponse
    {
        if (!$this->canManageUser($user)) {
            return ApiResponse::error('Not found', 404);
        }

        $companyIds = $this->companyIds();
        $user->load([
            'companyAssignments' => fn ($q) => $q->whereIn('company_id', $companyIds)->with('company:id,name'),
            'userCompanyPermissions' => fn ($q) => $q->whereIn('company_id', $companyIds),
            'company:id,name',
            'createdBy:id,name',
        ]);
        if ($user->company_id && !in_array($user->company_id, $companyIds)) {
            $user->setRelation('company', null);
        }

        return ApiResponse::success(new UserResource($user));
    }

    // ── Update basic info ─────────────────────────────────────────────────────

    public function update(Request $request, User $user): JsonResponse
    {
        if (!$this->canManageUser($user)) {
            return ApiResponse::error('Not found', 404);
        }

        $validated = $request->validate([
            'name'      => ['sometimes', 'string', 'max:150'],
            'email'     => [
                'sometimes', 'email', 'unique:users,email,' . $user->id,
                function ($attribute, $value, $fail) {
                    if (CrossAccountEmail::existsAsAdmin($value)) {
                        $fail('This email is already registered as a Company Admin account.');
                    }
                },
            ],
            'password'          => ['nullable', 'string', 'min:8'],
            'role_type'         => ['sometimes', 'string', 'in:' . implode(',', self::VALID_ROLES)],
            'custom_role_label' => ['nullable', 'string', 'max:100'],
            'phone'             => ['nullable', 'string', 'max:30'],
            'is_active'         => ['sometimes', 'boolean'],
        ]);

        if (empty($validated['password'])) unset($validated['password']);

        $oldRoleType = $user->role_type;
        $user->update($validated);

        $companyId = $this->resolveCompanyId($user);
        $loggable  = collect($validated)->except('password')->toArray();
        if (isset($validated['role_type']) && $validated['role_type'] !== $oldRoleType) {
            $this->logAudit($request, $companyId, 'user.role_changed', 'User', $user->id, ['role_type' => $oldRoleType], ['role_type' => $validated['role_type']]);
        } else {
            $this->logAudit($request, $companyId, 'user.updated', 'User', $user->id, [], $loggable);
        }

        return ApiResponse::success(
            new UserResource($user->load(['companyAssignments.company:id,name', 'userCompanyPermissions', 'company:id,name'])),
            'User updated'
        );
    }

    // ── Delete user ───────────────────────────────────────────────────────────

    public function destroy(Request $request, User $user): JsonResponse
    {
        if (!$this->canManageUser($user)) {
            return ApiResponse::error('Not found', 404);
        }

        $validated = $request->validate(['company_id' => ['nullable', 'integer']]);
        $companyId = $this->resolveCompanyId($user, $validated['company_id'] ?? null);
        if (!$companyId) {
            return ApiResponse::error('No company found for this user', 404);
        }

        // Remove ONLY this company's membership — a user who belongs to
        // another company as well must keep that access. FK cascade on
        // company_user_id already clears matching permission rows; also
        // clear any legacy rows keyed by the raw (user_id, company_id) pair.
        CompanyUserAssignment::where('user_id', $user->id)->where('company_id', $companyId)->delete();
        UserCompanyPermission::where('user_id', $user->id)->where('company_id', $companyId)->delete();

        $remaining = CompanyUserAssignment::where('user_id', $user->id)->first();

        if (!$remaining) {
            // No company left at all — the global account has nothing to belong to.
            $user->delete();
        } elseif ($user->company_id === $companyId) {
            // Their "primary" company_id — which every permission check in
            // this app reads — just lost its membership row. Repoint it to a
            // company they still belong to (preferring one this admin also
            // owns), or the account is left silently scoped to a company
            // they were just removed from.
            $reassignTo = $this->pickReassignmentCompanyId($user, $companyId) ?? $remaining->company_id;
            $user->update(['company_id' => $reassignTo]);
        }

        $this->logAudit($request, $companyId, 'user.removed_from_company', 'User', $user->id, [], ['email' => $user->email]);

        return ApiResponse::success(null, 'User removed');
    }

    // ── Reset password (admin-triggered, shows the new password once) ─────────

    public function resetPassword(Request $request, User $user): JsonResponse
    {
        if (!$this->canManageUser($user)) {
            return ApiResponse::error('Not found', 404);
        }
        if ($user->status === 'invited') {
            return ApiResponse::error('User has not accepted their invite yet — resend the invite instead.', 422);
        }

        $plain = Str::random(12);
        $user->update([
            'password'              => Hash::make($plain),
            'must_change_password'  => true,
        ]);

        $this->logAudit($request, $this->resolveCompanyId($user), 'user.password_reset_sent', 'User', $user->id);

        return ApiResponse::success(['password' => $plain], 'Password reset — share this with the user once, it will not be shown again');
    }

    // ── Per-user activity / workload (Project Management), read-only ──────────

    public function activity(Request $request, User $user): JsonResponse
    {
        if (!$this->canManageUser($user)) {
            return ApiResponse::error('Not found', 404);
        }

        $companyId = $this->resolveCompanyId($user, $request->integer('company_id') ?: null);
        if (!$companyId) {
            return ApiResponse::error('No company found for this user', 404);
        }

        $pmModuleKeys = ['projects', 'tasks', 'timesheets', 'production', 'revisions', 'deliverables', 'team_resources', 'file_storage'];
        $companyModules = Company::find($companyId)?->modules()->where('is_enabled', true)->pluck('module_key')->toArray() ?? [];
        $pmActive = !empty(array_intersect($pmModuleKeys, $companyModules));

        $result = ['project_management_active' => $pmActive];

        if ($pmActive) {
            $result['assigned_tasks'] = Task::where('assigned_to', $user->id)
                ->whereHas('project', fn ($q) => $q->where('company_id', $companyId))
                ->select('id', 'title', 'status', 'project_id')
                ->limit(50)->get();

            $result['managed_projects'] = Project::where('company_id', $companyId)
                ->where('project_manager_id', $user->id)
                ->select('id', 'name', 'status')
                ->get();

            $result['member_projects'] = Project::where('company_id', $companyId)
                ->whereHas('teamMembers', fn ($q) => $q->where('user_id', $user->id))
                ->select('id', 'name', 'status')
                ->get();

            $result['timesheets'] = Timesheet::where('user_id', $user->id)
                ->whereHas('task.project', fn ($q) => $q->where('company_id', $companyId))
                ->select('id', 'task_id', 'hours_logged', 'status', 'log_date')
                ->limit(50)->get();

            $result['deliverables'] = Deliverable::where('uploaded_by', $user->id)
                ->whereHas('project', fn ($q) => $q->where('company_id', $companyId))
                ->select('id', 'title', 'status', 'project_id')
                ->limit(50)->get();
        }

        $result['audit_logs'] = SystemAuditLog::where('user_id', $user->id)
            ->orWhere(function ($q) use ($user, $companyId) {
                // Company Admin actions about this user are logged with user_id=null
                // (Admin isn't a `users` row) — surface those by entity instead.
                $q->where('entity_type', 'User')->where('entity_id', $user->id)->where('company_id', $companyId);
            })
            ->orderByDesc('created_at')
            ->limit(30)
            ->get(['id', 'action', 'module_key', 'entity_type', 'entity_id', 'created_at']);

        return ApiResponse::success($result);
    }

    // ── Get permissions for one company ──────────────────────────────────────

    // GET /admin/users/role-defaults?role=X&company_id=Y — default permission
    // map for a role, filtered to only the modules that company has purchased.
    // Single source of truth for Add/Edit User's "select role, auto-check
    // permissions" behavior (App\Services\RoleDefaultPermissions).
    public function roleDefaults(Request $request): JsonResponse
    {
        $companyIds = $this->companyIds();

        $validated = $request->validate([
            'role'       => ['required', 'string', 'in:' . implode(',', self::VALID_ROLES)],
            'company_id' => ['required', 'integer', 'in:' . implode(',', $companyIds)],
        ]);

        $rawDbModules = Company::find($validated['company_id'])
            ->modules()
            ->where('is_enabled', true)
            ->pluck('module_key')
            ->toArray();

        $catalogModules = array_values(array_unique(array_map(
            fn ($k) => ModuleCatalog::dbKeyToCatalog($k),
            $rawDbModules
        )));

        $defaults = \App\Services\RoleDefaultPermissions::forRole($validated['role'], $catalogModules);

        return ApiResponse::success(['permissions' => $defaults]);
    }

    // GET /admin/users/roles — the pickable role list for the "Select Role" dropdown.
    public function roleOptions(): JsonResponse
    {
        return ApiResponse::success(\App\Services\RoleDefaultPermissions::roleOptions());
    }

    public function getCompanyPermissions(User $user, int $companyId): JsonResponse
    {
        $orgCompanyIds = $this->companyIds();
        if (!$this->canManageUser($user) || !in_array($companyId, $orgCompanyIds)) {
            return ApiResponse::error('Not found', 404);
        }

        $assignment = CompanyUserAssignment::where('user_id', $user->id)
            ->where('company_id', $companyId)
            ->first();

        $query = UserCompanyPermission::where('user_id', $user->id)
            ->where('company_id', $companyId);

        // Rule 7: prefer filtering by company_user_id when available
        if ($assignment) {
            $query = UserCompanyPermission::where('company_user_id', $assignment->id);
        }

        $rows = $query->get();

        $perms = $rows->groupBy('module_key')
            ->map(fn ($g) => $g->pluck('permission_key')->toArray())
            ->toArray();

        // Data Scope is descriptive-only (like role_type) — shown for clarity,
        // never used to filter any module's actual query results.
        $dataScopes = $rows->groupBy('module_key')
            ->map(fn ($g) => $g->first()->data_scope)
            ->filter()
            ->toArray();

        return ApiResponse::success(['permissions' => $perms, 'data_scopes' => $dataScopes]);
    }

    // ── Update permissions for one company ────────────────────────────────────

    public function updateCompanyPermissions(Request $request, User $user, int $companyId): JsonResponse
    {
        $orgCompanyIds = $this->companyIds();
        if (!$this->canManageUser($user) || !in_array($companyId, $orgCompanyIds)) {
            return ApiResponse::error('Not found', 404);
        }

        $validated = $request->validate([
            'permissions'   => ['required', 'array'],
            'data_scopes'   => ['nullable', 'array'],
            'data_scopes.*' => ['nullable', 'string', 'in:own,assigned,all,view_only,no_access'],
        ]);
        $dataScopes = $validated['data_scopes'] ?? [];
        $permissions = $this->withMandatoryRolePermissionsForCompany(
            $validated['permissions'],
            $user->role_type,
            $companyId
        );

        // Rule 7: get or create the assignment, then store permissions against its ID
        $assignment = CompanyUserAssignment::firstOrCreate(
            ['user_id' => $user->id, 'company_id' => $companyId],
            ['assigned_by' => auth('admin')->id(), 'status' => 'active']
        );

        // Delete existing permissions via company_user_id (cascade) + old-style fallback
        UserCompanyPermission::where('company_user_id', $assignment->id)->delete();
        UserCompanyPermission::where('user_id', $user->id)
            ->where('company_id', $companyId)
            ->delete();

        foreach ($permissions as $moduleKey => $permKeys) {
            foreach ((array) $permKeys as $permKey) {
                if (!ModuleCatalog::isValidPermission($moduleKey, $permKey)) continue;
                UserCompanyPermission::create([
                    'company_user_id' => $assignment->id,
                    'user_id'         => $user->id,
                    'company_id'      => $companyId,
                    'module_key'      => $moduleKey,
                    'permission_key'  => $permKey,
                    'data_scope'      => $dataScopes[$moduleKey] ?? null,
                ]);
            }
        }

        $perms = UserCompanyPermission::where('company_user_id', $assignment->id)
            ->get()
            ->groupBy('module_key')
            ->map(fn ($g) => $g->pluck('permission_key')->toArray())
            ->toArray();

        $this->logAudit($request, $companyId, 'user.permissions_updated', 'User', $user->id, [], ['permissions' => $permissions]);

        return ApiResponse::success(['permissions' => $perms, 'data_scopes' => $dataScopes], 'Permissions updated');
    }

    // ── Legacy: old-style module permissions (keep for backward compat) ───────

    public function syncPermissions(Request $request, User $user): JsonResponse
    {
        if (!$this->canManageUser($user)) {
            return ApiResponse::error('Not found', 404);
        }

        $validated = $request->validate([
            'permissions'              => ['required', 'array'],
            'permissions.*.module_key' => ['required', 'string'],
            'permissions.*.can_view'   => ['boolean'],
            'permissions.*.can_create' => ['boolean'],
            'permissions.*.can_edit'   => ['boolean'],
            'permissions.*.can_delete' => ['boolean'],
            'permissions.*.can_export' => ['boolean'],
        ]);

        $user->permissions()->delete();
        foreach ($validated['permissions'] as $perm) {
            if (!($perm['can_view'] ?? false)) continue;
            UserPermission::create([
                'user_id'    => $user->id,
                'module_key' => $perm['module_key'],
                'can_view'   => true,
                'can_create' => $perm['can_create'] ?? false,
                'can_edit'   => $perm['can_edit']   ?? false,
                'can_delete' => $perm['can_delete']  ?? false,
                'can_export' => $perm['can_export']  ?? false,
            ]);
        }

        return ApiResponse::success(
            new UserResource($user->load(['permissions', 'company:id,name'])),
            'Permissions updated'
        );
    }

    // ── Private helpers ───────────────────────────────────────────────────────

    // Rule 7: permissions are stored against company_user_id (the assignment row ID)
    private function saveAssignments(User $user, array $assignments): void
    {
        $orgCompanyIds = $this->companyIds();

        foreach ($assignments as $assignment) {
            $companyId = $assignment['company_id'];
            if (!in_array($companyId, $orgCompanyIds)) continue;

            // Get or create the assignment row and capture its ID
            $companyUserAssignment = CompanyUserAssignment::firstOrCreate(
                ['user_id' => $user->id, 'company_id' => $companyId],
                ['assigned_by' => auth('admin')->id(), 'status' => 'active']
            );

            // Rule 7: delete old permissions via company_user_id; also clear old-style rows
            UserCompanyPermission::where('company_user_id', $companyUserAssignment->id)->delete();
            UserCompanyPermission::where('user_id', $user->id)
                ->where('company_id', $companyId)
                ->delete();

            $dataScopes = $assignment['data_scopes'] ?? [];

            foreach ($assignment['permissions'] ?? [] as $moduleKey => $permKeys) {
                foreach ((array) $permKeys as $permKey) {
                    if (!ModuleCatalog::isValidPermission($moduleKey, $permKey)) continue;
                    UserCompanyPermission::create([
                        'company_user_id' => $companyUserAssignment->id,
                        'user_id'         => $user->id,
                        'company_id'      => $companyId,
                        'module_key'      => $moduleKey,
                        'permission_key'  => $permKey,
                        'data_scope'      => $dataScopes[$moduleKey] ?? null,
                    ]);
                }
            }
        }
    }

    private function withRoleDefaultPermissions(array $assignments, ?string $role): array
    {
        if (!$role) return $assignments;

        return array_map(function (array $assignment) use ($role) {
            $companyId = $assignment['company_id'] ?? null;
            if (!$companyId) return $assignment;

            $purchasedCatalogModules = Company::find($companyId)?->modules()
                ->where('is_enabled', true)
                ->pluck('module_key')
                ->map(fn ($key) => ModuleCatalog::dbKeyToCatalog($key))
                ->unique()
                ->values()
                ->toArray() ?? [];

            $defaults = RoleDefaultPermissions::forRole($role, $purchasedCatalogModules);
            if (empty($defaults)) return $assignment;

            $permissions = $assignment['permissions'] ?? [];
            foreach ($defaults as $moduleKey => $permKeys) {
                // If the UI already sent this module bucket, respect whatever
                // the admin checked/unchecked. Fill only missing buckets so a
                // role like Lead Manager always gets its default Sales grants
                // when the frontend payload omitted that bucket entirely.
                if (array_key_exists($moduleKey, $permissions)) {
                    if ($role === 'lead_manager' && $moduleKey === 'sales') {
                        $permissions[$moduleKey] = array_values(array_unique(array_merge(
                            (array) $permissions[$moduleKey],
                            $permKeys
                        )));
                    }
                    continue;
                }
                $permissions[$moduleKey] = $permKeys;
            }

            $assignment['permissions'] = $permissions;
            return $assignment;
        }, $assignments);
    }

    private function withMandatoryRolePermissionsForCompany(array $permissions, ?string $role, int $companyId): array
    {
        if ($role !== 'lead_manager') return $permissions;

        $purchasedCatalogModules = Company::find($companyId)?->modules()
            ->where('is_enabled', true)
            ->pluck('module_key')
            ->map(fn ($key) => ModuleCatalog::dbKeyToCatalog($key))
            ->unique()
            ->values()
            ->toArray() ?? [];

        $salesDefaults = RoleDefaultPermissions::forRole($role, $purchasedCatalogModules)['sales'] ?? [];
        if (empty($salesDefaults)) return $permissions;

        $permissions['sales'] = array_values(array_unique(array_merge(
            (array) ($permissions['sales'] ?? []),
            $salesDefaults
        )));

        return $permissions;
    }
}
