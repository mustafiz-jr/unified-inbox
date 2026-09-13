<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class MessageReaction extends Model
{
    protected $fillable = ['message_id', 'reactor_jid', 'emoji'];

    public function message()
    {
        return $this->belongsTo(Message::class);
    }
}
