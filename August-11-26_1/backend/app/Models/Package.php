<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Package extends Model
{
    protected $fillable = [
        'name', 'tier', 'price', 'price_pkr', 'price_usd', 'billing_cycle',
        'trial_days', 'max_companies', 'max_users_per_company', 'description',
        'is_active', 'is_visible', 'is_popular', 'features',
    ];

    protected $casts = [
        'price'      => 'decimal:2',
        'price_pkr'  => 'decimal:2',
        'price_usd'  => 'decimal:2',
        'is_active'  => 'boolean',
        'is_visible' => 'boolean',
        'is_popular' => 'boolean',
        'features'   => 'array',
    ];

    public function modules(): HasMany
    {
        return $this->hasMany(PackageModule::class);
    }

    public function companyAdmins(): HasMany
    {
        return $this->hasMany(CompanyAdmin::class);
    }

    public function subscriptionPayments(): HasMany
    {
        return $this->hasMany(SubscriptionPayment::class);
    }
}
