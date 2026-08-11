<?php

namespace Database\Seeders;

use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;

class DatabaseSeeder extends Seeder
{
    public function run(): void
    {
        // 1. Package
        $packageId = DB::table('packages')->insertGetId([
            'name'                    => 'Professional',
            'tier'                    => 'professional',
            'price'                   => 9999.00,
            'billing_cycle'           => 'monthly',
            'max_companies'           => 50,
            'max_users_per_company'   => 100,
            'description'             => 'Full-featured CRM plan for growing agencies',
            'is_active'               => 1,
            'is_visible'              => 1,
            'created_at'              => now(),
            'updated_at'              => now(),
        ]);

        // Package modules
        $modules = ['sales', 'projects', 'hr', 'finance', 'documents', 'compliance', 'chat', 'reports'];
        foreach ($modules as $module) {
            DB::table('package_modules')->insert([
                'package_id'  => $packageId,
                'module_key'  => $module,
                'is_enabled'  => 1,
                'created_at'  => now(),
                'updated_at'  => now(),
            ]);
        }

        // 2. Company Admin
        $adminId = DB::table('company_admins')->insertGetId([
            'package_id'            => $packageId,
            'name'                  => 'Admin User',
            'email'                 => 'admin@crm.test',
            'password'              => Hash::make('password'),
            'phone'                 => '+92-300-0000001',
            'subscription_status'   => 'active',
            'trial_ends_at'         => null,
            'subscription_ends_at'  => now()->addYear(),
            'is_active'             => 1,
            'created_at'            => now(),
            'updated_at'            => now(),
        ]);

        // 3. Company
        $companyId = DB::table('companies')->insertGetId([
            'admin_id'       => $adminId,
            'name'           => 'Grands Digital',
            'industry'       => 'Technology',
            'email'          => 'info@grands.digital',
            'phone'          => '+92-21-0000001',
            'address'        => 'Karachi, Pakistan',
            'timezone'       => 'Asia/Karachi',
            'currency'       => 'PKR',
            'logo_path'      => null,
            'storage_folder' => 'companies/1/',
            'is_active'      => 1,
            'created_at'     => now(),
            'updated_at'     => now(),
        ]);

        // 4. One user per role
        $roles = ['seller', 'client', 'hr', 'finance', 'project_manager', 'production'];

        foreach ($roles as $index => $role) {
            $num = $index + 1;
            DB::table('users')->insert([
                'company_id'    => $companyId,
                'name'          => ucfirst($role) . ' User',
                'email'         => $role . '@crm.test',
                'password'      => Hash::make('password'),
                'role_type'     => $role,
                'phone'         => '+92-300-000000' . $num,
                'avatar_path'   => null,
                'is_active'     => 1,
                'last_login_at' => null,
                'socket_id'     => null,
                'is_online'     => false,
                'created_by'    => null,
                'remember_token'=> null,
                'created_at'    => now(),
                'updated_at'    => now(),
            ]);
        }

        // 5. Company modules (enable all for this company)
        foreach ($modules as $module) {
            DB::table('company_modules')->insert([
                'company_id'  => $companyId,
                'module_key'  => $module,
                'is_enabled'  => 1,
                'updated_at'  => now(),
            ]);
        }

        $this->command->info('Seeded: 1 package, 1 admin, 1 company, 6 users (one per role)');
    }
}
