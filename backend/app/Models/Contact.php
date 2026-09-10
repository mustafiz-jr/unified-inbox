<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class Contact extends Model
{
    protected $fillable = ['user_id', 'name', 'avatar_url', 'notes'];

    public function user()
    {
        return $this->belongsTo(User::class);
    }

    public function identities()
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
