<?php

namespace Database\Factories;

use Illuminate\Database\Eloquent\Factories\Factory;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;

/**
 * @extends \Illuminate\Database\Eloquent\Factories\Factory<\App\Models\User>
 */
class UserFactory extends Factory
{
    protected static ?string $password;

    public function definition(): array
    {
        return [
            'name' => fake()->name(),
            'email' => fake()->unique()->safeEmail(),
            'email_verified_at' => now(),
            'password' => static::$password ??= Hash::make('password'),
            'role' => fake()->randomElement(['user', 'user', 'user', 'user', 'super_admin']), 
            'avatar' => fake()->imageUrl(100, 100, 'people', true, 'avatar'),
            'settings' => ['theme' => fake()->randomElement(['light', 'dark'])],
            'last_active_at' => fake()->dateTimeBetween('-1 week', 'now'),
            'remember_token' => Str::random(10),
        ];
    }

    public function unverified(): static
    {
        return $this->state(fn(array $attributes) => [
            'email_verified_at' => null,
        ]);
    }

    
    public function superAdmin(): static
    {
        return $this->state(fn(array $attributes) => [
            'role' => 'super_admin',
            'name' => 'Mustafizur Rahman',
            'email' => 'mustafijjr@gmail.com',
        ]);
    }
}
