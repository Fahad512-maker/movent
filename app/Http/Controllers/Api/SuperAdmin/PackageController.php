<?php

namespace App\Http\Controllers\Api\SuperAdmin;

use App\Helpers\ApiResponse;
use App\Http\Controllers\Controller;
use App\Models\Module;
use App\Models\Package;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class PackageController extends Controller
{
    // A package must be built from granular module keys (e.g. "leads", "invoices"),
    // never the coarse category keys (e.g. "sales") shown in the Modules admin UI —
    // the registration/middleware module checks only ever match granular keys.
    private function invalidModuleKeys(array $keys): array
    {
        $validKeys = Module::query()->pluck('sub_modules')->flatten()->unique()->all();

        return array_values(array_diff($keys, $validKeys));
    }

    public function index(): JsonResponse
    {
        $packages = Package::with('modules')
            ->withCount('companyAdmins')
            ->orderByDesc('created_at')
            ->get();

        return ApiResponse::success($packages);
    }

    public function show(Package $package): JsonResponse
    {
        return ApiResponse::success($package->load('modules'));
    }

    public function store(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'name'                   => ['required', 'string', 'max:255'],
            'tier'                   => ['required', 'in:basic,professional,enterprise,custom'],
            'price'                  => ['required', 'numeric', 'min:0'],
            'price_pkr'              => ['nullable', 'numeric', 'min:0'],
            'price_usd'              => ['nullable', 'numeric', 'min:0'],
            'billing_cycle'          => ['required', 'in:monthly,yearly'],
            'trial_days'             => ['nullable', 'integer', 'min:0'],
            'max_companies'          => ['nullable', 'integer', 'min:1'],
            'max_users_per_company'  => ['nullable', 'integer', 'min:1'],
            'description'            => ['nullable', 'string'],
            'is_visible'             => ['boolean'],
            'is_popular'             => ['boolean'],
            'modules'                => ['array'],
            'modules.*'              => ['string'],
        ]);

        $invalidKeys = $this->invalidModuleKeys($validated['modules'] ?? []);
        if (!empty($invalidKeys)) {
            return ApiResponse::error('Invalid module keys.', 422, [
                'modules' => ['Unknown module key(s): ' . implode(', ', $invalidKeys)],
            ]);
        }

        $package = Package::create([
            'name'                  => $validated['name'],
            'tier'                  => $validated['tier'],
            'price'                 => $validated['price'],
            'price_pkr'             => $validated['price_pkr'] ?? null,
            'price_usd'             => $validated['price_usd'] ?? null,
            'billing_cycle'         => $validated['billing_cycle'],
            'trial_days'            => $validated['trial_days'] ?? 14,
            'max_companies'         => $validated['max_companies'] ?? null,
            'max_users_per_company' => $validated['max_users_per_company'] ?? null,
            'description'           => $validated['description'] ?? null,
            'is_active'             => true,
            'is_visible'            => $validated['is_visible'] ?? true,
            'is_popular'            => $validated['is_popular'] ?? false,
        ]);

        if (!empty($validated['modules'])) {
            $package->modules()->createMany(
                collect($validated['modules'])->map(fn($key) => [
                    'module_key' => $key,
                    'is_enabled' => true,
                ])->toArray()
            );
        }

        return ApiResponse::success($package->load('modules'), 'Package created', 201);
    }

    public function update(Request $request, Package $package): JsonResponse
    {
        $validated = $request->validate([
            'name'                   => ['required', 'string', 'max:255'],
            'tier'                   => ['required', 'in:basic,professional,enterprise,custom'],
            'price'                  => ['required', 'numeric', 'min:0'],
            'price_pkr'              => ['nullable', 'numeric', 'min:0'],
            'price_usd'              => ['nullable', 'numeric', 'min:0'],
            'billing_cycle'          => ['required', 'in:monthly,yearly'],
            'trial_days'             => ['nullable', 'integer', 'min:0'],
            'max_companies'          => ['nullable', 'integer', 'min:1'],
            'max_users_per_company'  => ['nullable', 'integer', 'min:1'],
            'description'            => ['nullable', 'string'],
            'is_visible'             => ['boolean'],
            'is_popular'             => ['boolean'],
            'modules'                => ['array'],
            'modules.*'              => ['string'],
        ]);

        $invalidKeys = $this->invalidModuleKeys($validated['modules'] ?? []);
        if (!empty($invalidKeys)) {
            return ApiResponse::error('Invalid module keys.', 422, [
                'modules' => ['Unknown module key(s): ' . implode(', ', $invalidKeys)],
            ]);
        }

        $package->update([
            'name'                  => $validated['name'],
            'tier'                  => $validated['tier'],
            'price'                 => $validated['price'],
            'price_pkr'             => $validated['price_pkr'] ?? null,
            'price_usd'             => $validated['price_usd'] ?? null,
            'billing_cycle'         => $validated['billing_cycle'],
            'trial_days'            => $validated['trial_days'] ?? $package->trial_days,
            'max_companies'         => $validated['max_companies'] ?? null,
            'max_users_per_company' => $validated['max_users_per_company'] ?? null,
            'description'           => $validated['description'] ?? null,
            'is_visible'            => $validated['is_visible'] ?? $package->is_visible,
            'is_popular'            => $validated['is_popular'] ?? $package->is_popular,
        ]);

        // Sync modules
        $package->modules()->delete();
        if (!empty($validated['modules'])) {
            $package->modules()->createMany(
                collect($validated['modules'])->map(fn($key) => [
                    'module_key' => $key,
                    'is_enabled' => true,
                ])->toArray()
            );
        }

        return ApiResponse::success($package->load('modules'), 'Package updated');
    }

    public function destroy(Package $package): JsonResponse
    {
        $package->modules()->delete();
        $package->delete();
        return ApiResponse::success(null, 'Package deleted');
    }

    public function toggle(Package $package): JsonResponse
    {
        $package->update(['is_active' => !$package->is_active]);
        return ApiResponse::success(['is_active' => $package->is_active]);
    }
}
