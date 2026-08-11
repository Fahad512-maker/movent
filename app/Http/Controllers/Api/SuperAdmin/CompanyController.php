<?php

namespace App\Http\Controllers\Api\SuperAdmin;

use App\Helpers\ApiResponse;
use App\Http\Controllers\Controller;
use App\Models\Company;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class CompanyController extends Controller
{
    public function index(): JsonResponse
    {
        $companies = Company::with('admin')
            ->withCount('users')
            ->orderByDesc('created_at')
            ->get();

        return ApiResponse::success($companies);
    }

    public function toggleStatus(Company $company): JsonResponse
    {
        $company->update(['is_active' => !$company->is_active]);
        return ApiResponse::success(
            ['is_active' => $company->is_active],
            'Status updated'
        );
    }

    public function modules(Company $company): JsonResponse
    {
        $company->load('modules');
        return ApiResponse::success([
            'company_id' => $company->id,
            'modules'    => $company->modules->pluck('module_key')->toArray(),
        ]);
    }

    public function syncModules(Company $company, Request $request): JsonResponse
    {
        $request->validate([
            'modules'   => ['required', 'array'],
            'modules.*' => ['string'],
        ]);

        $company->modules()->delete();

        foreach ($request->modules as $key) {
            $company->modules()->create(['module_key' => $key, 'is_enabled' => true]);
        }

        return ApiResponse::success([
            'company_id' => $company->id,
            'modules'    => $request->modules,
        ], 'Modules updated');
    }
}
