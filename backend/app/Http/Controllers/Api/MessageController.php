<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\{Conversation, Message, ChannelAccount, ContactIdentity, MessageReaction};
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\DB;

class MessageController extends Controller
{
    // ==================================================
    // Conversation list with filters + search
    // ==================================================
    public function conversations(Request $request)
    {
        $user = $request->user();

        $query = Conversation::with([
            'contact.identities', 
            'channelAccount',
            'latestMessage',
        ])->where('user_id', $user->id);

        if ($request->filled('channel_account_id')) {
            $query->where('channel_account_id', $request->channel_account_id);
        }

        $filter = $request->get('filter', 'all');
        match ($filter) {
            'unread'   => $query->where('unread_count', '>', 0)->where('is_archived', false),
            'archived' => $query->where('is_archived', true),
            'pinned'   => $query->where('is_pinned', true)->where('is_archived', false),
            default    => $query->where('is_archived', false),
        };

        if ($request->filled('search')) {
            $s = $request->search;
            $query->where(function ($q) use ($s) {
                $q->whereHas('contact', fn($c) => $c->where('name', 'like', "%{$s}%"))
                    ->orWhere('last_message_preview', 'like', "%{$s}%");
            });
        }

        $items = $query
            ->orderByDesc('is_pinned')
            ->orderByDesc('last_message_at')
            ->limit(200)
            ->get();

        return response()->json(['data' => $items]);
    }

    // ==================================================
    // Paginated messages (load more going up)
    // ==================================================
    public function messages(Request $request, Conversation $conversation)
    {
        abort_if($conversation->user_id !== $request->user()->id, 403);

        $limit  = min((int) $request->get('limit', 40), 100);
        $before = $request->get('before_id');

        $query = $conversation->messages()
            ->with(['attachments', 'reactions', 'replyTo:id,body,type,direction'])
            ->orderByDesc('id');

        if ($before) {
            $query->where('id', '<', (int) $before);
        }

        $rows = $query->limit($limit + 1)->get();
        $hasMore = $rows->count() > $limit;
        $items = $rows->take($limit)->reverse()->values();

        if (!$before) {
            // First page open: reset unread
            $conversation->update(['unread_count' => 0]);
        }

        return response()->json([
            'conversation' => $conversation->load('contact', 'channelAccount'),
            'messages'     => $items,
            'has_more'     => $hasMore,
        ]);
    }

    // ==================================================
    // Send text (with optional reply_to_id)
    // ==================================================
       public function send(Request $request, Conversation $conversation)
    {
        abort_if($conversation->user_id !== $request->user()->id, 403);

        $data = $request->validate([
            'body'        => 'required|string|max:5000',
            'reply_to_id' => 'nullable|integer|exists:messages,id',
        ]);

        $channel = $conversation->channelAccount;

        $replyTo = null;
        if (!empty($data['reply_to_id'])) {
            $replyTo = Message::where('conversation_id', $conversation->id)
                ->find($data['reply_to_id']);
        }

        $message = Message::create([
            'conversation_id'    => $conversation->id,
            'channel_account_id' => $channel->id,
            'contact_id'         => $conversation->contact_id,
            'user_id'            => $request->user()->id,
            'direction'          => 'outgoing',
            'type'               => 'text',
            'body'               => $data['body'],
            'reply_to_id'        => $replyTo?->id,
            'status'             => 'pending',
            'sent_at'            => now(),
        ]);

        // ⭐ Use first() instead of firstOrFail() — no 404
        $identity = ContactIdentity::where('channel_account_id', $channel->id)
            ->where('contact_id', $conversation->contact_id)
            ->first();

        if (!$identity) {
            // Try fallback: match by any identity for this channel
            $identity = ContactIdentity::where('channel_account_id', $channel->id)
                ->whereHas('contact', fn($q) => $q->where('id', $conversation->contact_id))
                ->first();
        }

        if (!$identity) {
            $message->update(['status' => 'failed']);

            $conversation->update([
                'last_message_at'      => now(),
                'last_message_preview' => mb_substr($data['body'], 0, 100),
            ]);

            return response()->json($message->fresh(['reactions', 'replyTo']));
        }

        try {
            $res = Http::timeout(20)->post(
                rtrim(config('services.whatsapp.gateway_url'), '/') . '/send-message',
                [
                    'channel_account_id' => $channel->id,
                    'to'                 => $identity->external_id,
                    'body'               => $data['body'],
                    'local_message_id'   => $message->id,
                    'reply_to'           => $replyTo ? [
                        'external_message_id' => $replyTo->external_message_id,
                        'from_me'             => $replyTo->direction === 'outgoing',
                        'body'                => $replyTo->body,
                    ] : null,
                ]
            );

            $externalId = $res->json('external_message_id');

            if ($res->successful() && $externalId) {
                $message->update([
                    'external_message_id' => $externalId,
                    'status'              => 'sent',
                ]);
            } else {
                \Log::warning('WhatsApp send failed', [
                    'status' => $res->status(),
                    'body'   => $res->body(),
                ]);
                $message->update(['status' => 'failed']);
            }
        } catch (\Throwable $e) {
            \Log::error('WhatsApp send exception: ' . $e->getMessage());
            $message->update(['status' => 'failed']);
            report($e);
        }

        $conversation->update([
            'last_message_at'      => now(),
            'last_message_preview' => mb_substr($data['body'], 0, 100),
        ]);

        return response()->json($message->fresh(['reactions', 'replyTo']));
    }

    // ==================================================
    // Edit
    // ==================================================
    public function edit(Request $request, Message $message)
    {
        abort_if($message->user_id !== $request->user()->id, 403);
        abort_if($message->direction !== 'outgoing', 403);
        abort_if($message->type !== 'text', 422, 'Only text can be edited');

        $data = $request->validate(['body' => 'required|string|max:5000']);

        try {
            Http::timeout(15)->post(
                config('services.whatsapp.gateway_url') . '/send-edit',
                [
                    'channel_account_id'   => $message->channel_account_id,
                    'to'                   => $message->contact?->identities()
                        ->where('channel_account_id', $message->channel_account_id)
                        ->value('external_id'),
                    'external_message_id'  => $message->external_message_id,
                    'from_me'              => true,
                    'body'                 => $data['body'],
                ]
            );
        } catch (\Throwable $e) {
            report($e);
        }

        $message->update([
            'body'      => $data['body'],
            'edited_at' => now(),
        ]);

        return response()->json($message->fresh(['reactions']));
    }

    // ==================================================
    // Delete (for me / for everyone)
    // ==================================================
    public function destroy(Request $request, Message $message)
    {
        abort_if($message->user_id !== $request->user()->id, 403);

        $scope = $request->get('scope', 'me'); // me | everyone

        if ($scope === 'everyone') {
            abort_if($message->direction !== 'outgoing', 403);

            try {
                Http::timeout(15)->post(
                    config('services.whatsapp.gateway_url') . '/send-delete',
                    [
                        'channel_account_id'  => $message->channel_account_id,
                        'to'                  => $message->contact?->identities()
                            ->where('channel_account_id', $message->channel_account_id)
                            ->value('external_id'),
                        'external_message_id' => $message->external_message_id,
                        'from_me'             => true,
                    ]
                );
            } catch (\Throwable $e) {
                report($e);
            }

            $message->update([
                'is_deleted'           => true,
                'deleted_for_everyone' => true,
                'body'                 => null,
                'media_url'            => null,
            ]);
        } else {
            $message->update([
                'is_deleted'           => true,
                'deleted_for_everyone' => false,
            ]);
        }

        return response()->json(['status' => 'ok']);
    }

    // ==================================================
    // React
    // ==================================================
    public function react(Request $request, Message $message)
    {
        $user = $request->user();
        abort_if($message->user_id !== $user->id, 403);

        $data = $request->validate(['emoji' => 'nullable|string|max:16']);

        $emoji = $data['emoji'] ?? '';

        // Remove existing reaction from 'me'
        MessageReaction::where('message_id', $message->id)
            ->where('reactor_jid', 'me')
            ->delete();

        if ($emoji !== '') {
            MessageReaction::create([
                'message_id'  => $message->id,
                'reactor_jid' => 'me',
                'emoji'       => $emoji,
            ]);
        }

        // Send via gateway
        try {
            Http::timeout(15)->post(
                config('services.whatsapp.gateway_url') . '/send-reaction',
                [
                    'channel_account_id'  => $message->channel_account_id,
                    'to'                  => $message->contact?->identities()
                        ->where('channel_account_id', $message->channel_account_id)
                        ->value('external_id'),
                    'external_message_id' => $message->external_message_id,
                    'from_me'             => $message->direction === 'outgoing',
                    'emoji'               => $emoji,
                ]
            );
        } catch (\Throwable $e) {
            report($e);
        }

        return response()->json(['status' => 'ok']);
    }

    // ==================================================
    // Star / Unstar
    // ==================================================
    public function star(Request $request, Message $message)
    {
        abort_if($message->user_id !== $request->user()->id, 403);
        $message->update(['is_starred' => !$message->is_starred]);
        return response()->json(['is_starred' => $message->is_starred]);
    }

    public function starred(Request $request)
    {
        $rows = Message::with(['conversation.contact'])
            ->where('user_id', $request->user()->id)
            ->where('is_starred', true)
            ->orderByDesc('id')
            ->limit(200)
            ->get();

        return response()->json(['data' => $rows]);
    }

    // ==================================================
    // Forward
    // ==================================================
    public function forward(Request $request, Message $message)
    {
        abort_if($message->user_id !== $request->user()->id, 403);

        $data = $request->validate([
            'conversation_ids'   => 'required|array|min:1',
            'conversation_ids.*' => 'integer|exists:conversations,id',
        ]);

        $results = [];

        foreach ($data['conversation_ids'] as $cid) {
            $conv = Conversation::where('user_id', $request->user()->id)->find($cid);
            if (!$conv) continue;

            $channel  = $conv->channelAccount;
            $identity = ContactIdentity::where('channel_account_id', $channel->id)
                ->where('contact_id', $conv->contact_id)
                ->first();
            if (!$identity) continue;

            $new = Message::create([
                'conversation_id'    => $conv->id,
                'channel_account_id' => $channel->id,
                'contact_id'         => $conv->contact_id,
                'user_id'            => $request->user()->id,
                'direction'          => 'outgoing',
                'type'               => $message->type,
                'body'               => $message->body,
                'media_url'          => $message->media_url,
                'media_mime'         => $message->media_mime,
                'media_filename'     => $message->media_filename,
                'media_duration'     => $message->media_duration,
                'media_size'         => $message->media_size,
                'status'             => 'pending',
                'sent_at'            => now(),
                'metadata'           => array_merge(
                    (array) $message->metadata,
                    ['forwarded' => true]
                ),
            ]);

            try {
                if ($message->type === 'text') {
                    Http::timeout(15)->post(
                        config('services.whatsapp.gateway_url') . '/send-message',
                        [
                            'channel_account_id' => $channel->id,
                            'to'                 => $identity->external_id,
                            'body'               => $message->body,
                            'local_message_id'   => $new->id,
                        ]
                    );
                } else {
                    Http::timeout(30)->post(
                        config('services.whatsapp.gateway_url') . '/send-media',
                        [
                            'channel_account_id' => $channel->id,
                            'to'                 => $identity->external_id,
                            'media_url'          => $message->media_url,
                            'media_type'         => $message->type,
                            'media_mime'         => $message->media_mime,
                            'media_filename'     => $message->media_filename,
                            'caption'            => $message->body,
                            'local_message_id'   => $new->id,
                        ]
                    );
                }
                $new->update(['status' => 'sent']);
            } catch (\Throwable $e) {
                $new->update(['status' => 'failed']);
                report($e);
            }

            $conv->update([
                'last_message_at'      => now(),
                'last_message_preview' => mb_substr(
                    $message->body ?? "[{$message->type}]",
                    0,
                    100
                ),
            ]);

            $results[] = $new->id;
        }

        return response()->json(['status' => 'ok', 'forwarded_ids' => $results]);
    }

    // ==================================================
    // Search messages (global or in-chat)
    // ==================================================
    public function search(Request $request)
    {
        $user = $request->user();
        $q    = trim($request->get('q', ''));
        if ($q === '') return response()->json(['data' => []]);

        $query = Message::with(['conversation.contact'])
            ->where('user_id', $user->id)
            ->where('body', 'like', "%{$q}%")
            ->where('is_deleted', false);

        if ($request->filled('conversation_id')) {
            $query->where('conversation_id', $request->conversation_id);
        }

        $rows = $query->orderByDesc('id')->limit(100)->get();

        return response()->json(['data' => $rows]);
    }

    // ==================================================
    // Mark read / unread
    // ==================================================
    public function markRead(Request $request, Conversation $conversation)
    {
        abort_if($conversation->user_id !== $request->user()->id, 403);
        $conversation->update(['unread_count' => 0]);
        return response()->json(['status' => 'ok']);
    }

    public function markUnread(Request $request, Conversation $conversation)
    {
        abort_if($conversation->user_id !== $request->user()->id, 403);
        $conversation->update(['unread_count' => max(1, $conversation->unread_count)]);
        return response()->json(['status' => 'ok']);
    }

    // ==================================================
    // Retry failed
    // ==================================================
    public function retry(Request $request, Message $message)
    {
        abort_if($message->user_id !== $request->user()->id, 403);
        abort_if($message->status !== 'failed', 422, 'Only failed messages can be retried');

        try {
            $conv = $message->conversation;
            $identity = ContactIdentity::where('channel_account_id', $message->channel_account_id)
                ->where('contact_id', $message->contact_id)
                ->firstOrFail();

            $res = Http::timeout(15)->post(
                config('services.whatsapp.gateway_url') . '/send-message',
                [
                    'channel_account_id' => $message->channel_account_id,
                    'to'                 => $identity->external_id,
                    'body'               => $message->body,
                    'local_message_id'   => $message->id,
                ]
            );

            if ($res->successful()) {
                $message->update([
                    'external_message_id' => $res->json('external_message_id'),
                    'status'              => 'sent',
                ]);
            }
        } catch (\Throwable $e) {
            report($e);
        }

        return response()->json($message->fresh());
    }
}
