'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { FaGithub } from 'react-icons/fa';
import axios from 'axios';
import { setAuthToken } from '@/lib/cookies';
import Loading from '@/app/components/loading/Loading';

export default function LoginPage() {
    const router = useRouter();

    const [mode, setMode] = useState<'login' | 'register'>('login');
    const [registerStep, setRegisterStep] = useState<'form' | 'otp'>('form');

    const [loginEmail, setLoginEmail] = useState('');
    const [loginPassword, setLoginPassword] = useState('');

    const [regName, setRegName] = useState('');
    const [regEmail, setRegEmail] = useState('');
    const [regPassword, setRegPassword] = useState('');
    const [otp, setOtp] = useState('');

    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState<string | null>(null);

    const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api';

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);
        setSuccess(null);
        setLoading(true);

        try {
            const response = await axios.post(`${API_URL}/auth/login`, {
                email: loginEmail,
                password: loginPassword,
            });

            const { token } = response.data;
            setAuthToken(token);

         
            setTimeout(() => {
                router.push('/');
            }, 100);
        } catch (err: any) {
            setError(err.response?.data?.message || 'Login failed. Please check your credentials.');
            setLoading(false);
        }
    };

    const handleSendOtp = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);
        setSuccess(null);
        setLoading(true);

        try {
            await axios.post(`${API_URL}/auth/register/send-otp`, {
                name: regName,
                email: regEmail,
                password: regPassword,
                password_confirmation: regPassword,
            });

            setSuccess('OTP sent successfully to your email!');
            setRegisterStep('otp');
        } catch (err: any) {
            setError(err.response?.data?.message || 'Failed to send OTP. Please check your email.');
        } finally {
            setLoading(false);
        }
    };

    const handleVerifyOtp = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);
        setSuccess(null);
        setLoading(true);

        try {
            const response = await axios.post(`${API_URL}/auth/register/verify`, {
                email: regEmail,
                otp: otp,
            });

            const { token } = response.data;
            setAuthToken(token);

            setTimeout(() => {
                router.push('/');
            }, 100);
        } catch (err: any) {
            setError(err.response?.data?.message || 'Invalid OTP. Please try again.');
            setLoading(false);
        }
    };

    const handleResendOtp = async () => {
        setError(null);
        setSuccess(null);
        setLoading(true);

        try {
            await axios.post(`${API_URL}/auth/register/resend-otp`, {
                email: regEmail,
            });
            setSuccess('OTP resent successfully!');
        } catch (err: any) {
            setError('Failed to resend OTP.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen w-screen flex items-center justify-center bg-white px-4">
            <div className="w-full max-w-lg bg-surface/50 rounded shadow p-6 md:p-8 border relative">

                {/* Header */}
                <h2 className="text-3xl font-bold text-center text-primary mb-2">
                    {mode === 'login' ? 'Welcome Back' : 'Create Account'}
                </h2>
                <p className="text-center text-text/60 text-sm mb-6">
                    {mode === 'login'
                        ? 'Sign in to manage your unified inbox.'
                        : 'Start managing all your messages from one place.'}
                </p>

                {/* Alerts */}
                {error && (
                    <div className="mb-4 p-3 bg-red-100 text-red-700 rounded-lg text-sm border border-red-300">
                        {error}
                    </div>
                )}
                {success && (
                    <div className="mb-4 p-3 bg-green-100 text-green-700 rounded-lg text-sm border border-green-300">
                        {success}
                    </div>
                )}

                {mode === 'login' && (
                    <form onSubmit={handleLogin} className="space-y-5">
                        <div>
                            <label className="block text-text font-medium mb-1">Email Address</label>
                            <input
                                type="email"
                                required
                                value={loginEmail}
                                onChange={(e) => setLoginEmail(e.target.value)}
                                className="w-full px-4 py-3 border border-border rounded-lg focus:outline-none focus:ring-1 focus:ring-primary focus:border-transparent transition"
                                placeholder="you@example.com"
                            />
                        </div>
                        <div>
                            <label className="block text-text font-medium mb-1">Password</label>
                            <input
                                type="password"
                                required
                                value={loginPassword}
                                onChange={(e) => setLoginPassword(e.target.value)}
                                className="w-full px-4 py-3 border border-border rounded-lg focus:outline-none focus:ring-1 focus:ring-primary focus:border-transparent transition "
                                placeholder="••••••••"
                            />
                        </div>
                        <button
                            type="submit"
                            disabled={loading}
                            className="w-full bg-primary text-white font-semibold rounded-lg hover:bg-opacity-90 transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center min-h-[48px]"
                        >
                            {loading ? <Loading size="sm" /> : 'Sign In'}
                        </button>
                    </form>
                )}

                {mode === 'register' && (
                    <>
                        {registerStep === 'form' ? (
                            <form onSubmit={handleSendOtp} className="space-y-5">
                                <div>
                                    <label className="block text-text font-medium mb-1">Full Name</label>
                                    <input
                                        type="text"
                                        required
                                        value={regName}
                                        onChange={(e) => setRegName(e.target.value)}
                                        className="w-full px-4 py-3 border border-border rounded-lg focus:outline-none focus:ring-1 focus:ring-primary focus:border-transparent transition "
                                        placeholder="John Doe"
                                    />
                                </div>
                                <div>
                                    <label className="block text-text font-medium mb-1">Email Address</label>
                                    <input
                                        type="email"
                                        required
                                        value={regEmail}
                                        onChange={(e) => setRegEmail(e.target.value)}
                                        className="w-full px-4 py-3 border border-border rounded-lg focus:outline-none focus:ring-1 focus:ring-primary focus:border-transparent transition "
                                        placeholder="you@example.com"
                                    />
                                </div>
                                <div>
                                    <label className="block text-text font-medium mb-1">Password</label>
                                    <input
                                        type="password"
                                        required
                                        minLength={8}
                                        value={regPassword}
                                        onChange={(e) => setRegPassword(e.target.value)}
                                        className="w-full px-4 py-3 border border-border rounded-lg focus:outline-none focus:ring-1 focus:ring-primary focus:border-transparent transition"
                                        placeholder="Minimum 8 characters"
                                    />
                                </div>
                                <button
                                    type="submit"
                                    disabled={loading}
                                    className="w-full py-3 bg-primary text-white font-semibold rounded-lg hover:bg-opacity-90 transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center min-h-[48px]"
                                >
                                    {loading ? <Loading size="sm" /> : 'Register & Verify Email'}
                                </button>
                            </form>
                        ) : (
                            <form onSubmit={handleVerifyOtp} className="space-y-5">
                                <p className="text-sm text-text/70 text-center bg-surface p-3 rounded-lg">
                                    We sent a 6-digit code to <strong>{regEmail}</strong>. Please enter it below.
                                </p>
                                <div>
                                    <label className="block text-text font-medium mb-1">Verification Code (OTP)</label>
                                    <input
                                        type="text"
                                        required
                                        maxLength={6}
                                        value={otp}
                                        onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))}
                                        className="w-full px-4 py-1 border border-border rounded-lg focus:outline-none focus:ring-1 focus:ring-primary focus:border-transparent text-center text-2xl tracking-widest"
                                        placeholder="enter 6-digit code"
                                    />
                                </div>
                                <button
                                    type="submit"
                                    disabled={loading}
                                    className="w-full bg-primary text-white font-semibold rounded-lg hover:bg-opacity-90 transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center min-h-[48px]"
                                >
                                    {loading ? <Loading size="sm" /> : 'Verify & Create Account'}
                                </button>

                                <div className="flex items-center justify-between text-sm">
                                    <button
                                        type="button"
                                        onClick={handleResendOtp}
                                        disabled={loading}
                                        className="text-primary hover:underline disabled:opacity-50"
                                    >
                                        Resend Code
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setRegisterStep('form');
                                            setError(null);
                                            setSuccess(null);
                                        }}
                                        className="text-text/60 hover:underline"
                                    >
                                        ← Go Back
                                    </button>
                                </div>
                            </form>
                        )}
                    </>
                )}

                <div className="relative flex items-center my-6">
                    <div className="flex-1 border-t border-border"></div>
                    <span className="px-3 text-sm text-text/50">OR CONTINUE WITH</span>
                    <div className="flex-1 border-t border-border"></div>
                </div>

                <button
                    onClick={() => window.location.href = `${API_URL}/auth/github/redirect`}
                    className="w-full flex items-center justify-center gap-3 py-3 border border-border rounded-lg hover:bg-primary hover:text-white hover:border-primary bg-white transition text-text font-medium"
                >
                    <FaGithub className="text-xl" />
                    <span>{mode === 'login' ? 'Sign in with GitHub' : 'Sign up with GitHub'}</span>
                </button>

                <div className="mt-6 text-center text-sm text-text/70">
                    {mode === 'login' ? (
                        <>
                            Don't have an account?{' '}
                            <button
                                onClick={() => {
                                    setMode('register');
                                    setRegisterStep('form');
                                    setError(null);
                                    setSuccess(null);
                                }}
                                className="text-primary font-semibold hover:underline"
                            >
                                Create one now
                            </button>
                        </>
                    ) : (
                        <>
                            Already have an account?{' '}
                            <button
                                onClick={() => {
                                    setMode('login');
                                    setRegisterStep('form');
                                    setError(null);
                                    setSuccess(null);
                                }}
                                className="text-primary font-semibold hover:underline"
                            >
                                Sign in here
                            </button>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}