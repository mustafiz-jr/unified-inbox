'use client';

import { useEffect, useState } from 'react';
import { useAppDispatch, useAppSelector } from '@/app/store/hooks';
import { fetchUsers, createUser, updateUser, deleteUser, User } from '@/app/store/userSlice';
import UserModal from '@/app/(dashboard)/users/components/UserModal';
import Table from '@/app/components/Table/Table';
import { Column } from '@/app/components/Table/Table';
import { FiPlus } from 'react-icons/fi';

export default function UsersPage() {
    const dispatch = useAppDispatch();
    const { users, loading, error } = useAppSelector((state) => state.users);

    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingUser, setEditingUser] = useState<User | null>(null);

    useEffect(() => {
        dispatch(fetchUsers());
    }, [dispatch]);

    const handleOpenAddModal = () => {
        setEditingUser(null);
        setIsModalOpen(true);
    };

    const handleOpenEditModal = (user: User) => {
        setEditingUser(user);
        setIsModalOpen(true);
    };

    const handleModalSubmit = async (data: any) => {
        try {
            if (editingUser) {
                await dispatch(updateUser({ id: editingUser.id, userData: data })).unwrap();
            } else {
                if (!data.password) {
                    alert('Password is required for new user');
                    return;
                }
                await dispatch(createUser(data)).unwrap();
            }
            setIsModalOpen(false);
            setEditingUser(null);
        } catch (err: any) {
            alert(err || 'Something went wrong');
        }
    };

    const handleDelete = async (user: User) => {
        if (window.confirm(`Are you sure you want to delete "${user.name}"?`)) {
            try {
                await dispatch(deleteUser(user.id)).unwrap();
            } catch (err: any) {
                alert('Delete failed: ' + err);
            }
        }
    };

    const columns: Column<User>[] = [
        {
            key: 'id',
            header: 'ID',
            className: 'w-16',
        },
        {
            key: 'name',
            header: 'Name',
            render: (user) => (
                <div className="flex items-center gap-3">
                    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-secondary/20 text-sm font-medium text-text">
                        {user.name.charAt(0).toUpperCase()}
                    </div>
                    <span className="font-medium">{user.name}</span>
                </div>
            ),
        },
        {
            key: 'email',
            header: 'Email',
        },
    ];

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-text">User Management</h1>
                    <p className="text-sm text-text/60">
                        Manage all users
                    </p>
                </div>
                <button
                    onClick={handleOpenAddModal}
                    className="inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-medium text-white shadow-sm transition hover:bg-primary/90 hover:shadow-md"
                >
                    <FiPlus size={18} />
                    <span>Add User</span>
                </button>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-1">
                <div className="rounded-2xl border border-border bg-surface p-4 shadow-sm">
                    <p className="text-sm text-text/60">Total Users</p>
                    <p className="text-2xl font-bold text-text">{users.length}</p>
                </div>
            </div>

            {/* Table Card */}
            <div className="overflow-hidden rounded-2xl border border-border bg-surface shadow-sm">
                {error ? (
                    <div className="p-6 text-center text-red-500">
                        Error: {typeof error === 'string' ? error : error?.message || 'Something went wrong'}
                    </div>
                ) : (
                    <Table
                        columns={columns}
                        data={users}
                        keyExtractor={(user) => user.id}
                        onEdit={handleOpenEditModal}
                        onDelete={handleDelete}
                        loading={loading}
                        emptyMessage="No users found. Create your first user!"
                    />
                )}
            </div>

            {/* Modal */}
            <UserModal
                isOpen={isModalOpen}
                onClose={() => {
                    setIsModalOpen(false);
                    setEditingUser(null);
                }}
                onSubmit={handleModalSubmit}
                editingUser={editingUser}
            />
        </div>
    );
}