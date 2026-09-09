<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Carbon\Carbon;

class CheckInactivity
{
    public function handle(Request $request, Closure $next)
    {
        $user = $request->user();

        if ($user) {
            $token = $user->currentAccessToken();
            if ($token && $token->created_at->diffInHours(now()) >= 24) {
                $token->delete();
                return response()->json(['message' => 'Session expired (24 hours).'], 401);
            }

            if ($user->last_active_at) {
                $inactiveHours = Carbon::parse($user->last_active_at)->diffInHours(now());
                if ($inactiveHours >= 24) {
                    $user->tokens()->delete();
                    return response()->json(['message' => 'Logged out due to inactivity (24 hours).'], 401);
                }
            }

            $user->last_active_at = now();
            $user->save();
        }

        return $next($request);
    }
}
