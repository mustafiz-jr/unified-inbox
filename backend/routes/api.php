<?php

use App\Http\Controllers\Api\GitHubAuthController;
use App\Http\Controllers\Api\AuthController;
use App\Http\Controllers\Api\ChannelAccountController;
use App\Http\Controllers\Api\UserController;
use App\Http\Controllers\Api\WhatsAppWebhookController;
use App\Http\Controllers\Api\MessageController;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Route;

// =====================================================
// PUBLIC ROUTES
// =====================================================

// Auth
Route::post('/auth/login', [AuthController::class, 'login']);
Route::post('/auth/register/send-otp', [AuthController::class, 'sendOtp']);
Route::post('/auth/register/verify', [AuthController::class, 'verifyOtp']);
Route::post('/auth/register/resend-otp', [AuthController::class, 'resendOtp']);

// GitHub OAuth
Route::get('/auth/github/redirect', [GitHubAuthController::class, 'redirect']);
Route::get('/auth/github/callback', [GitHubAuthController::class, 'callback']);

// =====================================================
// WEBHOOKS (Node.js → Laravel) — shared secret দিয়ে সুরক্ষিত
// =====================================================
Route::post('/webhooks/whatsapp',         [WhatsAppWebhookController::class, 'handleIncoming']);
Route::post('/webhooks/whatsapp/history', [WhatsAppWebhookController::class, 'handleHistory']);

// =====================================================
// PROTECTED ROUTES
// =====================================================
Route::middleware(['auth:sanctum', 'inactivity'])->group(function () {

    // Auth
    Route::post('/auth/logout', [AuthController::class, 'logout']);
    Route::get('/user', fn(Request $request) => $request->user());

    // Users CRUD
    Route::prefix('users')->group(function () {
        Route::get('/', [UserController::class, 'index']);
        Route::post('/', [UserController::class, 'store']);
        Route::get('/{user}', [UserController::class, 'show']);
        Route::put('/{user}', [UserController::class, 'update']);
        Route::delete('/{user}', [UserController::class, 'destroy']);
    });

    // Channel Accounts
    Route::get('/channel-accounts',  [ChannelAccountController::class, 'index']);
    Route::post('/channel-accounts', [ChannelAccountController::class, 'store']);
    Route::post(
        '/channel-accounts/{channelAccount}/disconnect',
        [ChannelAccountController::class, 'disconnect']
    );

    // Inbox / Conversations / Messages
    Route::get('/conversations',                          [MessageController::class, 'conversations']);
    Route::get('/conversations/{conversation}',           [MessageController::class, 'messages']);
    Route::post('/conversations/{conversation}/send',     [MessageController::class, 'send']);
    Route::post('/conversations/{conversation}/send-media', [MessageController::class, 'sendMedia']);
    Route::post('/conversations/{conversation}/send-voice', [MessageController::class, 'sendVoice']);
});
