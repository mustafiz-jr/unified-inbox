<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\ChannelAccount;
use App\Models\Contact;
use App\Models\ContactIdentity;
use App\Models\Conversation;
use App\Models\Message;
use Carbon\Carbon;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;

class WhatsAppWebhookController extends Controller
{
    // ==================================================
    // Webhook secret
    // ==================================================
    private function checkSecret(Request $request): bool
    {
        return $request->header('X-Webhook-Secret')
            === config('services.whatsapp.webhook_secret');
    }

    // ==================================================
    // Name quality helpers
    // ==================================================
    private function normalizeExternalId(?string $externalId): ?string
    {
        if (!$externalId) return null;
        return preg_replace('/:\d+(?=@)/', '', trim($externalId));
    }

    private function phoneNumberFromExternalId(?string $externalId): ?string
    {
        if (!$externalId) return null;
        $normalized = $this->normalizeExternalId($externalId);
        if (!$normalized) return null;
        $number = explode('@', $normalized)[0] ?? '';
        $number = preg_replace('/\D/', '', $number);
        return $number ?: null;
    }

    private function cleanDisplayName(?string $name, ?string $phoneNumber = null): ?string
    {
        if (!$name) return null;
        $name = trim($name);
        if ($name === '') return null;

        if ($phoneNumber && ($name === $phoneNumber || $name === '+' . $phoneNumber)) {
            return null;
        }
        return $name;
    }

    private function looksLikePhoneNumber(?string $value, ?string $compareTo = null): bool
    {
        if (!$value) return false;
        $digits = preg_replace('/\D/', '', $value);
        if (strlen($digits) < 8) return false;

        if ($compareTo) {
            $other = preg_replace('/\D/', '', $compareTo);
            return $digits === $other;
        }
        return true;
    }

    /**
     * Decide whether $newName is better than $currentName.
     * Never downgrade a real name to a phone number.
     */
    private function isBetterName(?string $newName, ?string $currentName, ?string $externalId = null): bool
    {
        $newName = $newName !== null ? trim($newName) : null;
        $currentName = $currentName !== null ? trim($currentName) : null;

        if (!$newName) return false;
        if (!$currentName) return true;
        if ($newName === $currentName) return false;

        $currentIsNumber = $this->looksLikePhoneNumber($currentName, $externalId);
        $newIsNumber = $this->looksLikePhoneNumber($newName, $externalId);

        if ($currentIsNumber && !$newIsNumber) return true;
        if (!$currentIsNumber && $newIsNumber) return false;

        return true;
    }

    // ==================================================
    // Single realtime message
    // ==================================================
    public function handleIncoming(Request $request)
    {
        if (!$this->checkSecret($request)) {
            return response()->json(['error' => 'Unauthorized'], 401);
        }

        $data = $request->validate([
            'channel_account_id'   => 'required|exists:channel_accounts,id',
            'contact_external_id'  => 'required|string',
            'contact_display_name' => 'nullable|string|max:255',
            'external_message_id'  => 'required|string',
            'type'                 => 'required|string',
            'body'                 => 'nullable|string',
            'from_me'              => 'required|boolean',
            'timestamp'            => 'nullable|integer',
            'metadata'             => 'nullable|array',
            'media_url'            => 'nullable|string',
            'media_mime'           => 'nullable|string',
            'media_filename'       => 'nullable|string',
            'media_duration'       => 'nullable|integer',
            'media_size'           => 'nullable|integer',
            'reply_to_external_id' => 'nullable|string',
            'reply_to_body'        => 'nullable|string',
            'reply_to_from_me'     => 'nullable|boolean',
        ]);

        return DB::transaction(function () use ($data) {
            $channel = ChannelAccount::findOrFail($data['channel_account_id']);
            $userId  = $channel->user_id;

            if (Message::where('external_message_id', $data['external_message_id'])->exists()) {
                return response()->json(['status' => 'duplicate']);
            }

            [$contact, $identity] = $this->resolveContact(
                $userId,
                $channel->id,
                $data['contact_external_id'],
                $data['contact_display_name'] ?? null
            );

            $conversation = Conversation::firstOrCreate(
                [
                    'channel_account_id' => $channel->id,
                    'contact_id'         => $contact->id,
                ],
                [
                    'user_id'  => $userId,
                    'platform' => 'whatsapp',
                    'status'   => 'open',
                ]
            );


            $replyToId = null;
            if (!empty($data['reply_to_external_id'])) {
                $replyToId = Message::where('external_message_id', $data['reply_to_external_id'])
                    ->value('id');
            }

            $direction = $data['from_me'] ? 'outgoing' : 'incoming';
            $sentAt = isset($data['timestamp'])
                ? Carbon::createFromTimestamp($data['timestamp'])
                : now();

            $message = Message::create([
                'conversation_id'     => $conversation->id,
                'channel_account_id'  => $channel->id,
                'contact_id'          => $contact->id,
                'user_id'             => $userId,
                'direction'           => $direction,
                'external_message_id' => $data['external_message_id'],
                'reply_to_id'         => $replyToId,
                'type'                => $data['type'],
                'body'                => $data['body'] ?? null,
                'metadata'            => $data['metadata'] ?? null,
                'media_url'           => $data['media_url'] ?? null,
                'media_mime'          => $data['media_mime'] ?? null,
                'media_filename'      => $data['media_filename'] ?? null,
                'media_duration'      => $data['media_duration'] ?? null,
                'media_size'          => $data['media_size'] ?? null,
                'status'              => 'sent',
                'sent_at'             => $sentAt,
            ]);

            $conversation->update([
                'last_message_at'      => $sentAt,
                'last_message_preview' => mb_substr(
                    $data['body'] ?? "[{$data['type']}]",
                    0,
                    100
                ),
                'unread_count' => $direction === 'incoming'
                    ? $conversation->unread_count + 1
                    : $conversation->unread_count,
            ]);

            return response()->json([
                'status'          => 'ok',
                'message_id'      => $message->id,
                'conversation_id' => $conversation->id,
                'contact_id'      => $contact->id,
                'contact_name'    => $contact->name,
            ]);
        });
    }

    // ==================================================
    // Bulk history sync
    // ==================================================
    public function handleHistory(Request $request)
    {
        if (!$this->checkSecret($request)) {
            return response()->json(['error' => 'Unauthorized'], 401);
        }

        $data = $request->validate([
            'channel_account_id' => 'required|exists:channel_accounts,id',
            'messages' => 'required|array',
            'messages.*.contact_external_id'  => 'required|string',
            'messages.*.contact_display_name' => 'nullable|string|max:255',
            'messages.*.external_message_id'  => 'required|string',
            'messages.*.type'                 => 'required|string',
            'messages.*.from_me'              => 'required|boolean',
        ]);

        $channel = ChannelAccount::findOrFail($data['channel_account_id']);
        $userId = $channel->user_id;

        $saved = 0;
        $skipped = 0;

        $incomingIds = collect($data['messages'])
            ->pluck('external_message_id')
            ->filter()
            ->unique()
            ->values()
            ->all();

        $existingIds = Message::whereIn('external_message_id', $incomingIds)
            ->pluck('external_message_id')
            ->flip();

        $sorted = collect($data['messages'])->sortBy('timestamp')->values();

        $externalContactIds = $sorted
            ->pluck('contact_external_id')
            ->unique()
            ->values()
            ->all();

        $identities = ContactIdentity::where('channel_account_id', $channel->id)
            ->whereIn('external_id', $externalContactIds)
            ->get()
            ->keyBy('external_id');

        DB::beginTransaction();
        try {
            $grouped = $sorted->groupBy('contact_external_id');

            foreach ($grouped as $contactExtId => $msgs) {
                $displayName = $msgs
                    ->pluck('contact_display_name')
                    ->filter()
                    ->first();

                [$contact, $identity] = $this->resolveContact(
                    $userId,
                    $channel->id,
                    $contactExtId,
                    $displayName,
                    $identities
                );

                $conversation = Conversation::firstOrCreate(
                    [
                        'channel_account_id' => $channel->id,
                        'contact_id'         => $contact->id,
                    ],
                    [
                        'user_id'  => $userId,
                        'platform' => 'whatsapp',
                        'status'   => 'open',
                    ]
                );

                $lastMsg = null;
                $unreadAdd = 0;

                foreach ($msgs as $m) {
                    if (isset($existingIds[$m['external_message_id']])) {
                        $skipped++;
                        continue;
                    }

                    $direction = $m['from_me'] ? 'outgoing' : 'incoming';
                    $sentAt = isset($m['timestamp'])
                        ? Carbon::createFromTimestamp($m['timestamp'])
                        : now();

                    Message::create([
                        'conversation_id'     => $conversation->id,
                        'channel_account_id'  => $channel->id,
                        'contact_id'          => $contact->id,
                        'user_id'             => $userId,
                        'direction'           => $direction,
                        'external_message_id' => $m['external_message_id'],
                        'type'                => $m['type'] ?? 'text',
                        'body'                => $m['body'] ?? null,
                        'metadata'            => $m['metadata'] ?? null,
                        'media_url'           => $m['media_url'] ?? null,
                        'media_mime'          => $m['media_mime'] ?? null,
                        'media_filename'      => $m['media_filename'] ?? null,
                        'media_duration'      => $m['media_duration'] ?? null,
                        'media_size'          => $m['media_size'] ?? null,
                        'status'              => 'sent',
                        'sent_at'             => $sentAt,
                    ]);

                    $existingIds[$m['external_message_id']] = true;
                    $lastMsg = $m;
                    if ($direction === 'incoming') $unreadAdd++;
                    $saved++;
                }

                if ($lastMsg) {
                    $ts = isset($lastMsg['timestamp'])
                        ? Carbon::createFromTimestamp($lastMsg['timestamp'])
                        : now();

                    if (
                        !$conversation->last_message_at ||
                        $ts->greaterThan($conversation->last_message_at)
                    ) {
                        $conversation->update([
                            'last_message_at'      => $ts,
                            'last_message_preview' => mb_substr(
                                $lastMsg['body'] ?? "[{$lastMsg['type']}]",
                                0,
                                100
                            ),
                        ]);
                    }

                    if ($unreadAdd) {
                        $conversation->increment('unread_count', $unreadAdd);
                    }
                }
            }

            DB::commit();
        } catch (\Throwable $e) {
            DB::rollBack();
            Log::error('handleHistory failed: ' . $e->getMessage());
            return response()->json(['error' => $e->getMessage()], 500);
        }

        Log::info("History sync: saved={$saved}, skipped={$skipped}");

        return response()->json([
            'status'  => 'ok',
            'saved'   => $saved,
            'skipped' => $skipped,
        ]);
    }

    // ==================================================
    // Update own WhatsApp account name
    // ==================================================
    public function updateAccountName(Request $request)
    {
        if (!$this->checkSecret($request)) {
            return response()->json(['error' => 'Unauthorized'], 401);
        }

        $data = $request->validate([
            'channel_account_id' => 'required|exists:channel_accounts,id',
            'account_name'       => 'required|string|max:255',
        ]);

        $channel = ChannelAccount::findOrFail($data['channel_account_id']);

        if (!$this->isBetterName($data['account_name'], $channel->account_name, $channel->account_id)) {
            return response()->json(['status' => 'skipped']);
        }

        $channel->update(['account_name' => $data['account_name']]);

        Log::info("Channel account name updated: {$channel->id} => {$channel->account_name}");

        return response()->json([
            'status'       => 'ok',
            'account_name' => $channel->account_name,
        ]);
    }

    // ==================================================
    // Bulk update WhatsApp contact names
    // ==================================================
    public function updateContactNames(Request $request)
    {
        if (!$this->checkSecret($request)) {
            return response()->json(['error' => 'Unauthorized'], 401);
        }

        $data = $request->validate([
            'channel_account_id' => 'required|exists:channel_accounts,id',
            'contacts' => 'required|array',
            'contacts.*.external_id'    => 'required|string|max:255',
            'contacts.*.display_name'   => 'nullable|string|max:255',
            'contacts.*.phone_number'   => 'nullable|string|max:30',
        ]);

        $channel = ChannelAccount::findOrFail($data['channel_account_id']);

        $created = 0;
        $updated = 0;
        $skipped = 0;

        DB::beginTransaction();
        try {
            foreach ($data['contacts'] as $contactData) {
                $externalId = $this->normalizeExternalId($contactData['external_id']);
                if (!$externalId) {
                    $skipped++;
                    continue;
                }

                $phoneNumber = $contactData['phone_number']
                    ?? $this->phoneNumberFromExternalId($externalId);

                $displayName = $this->cleanDisplayName(
                    $contactData['display_name'] ?? null,
                    $phoneNumber
                );

                if (!$displayName) {
                    $skipped++;
                    continue;
                }

                $identity = ContactIdentity::where('channel_account_id', $channel->id)
                    ->where('external_id', $externalId)
                    ->first();

                if (!$identity) {
                    $contact = Contact::create([
                        'user_id' => $channel->user_id,
                        'name'    => $displayName,
                    ]);
                    ContactIdentity::create([
                        'contact_id'         => $contact->id,
                        'channel_account_id' => $channel->id,
                        'provider'           => 'whatsapp',
                        'external_id'        => $externalId,
                        'display_name'       => $displayName,
                    ]);
                    $created++;
                    continue;
                }

                if ($this->isBetterName($displayName, $identity->display_name, $externalId)) {
                    $identity->update(['display_name' => $displayName]);
                }

                $contact = $identity->contact;
                if ($contact && $this->isBetterName($displayName, $contact->name, $externalId)) {
                    $contact->update(['name' => $displayName]);
                    $updated++;
                } else {
                    $skipped++;
                }
            }

            DB::commit();
        } catch (\Throwable $e) {
            DB::rollBack();
            Log::error('updateContactNames failed: ' . $e->getMessage());
            return response()->json(['error' => $e->getMessage()], 500);
        }

        return response()->json([
            'status'  => 'ok',
            'created' => $created,
            'updated' => $updated,
            'skipped' => $skipped,
        ]);
    }

    // ==================================================
    // Get / Create Contact + Identity (name-aware)
    // ==================================================
    private function resolveContact(
        $userId,
        $channelAccountId,
        $externalId,
        $displayName,
        &$cache = null
    ) {
        $externalId = $this->normalizeExternalId($externalId);
        $phoneNumber = $this->phoneNumberFromExternalId($externalId);
        $displayName = $this->cleanDisplayName($displayName, $phoneNumber);

        $identity = null;

        if ($cache && $cache->has($externalId)) {
            $identity = $cache->get($externalId);
        } else {
            $identity = ContactIdentity::where('channel_account_id', $channelAccountId)
                ->where('external_id', $externalId)
                ->first();
            if ($cache && $identity) {
                $cache->put($externalId, $identity);
            }
        }

        if (!$identity) {
            $contact = Contact::create([
                'user_id' => $userId,
                'name'    => $displayName
                    ?: ($phoneNumber ? '+' . $phoneNumber : $externalId),
            ]);

            $identity = ContactIdentity::create([
                'contact_id'         => $contact->id,
                'channel_account_id' => $channelAccountId,
                'provider'           => 'whatsapp',
                'external_id'        => $externalId,
                'display_name'       => $displayName,
            ]);

            if ($cache) {
                $cache->put($externalId, $identity);
            }
        } else {
            $contact = $identity->contact;

            if ($displayName && $this->isBetterName($displayName, $identity->display_name, $externalId)) {
                $identity->update(['display_name' => $displayName]);
            }

            if ($contact && $this->isBetterName($displayName, $contact->name, $externalId)) {
                $contact->update(['name' => $displayName]);
            }
        }

        return [$identity->contact, $identity];
    }

    public function handleReaction(Request $request)
    {
        if (!$this->checkSecret($request)) {
            return response()->json(['error' => 'Unauthorized'], 401);
        }

        $data = $request->validate([
            'channel_account_id'  => 'required|exists:channel_accounts,id',
            'external_message_id' => 'required|string',
            'reactor_jid'         => 'required|string',
            'emoji'               => 'nullable|string|max:16',
        ]);

        $message = Message::where('external_message_id', $data['external_message_id'])->first();
        if (!$message) return response()->json(['status' => 'not_found']);

        \App\Models\MessageReaction::where('message_id', $message->id)
            ->where('reactor_jid', $data['reactor_jid'])
            ->delete();

        if (!empty($data['emoji'])) {
            \App\Models\MessageReaction::create([
                'message_id'  => $message->id,
                'reactor_jid' => $data['reactor_jid'],
                'emoji'       => $data['emoji'],
            ]);
        }

        return response()->json(['status' => 'ok']);
    }
}
