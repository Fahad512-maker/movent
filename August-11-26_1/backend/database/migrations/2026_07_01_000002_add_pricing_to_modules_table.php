<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('modules', function (Blueprint $table) {
            $table->decimal('price_pkr', 10, 2)->default(0)->after('sub_modules');
            $table->decimal('price_usd', 10, 2)->default(0)->after('price_pkr');
        });
    }

    public function down(): void
    {
        Schema::table('modules', function (Blueprint $table) {
            $table->dropColumn(['price_pkr', 'price_usd']);
        });
    }
};
