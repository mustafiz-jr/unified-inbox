<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class Attachment extends Model
{
    protected $fillable = [
        'message_id',
        'file_name',
        'file_path',
        'mime_type',
        'size',
        'external_url',
    ];

    public function message()
    {
        return $this->belongsTo(Message::class);
    }
}
