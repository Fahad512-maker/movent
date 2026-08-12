<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class ChatParticipant extends Model
{
    public $timestamps = false;

    protected $fillable = [
        'thread_id', 'user_id', 'role', 'added_by', 'last_read_at', 'joined_at', 'muted_at',
        'history_from_message_id',
    ];

    protected $casts = [
        'last_read_at' => 'datetime',
        'joined_at'    => 'datetime',
        'muted_at'     => 'datetime',
        // NULL = this participant reads the whole thread. A message id limits
        // them to `id > history_from_message_id` — set when a Seller invites
        // the Project Manager into a project's client chat with "Chat from
        // now" instead of "View all chat". An id rather than a timestamp
        // because both sides of a timestamp comparison are second-precision
        // here; see the 2026_08_12_130000 migration.
        'history_from_message_id' => 'integer',
    ];

    public function thread(): BelongsTo
    {
        return $this->belongsTo(ChatThread::class, 'thread_id');
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function addedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'added_by');
    }
}
