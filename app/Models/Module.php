<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class Module extends Model
{
    protected $fillable = [
        'key', 'label', 'description', 'sub_modules', 'price_pkr', 'price_usd', 'is_active', 'is_system',
    ];

    protected $casts = [
        'sub_modules' => 'array',
        'price_pkr'   => 'float',
        'price_usd'   => 'float',
        'is_active'   => 'boolean',
        'is_system'   => 'boolean',
    ];
}
