<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    // Blueprint::change() needs doctrine/dbal (not installed in this project —
    // same constraint hit earlier for other enum columns), so this widens the
    // enum with a raw ALTER instead. Existing rows/values are untouched.
    public function up(): void
    {
        if (!Schema::hasTable('lead_activities')) {
            return;
        }

        DB::statement("ALTER TABLE lead_activities MODIFY COLUMN type ENUM(
            'created', 'updated', 'status_changed', 'assigned', 'transferred',
            'note_added', 'followup_added', 'followup_completed',
            'converted', 'won', 'lost', 'reopened'
        ) NOT NULL");
    }

    public function down(): void
    {
        if (!Schema::hasTable('lead_activities')) {
            return;
        }

        DB::statement("ALTER TABLE lead_activities MODIFY COLUMN type ENUM(
            'created', 'updated', 'status_changed', 'assigned',
            'note_added', 'followup_added', 'followup_completed',
            'converted', 'won', 'lost', 'reopened'
        ) NOT NULL");
    }
};
