<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;
use Illuminate\Support\Facades\Storage;

class UserResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        $frontendUrl = rtrim(config('app.frontend_url', 'http://localhost:3000'), '/');

        return [
            'id'          => $this->id,
            'name'        => $this->name,
            'email'       => $this->email,
            'role_type'   => $this->role_type,
            'phone'       => $this->phone,
            'avatar_path' => $this->avatar_path,
            'avatar_url'  => $this->avatar_path ? Storage::url($this->avatar_path) : null,
            'is_active'     => (bool) $this->is_active,
            'is_online'     => $this->is_online,
            'status'        => $this->status ?? 'active',
            'last_login_at' => $this->last_login_at,
            'created_at'    => $this->created_at,
            'created_by'    => $this->whenLoaded('createdBy', fn () => $this->createdBy ? [
                'id'   => $this->createdBy->id,
                'name' => $this->createdBy->name,
            ] : null),
            'invite_url'  => $this->invite_token
                ? $frontendUrl . '/invite/' . $this->invite_token
                : null,

            'company' => $this->whenLoaded('company', fn () => [
                'id'       => $this->company->id,
                'name'     => $this->company->name,
                'currency' => $this->company->currency ?? 'USD',
                'modules'  => $this->company->relationLoaded('modules')
                    ? $this->company->modules->where('is_enabled', true)->pluck('module_key')->values()
                    : null,
                'admin'    => $this->company->relationLoaded('admin') ? [
                    'id'       => $this->company->admin?->id,
                    'name'     => $this->company->admin?->name,
                    // The tenant's Settings-configured currency — authoritative
                    // for invoice creation (see Company::invoicingProfile()),
                    // unlike the sibling `company.currency` above (legacy,
                    // pre-tenant-refactor, per-Company column).
                    'currency' => $this->company->admin?->currency,
                ] : null,
            ]),

            'company_assignments' => $this->whenLoaded('companyAssignments', function () {
                $allPerms = $this->relationLoaded('userCompanyPermissions')
                    ? $this->userCompanyPermissions
                    : collect();

                return $this->companyAssignments->map(function ($assignment) use ($allPerms) {
                    $rowsForCompany = $allPerms->where('company_id', $assignment->company_id);

                    $perms = $rowsForCompany
                        ->groupBy('module_key')
                        ->map(fn ($g) => $g->pluck('permission_key')->toArray())
                        ->toArray();

                    // Descriptive-only (like role_type) — never used to filter query results.
                    $dataScopes = $rowsForCompany
                        ->groupBy('module_key')
                        ->map(fn ($g) => $g->first()->data_scope)
                        ->filter()
                        ->toArray();

                    return [
                        'company_id'   => $assignment->company_id,
                        'company_name' => $assignment->company?->name,
                        'status'       => $assignment->status,
                        'permissions'  => $perms,
                        'data_scopes'  => $dataScopes,
                    ];
                });
            }),

            'permissions' => $this->whenLoaded('permissions', function () {
                return $this->permissions->groupBy('module_key')
                    ->map(fn ($perms) => $perms->first()->only([
                        'module_key', 'can_view', 'can_create', 'can_edit', 'can_delete', 'can_export',
                    ]))
                    ->values();
            }),
        ];
    }
}
