<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('messages', function (Blueprint $table) {
            if (!Schema::hasColumn('messages', 'is_starred')) {
                $table->boolean('is_starred')->default(false)->index();
            }
            if (!Schema::hasColumn('messages', 'edited_at')) {
                $table->timestamp('edited_at')->nullable();
            }
            if (!Schema::hasColumn('messages', 'deleted_for_everyone')) {
                $table->boolean('deleted_for_everyone')->default(false);
            }
        });

        if (!Schema::hasTable('message_reactions')) {
            Schema::create('message_reactions', function (Blueprint $table) {
                $table->id();
                $table->foreignId('message_id')->constrained()->cascadeOnDelete();
                $table->string('reactor_jid'); 
                $table->string('emoji', 16);
                $table->timestamps();
                $table->unique(['message_id', 'reactor_jid']);
                $table->index('message_id');
            });
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('message_reactions');
        Schema::table('messages', function (Blueprint $table) {
            $table->dropColumn(['is_starred', 'edited_at', 'deleted_for_everyone']);
        });
    }
};
