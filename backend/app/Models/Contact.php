<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class Contact extends Model
{
    protected $fillable = ['user_id', 'name', 'avatar_url', 'notes'];

    /**
     * Expose phone_number virtually from contact_identities.external_id
     */
    protected $appends = ['phone_number'];

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

    public function getPhoneNumberAttribute(): ?string
    {
        $identity = $this->relationLoaded('identities')
            ? $this->identities->first()
            : $this->identities()->first();

        if (!$identity || !$identity->external_id) {
            return null;
        }

        $number = explode('@', $identity->external_id)[0];
        $number = preg_replace('/\D/', '', $number);

        return $number ?: null;
    }
}
