<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\{Conversation, Message};
use Illuminate\Http\Request;

class ConversationController extends Controller
{
    public function update(Request $request, Conversation $conversation)
    {
        abort_if($conversation->user_id !== $request->user()->id, 403);

        $data = $request->validate([
            'is_pinned'   => 'nullable|boolean',
            'is_muted'    => 'nullable|boolean',
            'is_archived' => 'nullable|boolean',
        ]);

        $conversation->update(array_filter($data, fn($v) => $v !== null));

        return response()->json($conversation->fresh());
    }

    public function destroy(Request $request, Conversation $conversation)
    {
        abort_if($conversation->user_id !== $request->user()->id, 403);
        $conversation->delete();
        return response()->json(['status' => 'ok']);
    }

    public function clear(Request $request, Conversation $conversation)
    {
        abort_if($conversation->user_id !== $request->user()->id, 403);
        $conversation->messages()->update([
            'is_deleted' => true,
            'body'       => null,
            'media_url'  => null,
        ]);
        $conversation->update([
            'last_message_preview' => null,
            'unread_count'         => 0,
        ]);
        return response()->json(['status' => 'ok']);
    }

    public function info(Request $request, Conversation $conversation)
    {
        abort_if($conversation->user_id !== $request->user()->id, 403);

        $conversation->load(['contact', 'channelAccount']);

        $media = Message::where('conversation_id', $conversation->id)
            ->whereIn('type', ['image', 'video', 'document'])
            ->where('is_deleted', false)
            ->orderByDesc('id')
            ->limit(60)
            ->get(['id', 'type', 'media_url', 'media_mime', 'media_filename', 'created_at']);

        $starred = Message::where('conversation_id', $conversation->id)
            ->where('is_starred', true)
            ->orderByDesc('id')
            ->limit(60)
            ->get();

        return response()->json([
            'conversation' => $conversation,
            'media'        => $media,
            'starred'      => $starred,
        ]);
    }
}
