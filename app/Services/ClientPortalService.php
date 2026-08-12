<?php

namespace App\Services;

use App\Models\Client;
use App\Models\ClientPortalPermission;
use App\Models\Company;
use App\Models\CompanyAdmin;
use App\Models\User;
use App\Support\CrossAccountEmail;
use Illuminate\Support\Facades\Hash;

// Shared by Api\Admin\ClientController and Api\User\ClientController — the
// seat-limit/portal-login-creation logic is identical regardless of which
// guard triggers it (a Seller enabling portal access for their own client
// must respect the exact same tenant-wide seat limit a Company Admin would),
// so it lives here once instead of being duplicated per controller.
class ClientPortalService
{
    // Unlike basic Client CRUD (grantable via either the Client module OR
    // the Sales module — see routes/api.php's comment), actually turning on
    // a client's portal LOGIN requires the real Client Portal module
    // specifically — no OR-with-Sales exception. Without this project the
    // client into having a working login on a Sales-only company that never
    // bought the module. 'clients' is included defensively even though it's
    // never a real CompanyModule row (see ModuleSeeder.php).
    public static function hasPortalModule(int $companyId): bool
    {
        return Company::find($companyId)
            ?->modules()
            ->whereIn('module_key', ['client_portal', 'clients'])
            ->where('is_enabled', true)
            ->exists() ?? false;
    }

    // Per-company seat check — each company has its own independent limit,
    // sourced from the tenant (Company Admin account) that owns it.
    public static function seatInfo(CompanyAdmin $admin, int $companyId): array
    {
        $admin->loadMissing('package');
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

    // Blocks a Company Admin match outright, and a staff match UNLESS that
    // User is already role_type='client' (re-using/re-linking an existing
    // client login is fine; silently hijacking a Seller/PM/QA/etc.'s login
    // is not).
    public static function emailBelongsToAnotherAccount(string $email): bool
    {
        if (CrossAccountEmail::existsAsAdmin($email)) {
            return true;
        }
        $user = User::where('email', $email)->first();
        return $user !== null && $user->role_type !== 'client';
    }

    public static function seedPermissions(int $clientId): void
    {
        foreach (array_keys(ClientPortalPermission::MODULES) as $key) {
            ClientPortalPermission::firstOrCreate(
                ['client_id' => $clientId, 'module_key' => $key],
                ['is_enabled' => true]
            );
        }
    }

    // Returns an error message on failure, null on success. Callers already
    // check emailBelongsToAnotherAccount() before reaching here — this is a
    // second, defense-in-depth guard against ever silently converting an
    // existing Admin/non-client staff login into a client login.
    public static function createOrUpdatePortalUser(Client $client, string $email, string $password): ?string
    {
        if (self::emailBelongsToAnotherAccount($email)) {
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

        $client->update(['portal_access' => true, 'user_id' => $user->id]);

        return null;
    }
}
