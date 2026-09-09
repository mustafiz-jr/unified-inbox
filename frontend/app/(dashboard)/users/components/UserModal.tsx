'use client';

import { useEffect, useState } from 'react';
import { User } from '@/app/store/userSlice';
import { FiX } from 'react-icons/fi';
import Loading from '@/app/components/loading/Loading';

interface UserModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSubmit: (data: any) => Promise<void> | void;
    editingUser: User | null;
}

export default function UserModal({ isOpen, onClose, onSubmit, editingUser }: UserModalProps) {
    const [submitting, setSubmitting] = useState(false);
    const [formData, setFormData] = useState({
        name: '',
        email: '',
        password: '',
    });

    useEffect(() => {
        if (editingUser) {
            setFormData({
                name: editingUser.name,
                email: editingUser.email,
                password: '',
            });
        } else {
            setFormData({ name: '', email: '', password: '' });
        }
    }, [editingUser, isOpen]);

    if (!isOpen) return null;

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setSubmitting(true);
        const payload: any = {
            name: formData.name,
            email: formData.email,
        };
        if (formData.password) payload.password = formData.password;

        try {
            await onSubmit(payload);
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
            <div className="relative w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
                <button
                    onClick={onClose}
                    disabled={submitting}
                    className="absolute right-4 top-4 rounded-full p-1 text-text/40 transition hover:bg-gray-100 hover:text-text disabled:opacity-50"
                >
                    <FiX size={20} />
                </button>

                <h2 className="text-xl font-bold text-text">
                    {editingUser ? 'Edit User' : 'Add New User'}
                </h2>
                <p className="mb-5 text-sm text-text/60">
                    {editingUser ? 'Update user details' : 'Create a new user account'}
                </p>

                <form onSubmit={handleSubmit} className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-text">Full Name</label>
                        <input
                            type="text"
                            required
                            value={formData.name}
                            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                            className="mt-1 w-full rounded-xl border border-border px-4 py-2.5 text-sm text-text outline-none transition focus:border-primary focus:ring-1 focus:ring-primary"
                            placeholder="John Doe"
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-text">Email Address</label>
                        <input
                            type="email"
                            required
                            value={formData.email}
                            onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                            className="mt-1 w-full rounded-xl border border-border px-4 py-2.5 text-sm text-text outline-none transition focus:border-primary focus:ring-1 focus:ring-primary"
                            placeholder="john@example.com"
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-text">
                            Password {editingUser && '(leave blank to keep current)'}
                        </label>
                        <input
                            type="password"
                            required={!editingUser}
                            value={formData.password}
                            onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                            className="mt-1 w-full rounded-xl border border-border px-4 py-2.5 text-sm text-text outline-none transition focus:border-primary focus:ring-1 focus:ring-primary"
                            placeholder={editingUser ? '••••••••' : 'Enter password'}
                        />
                    </div>

                    <div className="flex items-center justify-end gap-3 pt-4">
                        <button
                            type="button"
                            onClick={onClose}
                            disabled={submitting}
                            className="rounded-xl px-5 py-2.5 text-sm font-medium text-text/60 transition hover:bg-gray-100 disabled:opacity-50"
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            disabled={submitting}
                            className="flex min-w-[120px] items-center justify-center rounded-xl bg-primary px-6 py-2.5 text-sm font-medium text-white shadow-sm transition hover:bg-primary/90 hover:shadow-md disabled:opacity-50"
                        >
                            {submitting ? <Loading size="sm" /> : (editingUser ? 'Update User' : 'Create User')}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}