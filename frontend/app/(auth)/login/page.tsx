'use client';

import { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { FaGithub, FaEye, FaEyeSlash } from 'react-icons/fa';
import axios from 'axios';
import { setAuthToken } from '@/lib/cookies';
import Loading from '@/app/components/loading/Loading';
import { ToastContainer, ToastItem, ToastType } from '@/app/components/toast/Toast';

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

    const [showLoginPassword, setShowLoginPassword] = useState(false);
    const [showRegPassword, setShowRegPassword] = useState(false);

    const [loading, setLoading] = useState(false);

    // ============ Toast state ============
    const [toasts, setToasts] = useState<ToastItem[]>([]);

    const pushToast = useCallback((type: ToastType, message: string) => {
        setToasts(prev => [...prev, { id: Date.now() + Math.random(), type, message }]);
    }, []);

    const dismissToast = useCallback((id: number) => {
        setToasts(prev => prev.filter(t => t.id !== id));
    }, []);

    const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api';

    // ============ Handlers ============
    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);

        try {
            const response = await axios.post(`${API_URL}/auth/login`, {
                email: loginEmail,
                password: loginPassword,
            });

            const { token } = response.data;
            setAuthToken(token);

            pushToast('success', 'Login successful! Redirecting...');

            setTimeout(() => {
                router.push('/');
            }, 600);
        } catch (err: any) {
            const message =
                err.response?.data?.message ||
                err.response?.data?.errors?.email?.[0] ||
                'Login failed. Please check your credentials.';
            pushToast('error', message);
            setLoading(false);
        }
    };

    const handleSendOtp = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);

        try {
            await axios.post(`${API_URL}/auth/register/send-otp`, {
                name: regName,
                email: regEmail,
                password: regPassword,
                password_confirmation: regPassword,
            });

            pushToast('success', 'OTP sent successfully to your email!');
            setRegisterStep('otp');
        } catch (err: any) {
            const message =
                err.response?.data?.message ||
                err.response?.data?.errors?.email?.[0] ||
                'Failed to send OTP. Please check your email.';
            pushToast('error', message);
        } finally {
            setLoading(false);
        }
    };

    const handleVerifyOtp = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);

        try {
            const response = await axios.post(`${API_URL}/auth/register/verify`, {
                email: regEmail,
                otp: otp,
            });

            const { token } = response.data;
            setAuthToken(token);

            pushToast('success', 'Account created! Redirecting...');

            setTimeout(() => {
                router.push('/');
            }, 600);
        } catch (err: any) {
            const message =
                err.response?.data?.message ||
                'Invalid OTP. Please try again.';
            pushToast('error', message);
            setLoading(false);
        }
    };

    const handleResendOtp = async () => {
        setLoading(true);

        try {
            await axios.post(`${API_URL}/auth/register/resend-otp`, {
                email: regEmail,
            });
            pushToast('success', 'OTP resent successfully!');
        } catch (err: any) {
            const message =
                err.response?.data?.message || 'Failed to resend OTP.';
            pushToast('error', message);
        } finally {
            setLoading(false);
        }
    };

    // ============ Render ============
    return (
        <>
            {/* ============ Toast Container (Top Right) ============ */}
            <ToastContainer toasts={toasts} onDismiss={dismissToast} />

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

                    {/* ============ LOGIN FORM ============ */}
                    {mode === 'login' && (
                        <form onSubmit={handleLogin} className="space-y-5">
                            <div>
                                <label className="block text-text font-medium mb-1">
                                    Email Address
                                </label>
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
                                <label className="block text-text font-medium mb-1">
                                    Password
                                </label>
                                <div className="relative">
                                    <input
                                        type={showLoginPassword ? 'text' : 'password'}
                                        required
                                        value={loginPassword}
                                        onChange={(e) => setLoginPassword(e.target.value)}
                                        className="w-full px-4 py-3 pr-12 border border-border rounded-lg focus:outline-none focus:ring-1 focus:ring-primary focus:border-transparent transition"
                                        placeholder="••••••••"
                                    />
                                    <button
                                        type="button"
                                        onClick={() => setShowLoginPassword(v => !v)}
                                        className="absolute right-3 top-1/2 -translate-y-1/2 text-text/50 hover:text-primary transition p-1"
                                        aria-label={showLoginPassword ? 'Hide password' : 'Show password'}
                                        tabIndex={-1}
                                    >
                                        {showLoginPassword ? <FaEyeSlash size={18} /> : <FaEye size={18} />}
                                    </button>
                                </div>
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

                    {/* ============ REGISTER FORM ============ */}
                    {mode === 'register' && (
                        <>
                            {registerStep === 'form' ? (
                                <form onSubmit={handleSendOtp} className="space-y-5">
                                    <div>
                                        <label className="block text-text font-medium mb-1">
                                            Full Name
                                        </label>
                                        <input
                                            type="text"
                                            required
                                            value={regName}
                                            onChange={(e) => setRegName(e.target.value)}
                                            className="w-full px-4 py-3 border border-border rounded-lg focus:outline-none focus:ring-1 focus:ring-primary focus:border-transparent transition"
                                            placeholder="John Doe"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-text font-medium mb-1">
                                            Email Address
                                        </label>
                                        <input
                                            type="email"
                                            required
                                            value={regEmail}
                                            onChange={(e) => setRegEmail(e.target.value)}
                                            className="w-full px-4 py-3 border border-border rounded-lg focus:outline-none focus:ring-1 focus:ring-primary focus:border-transparent transition"
                                            placeholder="you@example.com"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-text font-medium mb-1">
                                            Password
                                        </label>
                                        <div className="relative">
                                            <input
                                                type={showRegPassword ? 'text' : 'password'}
                                                required
                                                minLength={8}
                                                value={regPassword}
                                                onChange={(e) => setRegPassword(e.target.value)}
                                                className="w-full px-4 py-3 pr-12 border border-border rounded-lg focus:outline-none focus:ring-1 focus:ring-primary focus:border-transparent transition"
                                                placeholder="Minimum 8 characters"
                                            />
                                            <button
                                                type="button"
                                                onClick={() => setShowRegPassword(v => !v)}
                                                className="absolute right-3 top-1/2 -translate-y-1/2 text-text/50 hover:text-primary transition p-1"
                                                aria-label={showRegPassword ? 'Hide password' : 'Show password'}
                                                tabIndex={-1}
                                            >
                                                {showRegPassword ? <FaEyeSlash size={18} /> : <FaEye size={18} />}
                                            </button>
                                        </div>
                                    </div>
                                    <button
                                        type="submit"
                                        disabled={loading}
                                        className="w-full bg-primary text-white font-semibold rounded-lg hover:bg-opacity-90 transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center min-h-[48px]"
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
                                        <label className="block text-text font-medium mb-1">
                                            Verification Code (OTP)
                                        </label>
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
                        onClick={() => (window.location.href = `${API_URL}/auth/github/redirect`)}
                        className="w-full flex items-center justify-center gap-3 py-3 border border-border rounded-lg hover:bg-primary hover:text-white hover:border-primary bg-white transition text-text font-medium"
                    >
                        <FaGithub className="text-xl" />
                        <span>
                            {mode === 'login' ? 'Sign in with GitHub' : 'Sign up with GitHub'}
                        </span>
                    </button>

                    <div className="mt-6 text-center text-sm text-text/70">
                        {mode === 'login' ? (
                            <>
                                Don&apos;t have an account?{' '}
                                <button
                                    onClick={() => {
                                        setMode('register');
                                        setRegisterStep('form');
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
        </>
    );
}