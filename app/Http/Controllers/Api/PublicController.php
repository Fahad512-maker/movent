<?php

namespace App\Http\Controllers\Api;

use App\Helpers\ApiResponse;
use App\Http\Controllers\Controller;
use App\Http\Resources\AdminResource;
use App\Mail\WelcomeMail;
use App\Models\Company;
use App\Models\CompanyAdmin;
use App\Models\Module;
use App\Models\Package;
use App\Models\PaymentGateway;
use App\Services\ModuleDependency;
use App\Support\CompanyName;
use App\Support\CrossAccountEmail;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Facades\Storage;

class PublicController extends Controller
{
    public function packages(): JsonResponse
    {
        // A package's own module list (package_modules) never expires or
        // syncs itself when Super Admin flips a Module's is_active off — it's
        // a separate table, set once when the package was built. Without
        // this filter, a globally-deactivated module still showed up (and
        // was still selectable) for anyone registering via a pre-built
        // package, even though the "build your own plan" flow (modules()
        // below) already correctly hid it. Module.key is a top-level catalog
        // key ('hr', 'finance') while package_modules.module_key is a
        // granular sub-module key ('employees', 'finance_dashboard') — the
        // two are different namespaces, so this checks each inactive
        // Module's sub_modules array, same pattern as
        // App\Http\Middleware\CheckCompanyModule.
        $disabledSubModuleKeys = Module::where('is_active', false)
            ->pluck('sub_modules')
            ->flatten()
            ->unique()
            ->all();

        $packages = Package::with('modules')
            ->where('is_visible', true)
            ->where('is_active', true)
            ->orderBy('price_usd')
            ->get()
            ->map(fn($pkg) => [
                'id'         => $pkg->id,
                'name'       => $pkg->name,
                'tier'       => $pkg->tier,
                'price_pkr'  => (float) $pkg->price_pkr,
                'price_usd'  => (float) $pkg->price_usd,
                'trial_days' => $pkg->trial_days,
                'is_popular' => (bool) $pkg->is_popular,
                'features'   => $pkg->features ?? [],
                'modules'    => array_values(array_diff($pkg->modules->pluck('module_key')->toArray(), $disabledSubModuleKeys)),
            ]);

        return ApiResponse::success($packages);
    }

    // GET /public/modules — active modules for the "build your own plan" registration flow
    public function modules(): JsonResponse
    {
        $modules = Module::where('is_active', true)
            ->orderBy('label')
            ->get(['key', 'label', 'description', 'sub_modules', 'price_pkr', 'price_usd']);

        return ApiResponse::success($modules);
    }

    // GET /public/payment-gateways — active platform gateways for registration payment
    public function activeGateways(): JsonResponse
    {
        $gateways = PaymentGateway::where('is_active', true)
            ->orderBy('id')
            ->get(['id', 'name', 'display_name', 'is_active']);

        if ($gateways->isEmpty()) {
            return ApiResponse::success([], 'No payment gateways configured');
        }

        return ApiResponse::success($gateways);
    }

    public function checkEmail(Request $request): JsonResponse
    {
        $request->validate(['email' => ['required', 'email']]);

        $available = !CompanyAdmin::where('email', $request->email)->exists()
            && !CrossAccountEmail::existsAsUser($request->email);

        return ApiResponse::success(['available' => $available]);
    }

    public function checkCompanyName(Request $request): JsonResponse
    {
        $request->validate(['company_name' => ['required', 'string']]);

        $available = !CompanyName::exists($request->company_name);

        return ApiResponse::success(['available' => $available]);
    }

    public function register(Request $request): JsonResponse
    {
        $validated = $request->validate([
            // Letters/digits only — no spaces, no special characters.
            // Mirrored client-side in the register form's onChange filter;
            // enforced here too so a direct API call can't bypass it.
            'company_name'    => ['required', 'string', 'max:200', 'regex:/^[A-Za-z0-9]+$/'],
            'name'            => ['required', 'string', 'max:150'],
            'email'           => [
                'required', 'email', 'unique:company_admins,email',
                function ($attribute, $value, $fail) {
                    if (CrossAccountEmail::existsAsUser($value)) {
                        $fail('This email is already registered as a staff or client account.');
                    }
                },
            ],
            'password'        => ['required', 'string', 'min:8', 'confirmed'],
            'phone'           => ['nullable', 'string', 'max:50'],
            'package_id'      => ['required', 'exists:packages,id'],
            'selected_modules'=> ['required', 'array', 'min:1'],
            'selected_modules.*' => ['string'],
            'currency'        => ['required', 'in:USD'],
            'start_type'      => ['required', 'in:trial,paid'],
            'timezone'        => ['nullable', 'string', 'max:100'],
            'max_users'       => ['nullable', 'integer', 'min:1'],
            'max_companies'   => ['nullable', 'integer', 'min:1'],
        ]);

        $validated['company_name'] = CompanyName::normalize($validated['company_name']);
        CompanyName::throwIfTaken($validated['company_name'], 'company_name');

        $package = Package::with('modules')->findOrFail($validated['package_id']);

        // Strip any module keys not in the package (prevent injection of unowned modules).
        // If the package has no modules defined (e.g. admin-created custom package),
        // skip the filter and save whatever the user selected.
        $packageModuleKeys = $package->modules->pluck('module_key')->toArray();
        if (!empty($packageModuleKeys)) {
            $validated['selected_modules'] = array_values(array_intersect(
                $validated['selected_modules'],
                $packageModuleKeys
            ));
        }

        // Also strip any module Super Admin has since globally deactivated —
        // packages() (the display side) already hides these, but a direct
        // API call could still submit one from a stale page or by hand. Same
        // sub_modules-array check as packages() above (harmless no-op for
        // the "build your own" flow, where selected_modules only ever came
        // from modules(), already is_active-filtered).
        $disabledSubModuleKeys = Module::where('is_active', false)->pluck('sub_modules')->flatten()->unique()->all();
        $validated['selected_modules'] = array_values(array_diff($validated['selected_modules'], $disabledSubModuleKeys));
        $validated['selected_modules'] = array_values(array_unique($validated['selected_modules']));

        if (empty($validated['selected_modules'])) {
            return ApiResponse::error('Please select at least one valid module.', 422, [
                'selected_modules' => ['Please select at least one valid module.'],
            ]);
        }

        $dependencyErrors = ModuleDependency::errors($validated['selected_modules']);
        if (!empty($dependencyErrors)) {
            return ApiResponse::error('Module dependencies are not valid.', 422, [
                'selected_modules' => $dependencyErrors,
            ]);
        }

        // Determine subscription dates
        $trialEndsAt = $subEndsAt = null;
        $status = 'pending_payment';

        if ($validated['start_type'] === 'trial') {
            $status      = 'trial';
            $trialEndsAt = now()->addDays($package->trial_days ?? 14);
        }

        // Create company admin
        $admin = CompanyAdmin::create([
            'name'                   => $validated['name'],
            'email'                  => $validated['email'],
            'password'               => Hash::make($validated['password']),
            'phone'                  => $validated['phone'] ?? null,
            'package_id'             => $package->id,
            'subscription_status'    => $status,
            'trial_ends_at'          => $trialEndsAt,
            'subscription_ends_at'   => $subEndsAt,
            'is_active'              => true,
            // Seats/companies picked at checkout — takes precedence over the
            // shared Package's defaults (see UserController/ClientController
            // limit checks). Null here means "unlimited", same as the Package.
            'max_users_per_company'  => $validated['max_users'] ?? null,
            'max_companies'          => $validated['max_companies'] ?? null,
            // Explicit, not left to the column default — this is the
            // tenant-level currency Company::invoicingProfile() treats as
            // authoritative for every invoice. Always 'USD' (validated
            // above), same as the Company row created just below.
            'currency'               => $validated['currency'],
        ]);

        // Create company
        $company = Company::create([
            'admin_id'       => $admin->id,
            'name'           => $validated['company_name'],
            // USA is the primary target market — default here if the
            // frontend's timezone selector somehow didn't send one.
            'timezone'       => $validated['timezone'] ?? 'America/New_York',
            'currency'       => $validated['currency'],
            'storage_folder' => 'companies/0/', // temp, updated below
            'is_active'      => true,
        ]);

        // Update storage folder with real ID and create it
        $storageFolder = 'companies/' . $company->id . '/';
        $company->update(['storage_folder' => $storageFolder]);
        Storage::makeDirectory($storageFolder);

        // Only enable the modules the company actually selected/purchased
        foreach ($validated['selected_modules'] as $moduleKey) {
            $company->modules()->create([
                'module_key' => $moduleKey,
                'is_enabled' => true,
            ]);
        }

        // Send welcome email (non-blocking)
        try {
            Mail::to($admin->email)->send(new WelcomeMail($admin, $company, $trialEndsAt));
        } catch (\Throwable) {
            // Don't fail registration if mail fails
        }

        // Issue Sanctum token
        $token = $admin->createToken('company-admin-token', ['role:admin'])->plainTextToken;

        // Reload admin with companies + their modules so the frontend cookie is complete from the start
        $admin->load('companies.modules');

        return ApiResponse::success([
            'token'      => $token,
            'admin'      => [
                'id'                  => $admin->id,
                'name'                => $admin->name,
                'email'               => $admin->email,
                'subscription_status' => $admin->subscription_status,
                'companies'           => $admin->companies->map(fn($c) => [
                    'id'        => $c->id,
                    'name'      => $c->name,
                    'is_active' => $c->is_active,
                ]),
                'modules'             => $company->modules
                    ->where('is_enabled', true)
                    ->pluck('module_key')
                    ->values()
                    ->toArray(),
            ],
            'start_type' => $validated['start_type'],
        ], 'Registration successful', 201);
    }

    // A pending_payment account can't complete AdminAuthController::login()
    // (blocked on purpose — see that method), so it has no way to reach the
    // authenticated /admin/subscription-payment/* endpoints. This re-verifies
    // the same credentials and issues a token specifically so the "Complete
    // Payment" link on the login screen can resume checkout — every OTHER
    // admin route stays blocked for that token via the 'subscription.active'
    // middleware (routes/api.php) for as long as payment is still pending.
    public function resumePayment(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'email'    => ['required', 'email'],
            'password' => ['required', 'string'],
        ]);

        $admin = CompanyAdmin::where('email', $validated['email'])->first();

        if (!$admin || !Hash::check($validated['password'], $admin->password)) {
            return ApiResponse::error('Invalid credentials', 401);
        }

        if (!$admin->is_active) {
            return ApiResponse::error('Your account has been deactivated', 403);
        }

        if ($admin->subscription_status !== 'pending_payment') {
            return ApiResponse::error('Your account is already active — please log in normally.', 422);
        }

        $token = $admin->createToken('admin-resume-payment-token', ['role:admin'])->plainTextToken;

        return ApiResponse::success([
            'token' => $token,
            'admin' => new AdminResource($admin->load('companies.modules', 'package')),
        ], 'You can now complete your payment');
    }
}
