<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('packages', function (Blueprint $table) {
            $table->decimal('price_pkr', 10, 2)->default(0)->after('price');
            $table->decimal('price_usd', 10, 2)->default(0)->after('price_pkr');
            $table->integer('trial_days')->default(14)->after('price_usd');
            $table->boolean('is_popular')->default(false)->after('is_visible');
            $table->json('features')->nullable()->after('description');
        });

        Schema::table('package_modules', function (Blueprint $table) {
            $table->boolean('is_core')->default(false)->after('is_enabled');
        });
    }

    public function down(): void
    {
        Schema::table('packages', function (Blueprint $table) {
            $table->dropColumn(['price_pkr', 'price_usd', 'trial_days', 'is_popular', 'features']);
        });
        Schema::table('package_modules', function (Blueprint $table) {
            $table->dropColumn('is_core');
        });
    }
};
