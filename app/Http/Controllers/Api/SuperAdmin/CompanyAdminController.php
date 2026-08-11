<?php

namespace App\Http\Controllers\Api\SuperAdmin;

use App\Helpers\ApiResponse;
use App\Http\Controllers\Controller;
use App\Models\CompanyAdmin;
use App\Support\CrossAccountEmail;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class CompanyAdminController extends Controller
{
    public function index(): JsonResponse
    {
        $admins = CompanyAdmin::with('package')
            ->withCount('companies')
            ->orderByDesc('created_at')
            ->get();

        return ApiResponse::success($admins);
    }

    public function store(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'name'                  => ['required', 'string', 'max:255'],
            'email'                 => [
                'required', 'email', 'unique:company_admins,email',
                function ($attribute, $value, $fail) {
                    if (CrossAccountEmail::existsAsUser($value)) {
                        $fail('This email is already registered as a staff or client account.');
                    }
                },
            ],
            'password'              => ['required', 'string', 'min:8'],
            'phone'                 => ['nullable', 'string', 'max:50'],
            'package_id'            => ['nullable', 'exists:packages,id'],
            'subscription_status'   => ['required', 'in:trial,active,suspended'],
            'trial_ends_at'         => ['nullable', 'date'],
            'subscription_ends_at'  => ['nullable', 'date'],
        ]);

        $admin = CompanyAdmin::create($validated + ['is_active' => true]);

        return ApiResponse::success($admin->load('package'), 'Company admin created', 201);
    }

    public function show(CompanyAdmin $admin): JsonResponse
    {
        return ApiResponse::success($admin->load(['package', 'companies']));
    }

    public function update(Request $request, CompanyAdmin $admin): JsonResponse
    {
        $validated = $request->validate([
            'name'                  => ['required', 'string', 'max:255'],
            'email'                 => [
                'required', 'email', 'unique:company_admins,email,' . $admin->id,
                function ($attribute, $value, $fail) {
                    if (CrossAccountEmail::existsAsUser($value)) {
                        $fail('This email is already registered as a staff or client account.');
                    }
                },
            ],
            'password'              => ['nullable', 'string', 'min:8'],
            'phone'                 => ['nullable', 'string', 'max:50'],
            'package_id'            => ['nullable', 'exists:packages,id'],
            'subscription_status'   => ['required', 'in:trial,active,suspended'],
            'trial_ends_at'         => ['nullable', 'date'],
            'subscription_ends_at'  => ['nullable', 'date'],
        ]);

        if (empty($validated['password'])) {
            unset($validated['password']);
        }

        $admin->update($validated);

        return ApiResponse::success($admin->load('package'), 'Admin updated');
    }

    public function toggleStatus(CompanyAdmin $admin): JsonResponse
    {
        $admin->update(['is_active' => !$admin->is_active]);
        return ApiResponse::success(['is_active' => $admin->is_active]);
    }
}
