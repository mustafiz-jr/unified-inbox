<?php

use App\Http\Controllers\API\GitHubAuthController;
use Illuminate\Support\Facades\Route;

Route::get('/', function () {
    return view('welcome');
});

// GitHub OAuth Routes (Web রাউট)
Route::get('/auth/github/redirect', [GitHubAuthController::class, 'redirect']);
Route::get('/auth/github/callback', [GitHubAuthController::class, 'callback']);
