<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class Message extends Model
{
    protected $fillable = [
        'conversation_id',
        'channel_account_id',
        'contact_id',
        'user_id',
        'direction',
        'external_message_id',
        'reply_to_id',
        'type',
        'body',
        'metadata',
        'media_url',
        'media_mime',
        'media_filename',
        'media_duration',
        'media_size',
        'status',
        'is_deleted',
        'is_starred',
        'deleted_for_everyone',
        'edited_at',
        'sent_at',
    ];

    protected $casts = [
        'metadata'             => 'array',
        'sent_at'              => 'datetime',
        'edited_at'            => 'datetime',
        'is_deleted'           => 'boolean',
        'is_starred'           => 'boolean',
        'deleted_for_everyone' => 'boolean',
        'media_duration'       => 'integer',
        'media_size'           => 'integer',
    ];

    public function conversation()
    {
        return $this->belongsTo(Conversation::class);
    }

    public function contact()
    {
        return $this->belongsTo(Contact::class);
    }

    public function channelAccount()
    {
        return $this->belongsTo(ChannelAccount::class);
    }

    public function user()
    {
        return $this->belongsTo(User::class);
    }

    public function replyTo()
    {
        return $this->belongsTo(Message::class, 'reply_to_id');
    }

    public function attachments()
    {
        return $this->hasMany(Attachment::class);
    }

    public function reactions()
    {
        return $this->hasMany(MessageReaction::class);
    }
}
