<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class Conversation extends Model
{
    protected $fillable = [
        'user_id',
        'channel_account_id',
        'contact_id',
        'platform',
        'external_thread_id',
        'last_message_at',
        'last_message_preview',
        'unread_count',
        'status',
        'is_archived',
        'is_pinned',
        'is_muted',
    ];

    protected $casts = [
        'last_message_at' => 'datetime',
        'is_archived'     => 'boolean',
        'is_pinned'       => 'boolean',
        'is_muted'        => 'boolean',
        'unread_count'    => 'integer',
    ];

    public function user()
    {
        return $this->belongsTo(User::class);
    }

    public function contact()
    {
        return $this->belongsTo(Contact::class);
    }

    public function channelAccount()
    {
        return $this->belongsTo(ChannelAccount::class);
    }

    public function messages()
    {
        return $this->hasMany(Message::class)->orderBy('created_at');
    }

    public function latestMessage()
    {
        return $this->hasOne(Message::class)->latestOfMany();
    }
}
