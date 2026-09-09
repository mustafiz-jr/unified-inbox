'use client';

import { useState } from 'react';
import {
    FiSearch,
    FiMoreVertical,
    FiCamera,
    FiEdit,
    FiChevronDown,
    FiMessageCircle,
    FiLock,
} from 'react-icons/fi';
import Loading from '@/app/components/loading/Loading';

const chats = [
    {
        id: 1,
        name: 'Mama',
        lastMessage: 'https://www.facebook.com/share/v/1LWXnwW...',
        time: 'Yesterday',
        avatar: 'B',
    },
    {
        id: 2,
        name: "Shohan Vai (Jomidar's Son)",
        lastMessage: 'Voice call',
        time: 'Yesterday',
        avatar: 'S',
    },
    {
        id: 3,
        name: '+8801614-727560(You)',
        lastMessage: 'Photo',
        time: 'Yesterday',
        avatar: '+',
    },
    {
        id: 5,
        name: 'Add contact',
        lastMessage: 'Ask Meta AI',
        time: 'Yesterday',
        avatar: 'A',
    },
    {
        id: 6,
        name: 'Only Us!',
        lastMessage: 'Only Us!',
        time: 'Yesterday',
        avatar: 'O',
    },
    {
        id: 8,
        name: 'Emon Friend (Airtel)',
        lastMessage: 'Voice call',
        time: 'Monday',
        avatar: 'E',
    },
    {
        id: 9,
        name: 'Abdur Rahman Vai (Sohoj I. T)',
        lastMessage: 'Sunday',
        time: 'Sunday',
        avatar: 'A',
    },
    {
        id: 10,
        name: 'Jahid(MamatoVai)',
        lastMessage: 'Missed voice call',
        time: 'Sunday',
        avatar: 'J',
    },
];

export default function WhatsAppPage() {
    const [activeFilter, setActiveFilter] = useState('All');
    const [loading, setLoading] = useState(false);
    const filters = ['All', 'Unread', 'Favourites', 'Groups'];

    if (loading) {
        return (
            <div className="flex h-screen w-full items-center justify-center">
                <Loading size="lg" text="Loading WhatsApp Conversations..." />
            </div>
        );
    }

    return (
        <div className="h-screen w-full flex items-center justify-center">
            <div className="w-full max-w-[1400px] h-full shadow-lg flex rounded-lg overflow-hidden">

                <div className="w-[380px] h-full border-r border-gray-200 flex flex-col flex-shrink-0">
                    <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
                        <h1 className="text-xl font-semibold text-gray-800">WhatsApp Web</h1>
                        <div className="flex items-center gap-4">
                            <FiCamera className="w-5 h-5 text-gray-600 cursor-pointer hover:text-gray-800" />
                            <FiEdit className="w-5 h-5 text-gray-600 cursor-pointer hover:text-gray-800" />
                            <FiMoreVertical className="w-5 h-5 text-gray-600 cursor-pointer hover:text-gray-800" />
                        </div>
                    </div>

                    <div className="px-3 py-2">
                        <div className="flex items-center bg-white rounded-full px-4 py-2">
                            <FiSearch className="w-4 h-4 text-gray-500 mr-2" />
                            <input
                                type="text"
                                placeholder="Search or start a new chat"
                                className="bg-transparent outline-none text-sm flex-1 text-gray-700 placeholder-gray-400"
                            />
                            <FiChevronDown className="w-4 h-4 text-gray-500 ml-2" />
                        </div>
                    </div>

                    <div className="flex items-center gap-4 px-4 py-1 border-b border-gray-200">
                        {filters.map((filter) => (
                            <button
                                key={filter}
                                onClick={() => setActiveFilter(filter)}
                                className={`relative py-2 text-sm font-medium transition ${activeFilter === filter
                                        ? 'text-green-600'
                                        : 'text-gray-500 hover:text-gray-700'
                                    }`}
                            >
                                {filter}
                                {activeFilter === filter && (
                                    <span className="absolute bottom-0 left-0 w-full h-0.5 bg-green-600 rounded-full" />
                                )}
                            </button>
                        ))}
                    </div>

                    <div className="flex-1 overflow-y-auto">
                        {chats.map((chat) => (
                            <div
                                key={chat.id}
                                className="flex items-center px-4 py-3 border-b border-gray-100 hover:bg-gray-50 cursor-pointer transition"
                            >
                                <div className="w-12 h-12 rounded-full bg-gray-300 flex items-center justify-center text-gray-700 font-semibold text-lg mr-3 flex-shrink-0">
                                    {chat.avatar}
                                </div>

                                <div className="flex-1 min-w-0">
                                    <div className="flex justify-between items-baseline">
                                        <h3 className="text-sm font-medium text-gray-800 truncate">
                                            {chat.name}
                                        </h3>
                                        <span className="text-xs text-gray-400 ml-2 whitespace-nowrap">
                                            {chat.time}
                                        </span>
                                    </div>
                                    <p className="text-sm text-gray-500 truncate">{chat.lastMessage}</p>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                <div className="flex-1 h-full flex flex-col items-center justify-center">
                    <div className="text-center">
                        <div className="flex justify-center mb-4">
                            <div className="w-24 h-24 rounded-full bg-green-100 flex items-center justify-center">
                                <FiMessageCircle className="w-12 h-12 text-green-600" />
                            </div>
                        </div>
                        <h2 className="text-2xl font-light text-gray-700">WhatsApp Web</h2>
                        <p className="text-sm text-gray-400 mt-2">
                            Send and receive messages without keeping your phone online.
                        </p>
                        <div className="mt-4 flex items-center justify-center gap-1 text-xs text-gray-400">
                            <FiLock className="w-3 h-3" />
                            <span>End-to-end encrypted</span>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}