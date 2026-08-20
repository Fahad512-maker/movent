<?php

namespace App\Http\Controllers\Api\Admin\Concerns;

// Mirrors CheckCompanyModule middleware's identical header-read pattern for
// the User/staff side (X-Active-Company-Id, set automatically by
// frontend/lib/axios.ts's request interceptor once setActiveCompany() is
// called — see frontend/lib/auth.ts and frontend/components/admin/
// CompanySelector.tsx). Never trusts the header alone: always intersected
// with companyIds() so a tampered/foreign id can never leak another
// tenant's data. Falls back to the admin's first company when the header is
// absent or names a company this admin doesn't own — same "companyIds()[0]
// as default" convention already used by ClientController::index()'s
// seat-info panel.
//
// Every consuming controller already defines its own private companyIds()
// (copy-pasted per-controller throughout this codebase, not centralized) —
// this trait relies on that method existing on the composing class.
trait ScopesToActiveCompany
{
    protected function activeCompanyId(): int
    {
        $owned = $this->companyIds();
        $requested = (int) request()->header('X-Active-Company-Id');

        return ($requested && in_array($requested, $owned, true)) ? $requested : ($owned[0] ?? 0);
    }
}
