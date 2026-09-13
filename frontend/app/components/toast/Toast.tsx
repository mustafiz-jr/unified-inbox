'use client';

import { useEffect } from 'react';
import { FaCheckCircle, FaExclamationCircle, FaTimes } from 'react-icons/fa';

export type ToastType = 'success' | 'error';

export type ToastItem = {
    id: number;
    type: ToastType;
    message: string;
};

type Props = {
    toasts: ToastItem[];
    onDismiss: (id: number) => void;
};

export function ToastContainer({ toasts, onDismiss }: Props) {
    return (
        <div className="fixed top-4 right-4 z-[9999] flex flex-col gap-2 w-full max-w-sm pointer-events-none">
            {toasts.map(t => (
                <Toast key={t.id} {...t} onDismiss={onDismiss} />
            ))}
        </div>
    );
}

function Toast({
    id,
    type,
    message,
    onDismiss,
}: ToastItem & { onDismiss: (id: number) => void }) {
    useEffect(() => {
        const timer = setTimeout(() => onDismiss(id), 4500);
        return () => clearTimeout(timer);
    }, [id, onDismiss]);

    const isSuccess = type === 'success';

    return (
        <div
            className={`pointer-events-auto flex items-start gap-3 p-3.5 rounded-xl shadow-lg border backdrop-blur-sm animate-[toast-in_0.25s_ease-out] ${isSuccess
                ? 'bg-green-50/95 border-green-200 text-green-800'
                : 'bg-red-50/95 border-red-200 text-red-800'
                }`}
        >
            {isSuccess ? (
                <FaCheckCircle className="text-xl mt-0.5 shrink-0" />
            ) : (
                <FaExclamationCircle className="text-xl mt-0.5 shrink-0" />
            )}
            <p className="text-sm flex-1 break-words leading-relaxed">{message}</p>
            <button
                onClick={() => onDismiss(id)}
                className="opacity-60 hover:opacity-100 transition shrink-0 mt-0.5"
                aria-label="Dismiss"
            >
                <FaTimes />
            </button>
        </div>
    );
}