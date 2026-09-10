<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class ChannelAccount extends Model
{
    protected $fillable = [
        'user_id',
        'provider',
        'connection_type',
        'account_name',
        'account_id',
        'credentials',
        'status',
        'last_synced_at',
    ];

    protected $casts = [
        'last_synced_at' => 'datetime',
    ];

    public function user()
    {
        return $this->belongsTo(User::class);
    }
    public function contacts()
    {
        return $this->hasMany(ContactIdentity::class);
    }
    public function conversations()
    {
        return $this->hasMany(Conversation::class);
    }
    public function messages()
    {
        return $this->hasMany(Message::class);
    }
}
