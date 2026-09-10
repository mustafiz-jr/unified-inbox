<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\{Conversation, Message, ChannelAccount, ContactIdentity};
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Http;

class MessageController extends Controller
{
    public function conversations(Request $request)
    {
        $user = $request->user();
        $query = Conversation::with(['contact', 'channelAccount'])
            ->where('user_id', $user->id);

        if ($request->filled('channel_account_id')) {
            $query->where('channel_account_id', $request->channel_account_id);
        }
        if ($request->filled('search')) {
            $query->whereHas(
                'contact',
                fn($q) =>
                $q->where('name', 'like', '%' . $request->search . '%')
            );
        }

        return response()->json(
            $query->orderByDesc('last_message_at')->paginate(30)
        );
    }

    public function messages(Request $request, Conversation $conversation)
    {
        abort_if($conversation->user_id !== $request->user()->id, 403);

        $conversation->update(['unread_count' => 0]);

        return response()->json([
            'conversation' => $conversation->load('contact', 'channelAccount'),
            'messages'     => $conversation->messages()
                ->with('attachments')
                ->orderBy('created_at')
                ->limit(200)
                ->get(),
        ]);
    }

    public function send(Request $request, Conversation $conversation)
    {
        abort_if($conversation->user_id !== $request->user()->id, 403);

        $data = $request->validate([
            'body' => 'required|string|max:5000',
        ]);

        $channel = $conversation->channelAccount;
        $identity = ContactIdentity::where('channel_account_id', $channel->id)
            ->where('contact_id', $conversation->contact_id)
            ->firstOrFail();

        $message = Message::create([
            'conversation_id'    => $conversation->id,
            'channel_account_id' => $channel->id,
            'contact_id'         => $conversation->contact_id,
            'user_id'            => $request->user()->id,
            'direction'          => 'outgoing',
            'type'               => 'text',
            'body'               => $data['body'],
            'status'             => 'pending',
            'sent_at'            => now(),
        ]);

        try {
            $res = Http::timeout(15)->post(config('services.whatsapp.gateway_url') . '/send-message', [
                'channel_account_id' => $channel->id,
                'to'                 => $identity->external_id,
                'body'               => $data['body'],
                'local_message_id'   => $message->id,
            ]);

            if ($res->successful() && $res->json('external_message_id')) {
                $message->update([
                    'external_message_id' => $res->json('external_message_id'),
                    'status'              => 'sent',
                ]);
            } else {
                $message->update(['status' => 'failed']);
            }
        } catch (\Throwable $e) {
            $message->update(['status' => 'failed']);
            report($e);
        }

        $conversation->update([
            'last_message_at'      => now(),
            'last_message_preview' => mb_substr($data['body'], 0, 100),
        ]);

        return response()->json($message->fresh());
    }
}
