'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { setAuthToken } from '@/lib/cookies';
import Loading from '@/app/components/loading/Loading';

export default function AuthCallbackPage() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const token = searchParams.get('token');
        const errorParam = searchParams.get('error');

        if (errorParam) {
            setError('GitHub authentication failed. Please try again.');
            setTimeout(() => router.push('/login'), 3000);
            return;
        }

        if (token) {
            setAuthToken(token);
            setTimeout(() => {
                router.push('/');
            }, 100);
        } else {
            setError('No token received. Please try again.');
            setTimeout(() => router.push('/login'), 3000);
        }
    }, [searchParams, router]);

    if (error) {
        return (
            <div className="flex min-h-screen items-center justify-center bg-surface">
                <div className="rounded-2xl border border-red-300 bg-red-50 p-6 text-center shadow-lg">
                    <p className="text-red-600">{error}</p>
                    <p className="mt-2 text-sm text-gray-600">Redirecting to login...</p>
                </div>
            </div>
        );
    }

    return (
        <div className="flex min-h-screen items-center justify-center bg-surface">
            <Loading size="lg" text="Logging you in..." />
        </div>
    );
}