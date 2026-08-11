<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Support\Facades\Storage;

class SupportTicketReply extends Model
{
    protected $fillable = [
        'ticket_id', 'replied_by', 'replied_by_admin_id', 'message', 'attachment_path', 'attachment_name',
    ];

    protected $appends = ['attachment_url'];

    public function getAttachmentUrlAttribute(): ?string
    {
        return $this->attachment_path ? Storage::disk('public')->url($this->attachment_path) : null;
    }

    public function ticket(): BelongsTo
    {
        return $this->belongsTo(SupportTicket::class, 'ticket_id');
    }

    public function repliedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'replied_by');
    }

    public function repliedByAdmin(): BelongsTo
    {
        return $this->belongsTo(CompanyAdmin::class, 'replied_by_admin_id');
    }
}
