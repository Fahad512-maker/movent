<?php

namespace App\Http\Middleware;

use App\Helpers\ApiResponse;
use App\Models\CompanyAdmin;
use App\Models\CompanyModule;
use App\Models\Module;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class CheckCompanyModule
{
    /**
     * Usage: middleware('module:leads')
     *
     * Supports both CompanyAdmin (has companies() HasMany) and User (has company_id).
     */
    public function handle(Request $request, Closure $next, string $moduleKey): Response
    {
        $user = $request->user();

        if (!$user) {
            return ApiResponse::error('Unauthorized', 401);
        }

        $disabledGlobally = Module::where('is_active', false)
            ->whereJsonContains('sub_modules', $moduleKey)
            ->exists();

        if ($disabledGlobally) {
            return ApiResponse::error("Module '{$moduleKey}' has been disabled by the administrator.", 403);
        }

        if ($user instanceof CompanyAdmin) {
            $companyIds = $user->companies()->pluck('id')->toArray();
            if (empty($companyIds)) {
                return ApiResponse::error('No company associated with this account.', 403);
            }
            $enabled = CompanyModule::whereIn('company_id', $companyIds)
                ->where('module_key', $moduleKey)
                ->where('is_enabled', true)
                ->exists();
        } else {
            if (!$user->company_id) {
                return ApiResponse::error('Unauthorized', 401);
            }
            $enabled = CompanyModule::where('company_id', $user->company_id)
                ->where('module_key', $moduleKey)
                ->where('is_enabled', true)
                ->exists();
        }

        if (!$enabled) {
            return ApiResponse::error("Module '{$moduleKey}' is not enabled for your company.", 403);
        }

        return $next($request);
    }
}
