<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Mail;
use Illuminate\Validation\ValidationException;
use Laravel\Sanctum\HasApiTokens;

class AuthController extends Controller
{
   
    public function login(Request $request)
    {
        $request->validate([
            'email' => 'required|email',
            'password' => 'required',
        ]);

        $user = User::where('email', $request->email)->first();

        if (!$user || !Hash::check($request->password, $user->password)) {
            throw ValidationException::withMessages([
                'email' => ['The provided credentials are incorrect.'],
            ]);
        }

       
        $user->tokens()->delete();

       
        $token = $user->createToken('auth_token')->plainTextToken;

        return response()->json([
            'token' => $token,
            'user' => $user,
        ], 200);
    }

   
    public function sendOtp(Request $request)
    {
        $request->validate([
            'name' => 'required|string|max:255',
            'email' => 'required|email|unique:users,email',
            'password' => 'required|min:8|confirmed',
        ]);

     
        $otp = random_int(100000, 999999);

      
        Cache::put('otp_' . $request->email, [
            'name' => $request->name,
            'password' => Hash::make($request->password),
            'otp' => $otp,
        ], now()->addMinutes(10));

     
        Mail::raw("Your OTP for registration is: $otp", function ($message) use ($request) {
            $message->to($request->email)
                ->subject('Your OTP Code - Unified Inbox');
        });

        return response()->json([
            'message' => 'OTP sent successfully to your email.',
            'email' => $request->email,
        ], 200);
    }

 
    public function verifyOtp(Request $request)
    {
        $request->validate([
            'email' => 'required|email',
            'otp' => 'required|numeric|digits:6',
        ]);

        $cacheKey = 'otp_' . $request->email;

        if (!Cache::has($cacheKey)) {
            return response()->json([
                'message' => 'OTP expired or invalid. Please request a new one.',
            ], 422);
        }

        $cachedData = Cache::get($cacheKey);

   
        if ((int) $cachedData['otp'] !== (int) $request->otp) {
            return response()->json([
                'message' => 'Invalid OTP. Please try again.',
            ], 422);
        }

        if (User::where('email', $request->email)->exists()) {
            return response()->json([
                'message' => 'User already exists with this email.',
            ], 422);
        }

      
        $user = User::create([
            'name' => $cachedData['name'],
            'email' => $request->email,
            'password' => $cachedData['password'],
            'email_verified_at' => now(), 
        ]);

      
        Cache::forget($cacheKey);

    
        $token = $user->createToken('auth_token')->plainTextToken;

        return response()->json([
            'token' => $token,
            'user' => $user,
            'message' => 'Registration successful!',
        ], 201);
    }

   
    public function resendOtp(Request $request)
    {
        $request->validate([
            'email' => 'required|email',
        ]);

        $cacheKey = 'otp_' . $request->email;

        if (!Cache::has($cacheKey)) {
            return response()->json([
                'message' => 'No pending registration found. Please start over.',
            ], 422);
        }

        $cachedData = Cache::get($cacheKey);
        $newOtp = random_int(100000, 999999);
        $cachedData['otp'] = $newOtp;

    
        Cache::put($cacheKey, $cachedData, now()->addMinutes(10));

  
        Mail::raw("Your new OTP for registration is: $newOtp", function ($message) use ($request) {
            $message->to($request->email)
                ->subject('Your New OTP Code - Unified Inbox');
        });

        return response()->json([
            'message' => 'OTP resent successfully.',
        ], 200);
    }

  
    public function logout(Request $request)
    {
        $request->user()->currentAccessToken()->delete();

        return response()->json([
            'message' => 'Logged out successfully.',
        ], 200);
    }
}
