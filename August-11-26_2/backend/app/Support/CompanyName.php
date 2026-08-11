<?php

namespace App\Support;

use App\Models\Company;
use App\Models\CompanyAdmin;
use Illuminate\Validation\ValidationException;

class CompanyName
{
    public static function normalize(?string $name): string
    {
        return preg_replace('/\s+/', ' ', trim((string) $name)) ?? '';
    }

    public static function exists(
        string $name,
        ?int $exceptCompanyId = null,
        ?int $exceptAdminId = null,
        ?int $ignoreCompaniesForAdminId = null
    ): bool {
        $normalized = mb_strtolower(self::normalize($name));

        $companyExists = Company::query()
            ->when($exceptCompanyId, fn ($q) => $q->where('id', '!=', $exceptCompanyId))
            ->when($ignoreCompaniesForAdminId, fn ($q) => $q->where('admin_id', '!=', $ignoreCompaniesForAdminId))
            ->whereRaw('LOWER(TRIM(name)) = ?', [$normalized])
            ->exists();

        if ($companyExists) {
            return true;
        }

        return CompanyAdmin::query()
            ->when($exceptAdminId, fn ($q) => $q->where('id', '!=', $exceptAdminId))
            ->whereNotNull('business_name')
            ->whereRaw('LOWER(TRIM(business_name)) = ?', [$normalized])
            ->exists();
    }

    public static function throwIfTaken(
        string $name,
        string $field,
        ?int $exceptCompanyId = null,
        ?int $exceptAdminId = null,
        ?int $ignoreCompaniesForAdminId = null
    ): void {
        if (!self::exists($name, $exceptCompanyId, $exceptAdminId, $ignoreCompaniesForAdminId)) {
            return;
        }

        throw ValidationException::withMessages([
            $field => ['This company name is already registered. Please choose a different name.'],
        ]);
    }
}
