<?php

namespace App\Support;

use App\Models\CompanyUserAssignment;
use App\Models\User;
use Illuminate\Http\Request;

// Resolves which company a User (staff) request is acting on, and confirms
// it's genuinely backed by an ACTIVE CompanyUserAssignment. `users.company_id`
// is a NOT NULL column that can outlive the assignment backing it (e.g. a
// user whose last company was just unassigned/suspended still has *some*
// stale value sitting there) — never trust it on its own. Shared by
// CheckCompanyModule and RequireActiveCompany so every User-side route
// resolves/gates "no active company" the same way.
class ActiveCompany
{
    public static function resolve(Request $request, User $user): ?int
    {
        $requested = (int) $request->header('X-Active-Company-Id');

        if ($requested && self::isActiveAssignment($user->id, $requested)) {
            return $requested;
        }

        $fallbackId = (int) $user->company_id;
        if ($fallbackId && self::isActiveAssignment($user->id, $fallbackId)) {
            return $fallbackId;
        }

        return null;
    }

    private static function isActiveAssignment(int $userId, int $companyId): bool
    {
        return CompanyUserAssignment::where('user_id', $userId)
            ->where('company_id', $companyId)
            ->where('status', 'active')
            ->exists();
    }
}
