<?php

namespace App\Http\Resources;

use App\Models\Module;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;
use Illuminate\Support\Facades\Storage;

class AdminResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id'                    => $this->id,
            'name'                  => $this->name,
            'email'                 => $this->email,
            'phone'                 => $this->phone,
            'avatar_url'            => $this->avatar_path ? Storage::url($this->avatar_path) : null,
            'subscription_status'   => $this->subscription_status,
            'trial_ends_at'         => $this->trial_ends_at?->toDateTimeString(),
            'subscription_ends_at'  => $this->subscription_ends_at?->toDateTimeString(),
            'is_active'             => $this->is_active,
            // Raw per-admin override columns (null = use package default /
            // unlimited) — lets the frontend reflect a seat/company upgrade
            // purchase immediately via the same setAuthData()/auth_refreshed
            // pattern already used for module purchases.
            'max_users_per_company' => $this->max_users_per_company,
            'max_companies'         => $this->max_companies,
            'package'               => $this->whenLoaded('package', function () {
                return [
                    'name'                  => $this->package->name,
                    'tier'                  => $this->package->tier,
                    'max_companies'         => $this->package->max_companies,
                    'max_users_per_company' => $this->package->max_users_per_company,
                ];
            }),
            'companies'             => $this->whenLoaded('companies', function () {
                return $this->companies->map(fn ($c) => [
                    'id'        => $c->id,
                    'name'      => $c->name,
                    'is_active' => $c->is_active,
                ]);
            }),
            'modules'               => $this->whenLoaded('companies', function () {
                $company = $this->companies->first();
                if (!$company || !$company->relationLoaded('modules')) return [];

                // Exclude granular keys whose parent catalog module has been
                // deactivated by the Super Admin — CheckCompanyModule already
                // blocks the underlying API, so keep the sidebar/UI in sync.
                $disabledKeys = Module::where('is_active', false)
                    ->pluck('sub_modules')
                    ->flatten()
                    ->unique();

                return $company->modules
                    ->where('is_enabled', true)
                    ->pluck('module_key')
                    ->reject(fn ($key) => $disabledKeys->contains($key))
                    ->values()
                    ->toArray();
            }),
        ];
    }
}
