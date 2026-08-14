<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class ChatMessage extends Model
{
    public $timestamps = false;

    protected $fillable = [
        'thread_id', 'sender_id', 'sender_admin_id', 'content', 'mentions', 'hidden_from_user_ids', 'message_type', 'visibility', 'attachment_path',
        'attachment_name', 'forwarded_from_id', 'is_deleted', 'hidden_for_staff', 'sent_at', 'edited_at',
    ];

    protected $casts = [
        'mentions'             => 'array',
        'hidden_from_user_ids' => 'array',
        'is_deleted'           => 'boolean',
        'hidden_for_staff'     => 'boolean',
        'sent_at'              => 'datetime',
        'edited_at'            => 'datetime',
    ];

    public function thread(): BelongsTo
    {
        return $this->belongsTo(ChatThread::class, 'thread_id');
    }

    public function sender(): BelongsTo
    {
        return $this->belongsTo(User::class, 'sender_id');
    }

    public function senderAdmin(): BelongsTo
    {
        return $this->belongsTo(CompanyAdmin::class, 'sender_admin_id');
    }

    public function forwardedFrom(): BelongsTo
    {
        return $this->belongsTo(ChatMessage::class, 'forwarded_from_id');
    }
}
