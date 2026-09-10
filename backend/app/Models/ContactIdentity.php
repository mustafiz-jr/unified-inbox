<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class ContactIdentity extends Model
{
    protected $fillable = [
        'contact_id',
        'channel_account_id',
        'provider',
        'external_id',
        'display_name',
        'metadata',
    ];

    protected $casts = [
        'metadata' => 'array',
    ];

    public function contact()
    {
        return $this->belongsTo(Contact::class);
    }

    public function channelAccount()
    {
        return $this->belongsTo(ChannelAccount::class);
    }
}
