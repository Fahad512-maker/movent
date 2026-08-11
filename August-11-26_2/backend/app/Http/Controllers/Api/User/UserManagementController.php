<?php

namespace App\Http\Controllers\Api\User;

use App\Helpers\ApiResponse;
use App\Http\Controllers\Controller;
use App\Http\Resources\UserResource;
use App\Models\Company;
use App\Models\CompanyAdmin;
use App\Models\CompanyUserAssignment;
use App\Models\SystemAuditLog;
use App\Models\User;
use App\Models\UserCompanyPermission;
use App\Services\ModuleCatalog;
use App\Support\CrossAccountEmail;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

// Lets a staff member (e.g. a Project Manager) add a user to their own
// company, gated on a per-module `canAddUsers` permission — mirrors
// Api\Admin\UserController::store()'s existing-user-check flow, but scoped
// to the acting staff member's own company and capped by their own granted
// permissions (a staff member can never hand out access they don't have).
class UserManagementController extends Controller
{
    private function user() { return auth('sanctum')->user(); }

    // module_key => [permission_key, ...] for the acting staff member, in their own company.
    private function myPermissions(): array
    {
        return UserCompanyPermission::where('user_id', $this->user()->id)
            ->where('company_id', $this->user()->company_id)
            ->get()
            ->groupBy('module_key')
            ->map(fn ($g) => $g->pluck('permission_key')->all())
            ->toArray();
    }

    private function canAddUsersAnywhere(array $myPerms): bool
    {
        foreach ($myPerms as $perms) {
            if (in_array('canAddUsers', $perms)) return true;
        }
        return false;
    }

    // Mirrors Api\Admin\UserController::orgUserCount() exactly — see that
    // method's comment for why the status filter and distinct() matter.
    private function orgUserCount(int $adminId): int
    {
        $companyIds = Company::where('admin_id', $adminId)->pluck('id')->toArray();
        return CompanyUserAssignment::whereIn('company_id', $companyIds)
            ->where('status', 'active')
            ->distinct('user_id')
            ->count('user_id') + 1;
    }

    private function orgUserLimit(int $adminId): ?int
    {
        $admin = CompanyAdmin::with('package')->find($adminId);
        return $admin?->max_users_per_company ?? $admin?->package?->max_users_per_company;
    }

    private function seatLimitMessage(int $used, int $limit): string
    {
        return "Seat limit reached. You have used {$used} of {$limit} seats. Please ask your Company Admin to upgrade the plan.";
    }

    public function store(Request $request): JsonResponse
    {
        $me = $this->user();
        $myPerms = $this->myPermissions();

        if (!$this->canAddUsersAnywhere($myPerms)) {
            return ApiResponse::error('Permission denied', 403);
        }

        $validated = $request->validate([
            'name'        => ['required', 'string', 'max:150'],
            'email'       => ['required', 'email'],
            'password'    => ['nullable', 'string', 'min:8'],
            'permissions' => ['nullable', 'array'],
        ]);

        $companyId = $me->company_id;
        $company   = Company::findOrFail($companyId);
        $adminId   = $company->admin_id;

        // withTrashed(): a user soft-deleted after being removed from their
        // last company still holds this email in the database's unique
        // index — without this, $existingUser comes back null and the
        // User::create() below throws a raw duplicate-key SQL error instead
        // of restoring and linking them like any other existing user.
        $existingUser = User::withTrashed()->where('email', $validated['email'])->first();

        if ($existingUser) {
            if ($existingUser->trashed()) {
                $existingUser->restore();
            }

            $alreadyLinked = CompanyUserAssignment::where('user_id', $existingUser->id)
                ->where('company_id', $companyId)
                ->exists();
            if ($alreadyLinked) {
                return ApiResponse::error('This user is already added to this company.', 422);
            }

            $limit = $this->orgUserLimit($adminId);
            $used  = $this->orgUserCount($adminId);
            if ($limit !== null && $used >= $limit) {
                return ApiResponse::error($this->seatLimitMessage($used, $limit), 422);
            }

            $this->grantAssignment($existingUser, $companyId, $validated['permissions'] ?? [], $myPerms);

            SystemAuditLog::create([
                'company_id'  => $companyId,
                'user_id'     => $me->id,
                'action'      => 'user.linked_to_company',
                'module_key'  => 'users',
                'entity_type' => 'User',
                'entity_id'   => $existingUser->id,
                'new_values'  => ['email' => $existingUser->email],
            ]);

            return ApiResponse::success(
                new UserResource($existingUser->load(['companyAssignments.company:id,name', 'userCompanyPermissions', 'company:id,name'])),
                'User linked to company',
                200
            );
        }

        // An email that's already a Company Admin account must never also
        // become a User row — see the matching check in
        // Api\Admin\UserController::store().
        if (CrossAccountEmail::existsAsAdmin($validated['email'])) {
            return ApiResponse::error('This email is already registered as a Company Admin account.', 422);
        }

        if (empty($validated['password'])) {
            return ApiResponse::error('Password is required when adding a new user.', 422);
        }

        $limit = $this->orgUserLimit($adminId);
        $used  = $this->orgUserCount($adminId);
        if ($limit !== null && $used >= $limit) {
            return ApiResponse::error($this->seatLimitMessage($used, $limit), 422);
        }

        $newUser = User::create([
            'company_id' => $companyId,
            'name'       => $validated['name'],
            'email'      => $validated['email'],
            'password'   => $validated['password'],
            'role_type'  => 'seller', // purely descriptive default — matches Api\Admin\UserController's own fallback
            'created_by' => $me->id,
            'is_active'  => true,
            'status'     => 'active',
        ]);

        $this->grantAssignment($newUser, $companyId, $validated['permissions'] ?? [], $myPerms);

        SystemAuditLog::create([
            'company_id'  => $companyId,
            'user_id'     => $me->id,
            'action'      => 'user.created',
            'module_key'  => 'users',
            'entity_type' => 'User',
            'entity_id'   => $newUser->id,
            'new_values'  => ['name' => $newUser->name, 'email' => $newUser->email],
        ]);

        return ApiResponse::success(
            new UserResource($newUser->load(['companyAssignments.company:id,name', 'userCompanyPermissions', 'company:id,name'])),
            'User created',
            201
        );
    }

    // Grants only what the acting staff member actually holds themselves — a
    // PM can never hand out more access than they have. The ability to add
    // users at all was already checked once in store() (canAddUsersAnywhere,
    // scoped to the single common 'account' module), so no per-module
    // canAddUsers gate is needed here.
    private function grantAssignment(User $target, int $companyId, array $requestedPerms, array $myPerms): void
    {
        $assignment = CompanyUserAssignment::firstOrCreate(
            ['user_id' => $target->id, 'company_id' => $companyId],
            // assigned_by holds a CompanyAdmin id by convention elsewhere in
            // this codebase — left null here since a staff member (not an
            // admin) performed this assignment; SystemAuditLog carries the
            // real actor instead.
            ['assigned_by' => null, 'status' => 'active']
        );

        foreach ($requestedPerms as $moduleKey => $permKeys) {
            foreach ((array) $permKeys as $permKey) {
                if (!ModuleCatalog::isValidPermission($moduleKey, $permKey)) continue;
                if (!in_array($permKey, $myPerms[$moduleKey] ?? [])) continue;

                UserCompanyPermission::create([
                    'company_user_id' => $assignment->id,
                    'user_id'         => $target->id,
                    'company_id'      => $companyId,
                    'module_key'      => $moduleKey,
                    'permission_key'  => $permKey,
                ]);
            }
        }
    }
}
