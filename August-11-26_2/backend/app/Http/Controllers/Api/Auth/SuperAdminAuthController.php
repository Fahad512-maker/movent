<?php

namespace App\Http\Controllers\Api\Auth;

use App\Helpers\ApiResponse;
use App\Http\Controllers\Controller;
use App\Models\SuperAdmin;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;

class SuperAdminAuthController extends Controller
{
    public function login(Request $request): JsonResponse
    {
        $request->validate([
            'email'    => ['required', 'email'],
            'password' => ['required'],
        ]);

        $config = config('super-admin');

        if ($request->email !== $config['email']) {
            return ApiResponse::error('Invalid credentials', 401);
        }

        // Find or create the DB record used for Sanctum token storage
        $superAdmin = SuperAdmin::firstOrCreate(
            ['email' => $config['email']],
            ['name' => $config['name'], 'password' => Hash::make($config['password'])]
        );

        // Verify password: accept config plain-text OR DB hash
        $validByConfig = $request->password === $config['password'];
        $validByHash   = Hash::check($request->password, $superAdmin->password);

        if (!$validByConfig && !$validByHash) {
            return ApiResponse::error('Invalid credentials', 401);
        }

        // Sync DB password if config changed
        if ($validByConfig && !$validByHash) {
            $superAdmin->update(['password' => Hash::make($config['password'])]);
        }

        $superAdmin->update(['last_login_at' => now()]);

        $token = $superAdmin->createToken('super-admin-token', ['role:super_admin'])->plainTextToken;

        return ApiResponse::success([
            'token'       => $token,
            'super_admin' => [
                'id'    => $superAdmin->id,
                'name'  => $superAdmin->name,
                'email' => $superAdmin->email,
            ],
        ], 'Login successful');
    }

    public function logout(Request $request): JsonResponse
    {
        $request->user()->currentAccessToken()->delete();
        return ApiResponse::success(null, 'Logged out');
    }

    public function me(Request $request): JsonResponse
    {
        return ApiResponse::success([
            'id'    => $request->user()->id,
            'name'  => $request->user()->name,
            'email' => $request->user()->email,
        ]);
    }
}
