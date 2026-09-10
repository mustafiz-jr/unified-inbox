<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('messages', function (Blueprint $table) {
            $table->id();

            $table->foreignId('conversation_id')->constrained()->cascadeOnDelete();
            $table->foreignId('channel_account_id')->constrained()->cascadeOnDelete();
            $table->foreignId('contact_id')->constrained()->cascadeOnDelete();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();

            $table->enum('direction', ['incoming', 'outgoing']);
            $table->enum('type', [
                'text',
                'image',
                'video',
                'audio',
                'document',
                'sticker',
                'location',
                'reaction',
                'other'
            ])->default('text');

            $table->string('external_message_id')->nullable()->unique();
            $table->foreignId('reply_to_id')->nullable()
                ->constrained('messages')->nullOnDelete();

            $table->longText('body')->nullable();
            $table->json('metadata')->nullable();

            $table->string('media_url')->nullable();
            $table->string('media_mime')->nullable();
            $table->string('media_filename')->nullable();
            $table->unsignedInteger('media_duration')->nullable();
            $table->unsignedBigInteger('media_size')->nullable();

            $table->enum('status', [
                'pending',
                'sent',
                'delivered',
                'read',
                'failed'
            ])->default('sent');
            $table->boolean('is_deleted')->default(false);

            $table->timestamp('sent_at')->nullable();
            $table->timestamps();

            $table->index(['conversation_id', 'created_at']);
            $table->index(['channel_account_id', 'created_at']);
            $table->index('external_message_id');
            $table->index('reply_to_id');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('messages');
    }
};
