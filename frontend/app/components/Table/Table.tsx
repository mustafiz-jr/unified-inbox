'use client';

import { ReactNode } from 'react';
import { FiEdit2, FiTrash2 } from 'react-icons/fi';
import Loading from '@/app/components/loading/Loading';

export interface Column<T = any> {
    key: string;
    header: string;
    render?: (item: T) => ReactNode;
    className?: string;
}

interface TableProps<T = any> {
    columns: Column<T>[];
    data: T[];
    keyExtractor: (item: T) => string | number;
    onEdit?: (item: T) => void;
    onDelete?: (item: T) => void;
    loading?: boolean;
    emptyMessage?: string;
    actionsLabel?: string;
}

export default function Table<T extends Record<string, any>>({
    columns,
    data,
    keyExtractor,
    onEdit,
    onDelete,
    loading = false,
    emptyMessage = 'No data found',
    actionsLabel = 'Actions',
}: TableProps<T>) {
    if (loading) {
        return (
            <div className="flex items-center justify-center py-12">
                <Loading size="md" text="Loading data..." />
            </div>
        );
    }

    if (data.length === 0) {
        return (
            <div className="py-16 text-center">
                <p className="text-text/50">{emptyMessage}</p>
            </div>
        );
    }

    const hasActions = !!onEdit || !!onDelete;

    return (
        <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-primary/90 text-white">
                    <tr>
                        {columns.map((col) => (
                            <th
                                key={col.key}
                                className={`px-6 py-3 text-left text-xs font-medium uppercase tracking-wider ${col.className || ''
                                    }`}
                            >
                                {col.header}
                            </th>
                        ))}
                        {hasActions && (
                            <th className="px-6 py-3 text-right text-xs font-medium uppercase tracking-wider ">
                                {actionsLabel}
                            </th>
                        )}
                    </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 bg-white">
                    {data.map((item) => {
                        const key = keyExtractor(item);
                        return (
                            <tr
                                key={key}
                                className="group transition hover:bg-primary/5"
                            >
                                {columns.map((col) => (
                                    <td
                                        key={`${key}-${col.key}`}
                                        className={`whitespace-nowrap px-6 py-4 text-sm text-text ${col.className || ''
                                            }`}
                                    >
                                        {col.render ? col.render(item) : item[col.key]}
                                    </td>
                                ))}
                                {hasActions && (
                                    <td className="whitespace-nowrap px-6 py-4 text-right text-sm">
                                        <div className="flex items-center justify-end gap-2">
                                            {onEdit && (
                                                <button
                                                    onClick={() => onEdit(item)}
                                                    className="rounded-md p-1.5 text-indigo-600 transition hover:bg-indigo-50 hover:text-indigo-800"
                                                    aria-label="Edit"
                                                >
                                                    <FiEdit2 size={16} />
                                                </button>
                                            )}
                                            {onDelete && (
                                                <button
                                                    onClick={() => onDelete(item)}
                                                    className="rounded-md p-1.5 text-red-500 transition hover:bg-red-50 hover:text-red-700"
                                                    aria-label="Delete"
                                                >
                                                    <FiTrash2 size={16} />
                                                </button>
                                            )}
                                        </div>
                                    </td>
                                )}
                            </tr>
                        );
                    })}
                </tbody>
            </table>
        </div>
    );
}