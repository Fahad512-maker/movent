<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('documents', function (Blueprint $table) {
            $table->boolean('is_visible_to_client')->default(false)->after('is_shared');
        });

        Schema::table('support_tickets', function (Blueprint $table) {
            $table->enum('category', ['billing', 'technical', 'project', 'general'])->default('general')->after('subject');
        });

        Schema::create('support_ticket_replies', function (Blueprint $table) {
            $table->id();
            $table->foreignId('ticket_id')->constrained('support_tickets')->cascadeOnDelete();
            $table->foreignId('replied_by')->nullable()->constrained('users')->nullOnDelete();
            $table->text('message');
            $table->string('attachment_path', 600)->nullable();
            $table->string('attachment_name', 255)->nullable();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('support_ticket_replies');
        Schema::table('support_tickets', function (Blueprint $table) {
            $table->dropColumn('category');
        });
        Schema::table('documents', function (Blueprint $table) {
            $table->dropColumn('is_visible_to_client');
        });
    }
};
