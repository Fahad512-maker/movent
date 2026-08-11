<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class ClientPortalPermission extends Model
{
    public $timestamps = false;

    protected $fillable = ['client_id', 'module_key', 'is_enabled'];

    protected $casts = ['is_enabled' => 'boolean'];

    public function client(): BelongsTo
    {
        return $this->belongsTo(Client::class);
    }

    // All portal modules with their default state (all on by default)
    public const MODULES = [
        'projects'  => 'Projects',
        'invoices'  => 'Invoices',
        'payments'  => 'Payment History',
        'documents' => 'Documents',
        'chat'      => 'Chat',
        'support'   => 'Support Tickets',
        'reports'   => 'Reports',
    ];
}
