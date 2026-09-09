<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\User;
use Illuminate\Support\Facades\Hash;
use Laravel\Socialite\Facades\Socialite;
use Illuminate\Support\Str;
use Illuminate\Http\Request;

class GitHubAuthController extends Controller
{
    public function redirect()
    {
        return Socialite::driver('github')->stateless()->redirect();
    }

    public function callback(Request $request)
    {
        try {
            $githubUser = Socialite::driver('github')->stateless()->user();

            $user = User::updateOrCreate(
                ['email' => $githubUser->getEmail()],
                [
                    'name' => $githubUser->getName() ?? $githubUser->getNickname(),
                    'provider_id' => $githubUser->getId(),
                    'provider' => 'github',
                    'avatar' => $githubUser->getAvatar(),
                    'password' => Hash::make(Str::random(24)),
                    'email_verified_at' => now(),
                    'last_active_at' => now(),
                ]
            );

            $token = $user->createToken('github-auth-token')->plainTextToken;

            $frontendUrl = config('app.frontend_url', 'http://localhost:3000');
            return redirect()->away($frontendUrl . '/auth/callback?token=' . $token);
        } catch (\Exception $e) {
            return redirect()->away(config('app.frontend_url', 'http://localhost:3000') . '/login?error=github_auth_failed');
        }
    }
}
