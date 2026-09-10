<?php

namespace App\Http\Controllers\Api;

use App\Models\ChannelAccount;
use Illuminate\Http\Request;
use App\Http\Controllers\Controller;
use Illuminate\Support\Facades\Http;

class ChannelAccountController extends Controller
{
    public function index(Request $request)
    {
        $query = $request->user()->channelAccounts();

        if ($request->filled('provider')) {
            $query->where('provider', $request->provider);
        }

        return response()->json([
            'success' => true,
            'data'    => $query->orderByDesc('updated_at')->get(),
        ]);
    }

    public function store(Request $request)
    {
        $validated = $request->validate([
            'provider'        => 'required|string',
            'connection_type' => 'required|string',
            'account_name'    => 'nullable|string',
            'account_id'      => 'nullable|string',
            'status'          => 'required|string',
        ]);

        $account = $request->user()->channelAccounts()->updateOrCreate(
            [
                'provider'   => $validated['provider'],
                'account_id' => $validated['account_id'],
            ],
            [
                'connection_type' => $validated['connection_type'],
                'account_name'    => $validated['account_name'],
                'status'          => $validated['status'],
                'last_synced_at'  => now(),
            ]
        );

        return response()->json([
            'message' => 'Channel account saved successfully',
            'data'    => $account,
        ]);
    }

    /**
     */
    public function disconnect(Request $request, ChannelAccount $channelAccount)
    {
        abort_if($channelAccount->user_id !== $request->user()->id, 403);

        if ($channelAccount->provider === 'whatsapp') {
            try {
                Http::timeout(10)->post(
                    config('services.whatsapp.gateway_url') . '/logout'
                );
            } catch (\Throwable $e) {
                report($e);
            }
        }

        $channelAccount->update([
            'status'         => 'disconnected',
            'last_synced_at' => now(),
        ]);

        return response()->json([
            'message' => 'Disconnected successfully',
            'data'    => $channelAccount,
        ]);
    }
}