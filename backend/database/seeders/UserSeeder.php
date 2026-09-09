<?php

namespace Database\Seeders;

use App\Models\User;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\Hash;

class UserSeeder extends Seeder
{
    public function run(): void
    {
        
        User::factory()->create([
            'name' => 'Super Admin',
            'email' => 'mustafijjr@gmail.com',
            'password' => Hash::make('password'),
            'role' => 'super_admin',
        ]);
     
        for ($i = 1; $i <= 9; $i++) {
            User::factory()->create([
                'name' => 'Demo User ' . $i,
                'email' => 'demouser-' . $i . '@gmail.com', 
                'password' => Hash::make('password'),
                'role' => 'user',
            ]);
        }

        // (ঐচ্ছিক) চাইলে demouserone, demousertwo … এই নামেও দিতে পারেন, কিন্তু উপরের ফরম্যাটই সহজ।
        // আপনার ইচ্ছা মতো:
        // $names = ['one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine'];
        // foreach ($names as $index => $word) {
        //     User::factory()->create([
        //         'name' => 'Demo User ' . ucfirst($word),
        //         'email' => 'demouser' . $word . '@gmail.com',
        //         'password' => Hash::make('password'),
        //         'role' => 'user',
        //     ]);
        // }
    }
}
