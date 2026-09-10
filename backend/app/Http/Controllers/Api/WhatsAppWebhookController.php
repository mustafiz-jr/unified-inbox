<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\ChannelAccount;
use App\Models\Contact;
use App\Models\ContactIdentity;
use App\Models\Conversation;
use App\Models\Message;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class WhatsAppWebhookController extends Controller
{
    public function handleIncoming(Request $request)
    {
        $secret = $request->header('X-Webhook-Secret');
        if ($secret !== config('services.whatsapp.webhook_secret')) {
            return response()->json(['error' => 'Unauthorized'], 401);
        }

        $data = $request->validate([
            'channel_account_id'      => 'required|exists:channel_accounts,id',
            'contact_external_id'     => 'required|string',
            'contact_display_name'    => 'nullable|string',
            'external_message_id'     => 'required|string',
            'type'                    => 'required|string',
            'body'                    => 'nullable|string',
            'from_me'                 => 'required|boolean',
            'timestamp'               => 'nullable|integer',
            'metadata'                => 'nullable|array',
        ]);

        return DB::transaction(function () use ($data) {
            $channel = ChannelAccount::with('user')->findOrFail($data['channel_account_id']);
            $userId  = $channel->user_id;

            $identity = ContactIdentity::where('channel_account_id', $channel->id)
                ->where('external_id', $data['contact_external_id'])
                ->first();

            if (!$identity) {
                $contact = Contact::create([
                    'user_id' => $userId,
                    'name'    => $data['contact_display_name'] ?? $data['contact_external_id'],
                ]);
                $identity = ContactIdentity::create([
                    'contact_id'         => $contact->id,
                    'channel_account_id' => $channel->id,
                    'provider'           => 'whatsapp',
                    'external_id'        => $data['contact_external_id'],
                    'display_name'       => $data['contact_display_name'] ?? null,
                ]);
            } else {
                $contact = $identity->contact;
                if (!empty($data['contact_display_name']) && $contact->name !== $data['contact_display_name']) {
                    $contact->update(['name' => $data['contact_display_name']]);
                }
            }

            $conversation = Conversation::firstOrCreate(
                ['channel_account_id' => $channel->id, 'contact_id' => $contact->id],
                ['user_id' => $userId, 'platform' => 'whatsapp', 'status' => 'open']
            );

            if (Message::where('external_message_id', $data['external_message_id'])->exists()) {
                return response()->json(['status' => 'duplicate']);
            }

            $direction = $data['from_me'] ? 'outgoing' : 'incoming';

            $message = Message::create([
                'conversation_id'     => $conversation->id,
                'channel_account_id'  => $channel->id,
                'contact_id'          => $contact->id,
                'user_id'             => $userId,
                'direction'           => $direction,
                'external_message_id' => $data['external_message_id'],
                'type'                => $data['type'],
                'body'                => $data['body'],
                'metadata'            => $data['metadata'] ?? null,
                'status'              => 'sent',
                'sent_at'             => isset($data['timestamp'])
                    ? \Carbon\Carbon::createFromTimestamp($data['timestamp'])
                    : now(),
            ]);

            $conversation->update([
                'last_message_at'      => $message->sent_at ?? now(),
                'last_message_preview' => mb_substr($data['body'] ?? "[{$data['type']}]", 0, 100),
                'unread_count'         => $direction === 'incoming'
                    ? $conversation->unread_count + 1
                    : $conversation->unread_count,
            ]);

            return response()->json([
                'status'         => 'ok',
                'message_id'     => $message->id,
                'conversation_id' => $conversation->id,
            ]);
        });
    }
}
