<?php

use App\Http\Controllers\Api\GitHubAuthController;
use App\Http\Controllers\Api\AuthController;
use App\Http\Controllers\Api\UserController;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Route;

// authentication routes
Route::post('/auth/login', [AuthController::class, 'login']);
Route::post('/auth/register/send-otp', [AuthController::class, 'sendOtp']);
Route::post('/auth/register/verify', [AuthController::class, 'verifyOtp']);
Route::post('/auth/register/resend-otp', [AuthController::class, 'resendOtp']);

// GitHub OAuth Routes (API)
Route::get('/auth/github/redirect', [GitHubAuthController::class, 'redirect']);
Route::get('/auth/github/callback', [GitHubAuthController::class, 'callback']);

// protected routes
Route::middleware(['auth:sanctum', 'inactivity'])->group(function () {
    Route::post('/auth/logout', [AuthController::class, 'logout']);
    Route::get('/user', function (Request $request) {
        return $request->user();
    });
    Route::prefix('users')->group(function () {
        Route::get('/', [UserController::class, 'index']);
        Route::post('/', [UserController::class, 'store']);
        Route::get('/{user}', [UserController::class, 'show']);     
        Route::put('/{user}', [UserController::class, 'update']);  
        Route::delete('/{user}', [UserController::class, 'destroy']); 
    });
});
