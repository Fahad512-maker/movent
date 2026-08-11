<?php

namespace Database\Seeders;

use App\Models\Package;
use App\Models\PackageModule;
use Illuminate\Database\Seeder;

class PackageSeeder extends Seeder
{
    // Mirrors the category → module expansion in frontend/app/register/page.tsx (CATEGORIES)
    // so packages built here unlock the same features the middleware/dashboard check for.
    private const CATEGORY_MODULES = [
        // 'clients' deliberately excluded — see ModuleSeeder.php's matching comment.
        'sales'         => ['leads', 'projects_handoff', 'lead_transfer', 'reports_seller'],
        'invoice'       => ['invoices', 'payments', 'payment_details', 'invoice_reminders'],
        'client_portal' => ['client_portal'],
        'hr'            => ['employees', 'recruitment', 'attendance', 'leaves', 'payroll'],
        'compliance'    => ['compliance', 'policies', 'audit_trails', 'compliance_reports', 'risk_assessments', 'alerts', 'document_compliance'],
        'finance'       => ['finance_dashboard', 'finance_reports', 'revenue_reports', 'payments_report'],
        'projects'      => ['projects', 'tasks', 'timesheets', 'production', 'revisions', 'deliverables', 'team_resources', 'file_storage'],
    ];

    private array $packages = [
        [
            'name'         => 'Starter',
            'tier'         => 'basic',
            'price'        => 2999,
            'price_pkr'    => 2999,
            'price_usd'    => 15,
            'billing_cycle'=> 'monthly',
            'trial_days'   => 14,
            'is_active'    => true,
            'is_visible'   => true,
            'is_popular'   => false,
            'max_companies'=> 1,
            'max_users_per_company' => 10,
            'description'  => 'Perfect for small businesses getting started.',
            'features'     => [
                'Up to 10 Users',
                'Sales & Invoicing',
                'Email Support',
            ],
            'categories' => ['sales', 'invoice'],
        ],
        [
            'name'         => 'Business',
            'tier'         => 'professional',
            'price'        => 5999,
            'price_pkr'    => 5999,
            'price_usd'    => 30,
            'billing_cycle'=> 'monthly',
            'trial_days'   => 14,
            'is_active'    => true,
            'is_visible'   => true,
            'is_popular'   => true,
            'max_companies'=> 1,
            'max_users_per_company' => 50,
            'description'  => 'Best for growing teams that need more power.',
            'features'     => [
                'Up to 50 Users',
                'Everything in Starter',
                'HR Management',
                'Finance Dashboard',
                'Priority Support',
            ],
            'categories' => ['sales', 'invoice', 'hr', 'finance'],
        ],
        [
            'name'         => 'Enterprise',
            'tier'         => 'enterprise',
            'price'        => 9999,
            'price_pkr'    => 9999,
            'price_usd'    => 50,
            'billing_cycle'=> 'monthly',
            'trial_days'   => 14,
            'is_active'    => true,
            'is_visible'   => true,
            'is_popular'   => false,
            'max_companies'=> null,
            'max_users_per_company' => null,
            'description'  => 'Every module included. No limits.',
            'features'     => [
                'Unlimited Users',
                'All Modules Included',
                'Project Management',
                'Compliance Suite',
                'Priority Support',
                'Dedicated Account Manager',
            ],
            'categories' => ['sales', 'invoice', 'client_portal', 'hr', 'compliance', 'finance', 'projects'],
        ],
    ];

    public function run(): void
    {
        // Remove previously seeded default packages before inserting the current set.
        PackageModule::whereIn('package_id', Package::pluck('id'))->delete();
        Package::query()->delete();

        foreach ($this->packages as $data) {
            $categories = $data['categories'];
            unset($data['categories']);
            $modules = array_values(array_unique(array_merge(
                ...array_map(fn($cat) => self::CATEGORY_MODULES[$cat], $categories)
            )));

            $package = Package::updateOrCreate(
                ['name' => $data['name']],
                $data
            );

            $package->modules()->delete();
            foreach ($modules as $key) {
                PackageModule::create([
                    'package_id' => $package->id,
                    'module_key' => $key,
                    'is_enabled' => true,
                    'is_core'    => false,
                ]);
            }
        }
    }
}
