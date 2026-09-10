<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('conversations', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->foreignId('channel_account_id')->constrained()->cascadeOnDelete();
            $table->foreignId('contact_id')->constrained()->cascadeOnDelete();

            $table->string('platform')->default('whatsapp');
            $table->string('external_thread_id')->nullable();

            $table->timestamp('last_message_at')->nullable();
            $table->text('last_message_preview')->nullable();
            $table->unsignedInteger('unread_count')->default(0);

            $table->enum('status', ['open', 'closed', 'archived'])->default('open');
            $table->boolean('is_archived')->default(false);
            $table->boolean('is_pinned')->default(false);
            $table->boolean('is_muted')->default(false);

            $table->timestamps();

            $table->unique(['channel_account_id', 'contact_id']);
            $table->index(['user_id', 'last_message_at']);
            $table->index(['user_id', 'is_archived', 'last_message_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('conversations');
    }
};
