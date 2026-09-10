'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { io, Socket } from 'socket.io-client';
import { FaWhatsapp, FaSignOutAlt } from 'react-icons/fa';
import { fetchConversations, fetchMessages, sendMessage } from '@/lib/inboxApi';
import apiClient from '@/lib/axios';
import Loading from '@/app/components/loading/Loading';

type Conversation = {
    id: number;
    contact: { id: number; name: string; avatar_url?: string | null };
    channel_account: { id: number; provider: string; account_name: string; account_id?: string | null };
    last_message_at: string | null;
    last_message_preview: string | null;
    unread_count: number;
};

type Msg = {
    id: number;
    direction: 'incoming' | 'outgoing';
    body: string | null;
    type: string;
    status: string;
    created_at: string;
};

export default function InboxPage() {
    const router = useRouter();

    const [conversations, setConversations] = useState<Conversation[]>([]);
    const [active, setActive] = useState<Conversation | null>(null);
    const [messages, setMessages] = useState<Msg[]>([]);
    const [input, setInput] = useState('');
    const [loadingList, setLoadingList] = useState(true);
    const [loadingMsgs, setLoadingMsgs] = useState(false);
    const [sending, setSending] = useState(false);

    const [whatsappAccount, setWhatsappAccount] = useState<any>(null);
    const [checkingConnection, setCheckingConnection] = useState(true);
    const [disconnecting, setDisconnecting] = useState(false);

    const socketRef = useRef<Socket | null>(null);
    const threadEndRef = useRef<HTMLDivElement>(null);

    // ==================================================
    // 1. Connection Guard — WhatsApp connected না থাকলে /whatsApp এ ফেরত
    // ==================================================
    useEffect(() => {
        (async () => {
            try {
                const res = await apiClient.get('/channel-accounts', {
                    params: { provider: 'whatsapp' },
                });
                const accounts = res.data?.data || [];
                const wa = accounts.find((a: any) => a.status === 'connected');
                if (!wa) {
                    router.replace('/whatsApp');
                    return;
                }
                setWhatsappAccount(wa);
                setCheckingConnection(false);
            } catch (err) {
                console.error('Connection check failed:', err);
                router.replace('/whatsApp');
            }
        })();
    }, [router]);

    // ==================================================
    // 2. Load Conversations
    // ==================================================
    useEffect(() => {
        if (checkingConnection) return;
        setLoadingList(true);
        fetchConversations()
            .then(res => setConversations(res.data))
            .catch(err => console.error('Failed to load conversations:', err))
            .finally(() => setLoadingList(false));
    }, [checkingConnection]);

    // ==================================================
    // 3. Socket.io — realtime new-message
    // ==================================================
    useEffect(() => {
        if (checkingConnection) return;

        const socket = io('http://localhost:5001', {
            transports: ['websocket', 'polling'],
        });
        socketRef.current = socket;

        // Tell Node which channel account we're watching
        socket.on('connect', () => {
            console.log('✅ Inbox socket connected');
            if (whatsappAccount?.id) {
                socket.emit('set-channel-account', whatsappAccount.id);
            }
        });

        socket.on('new-message', (payload: any) => {
            console.log('📨 new-message', payload);

            // Refresh conversation list (simple + reliable)
            fetchConversations()
                .then(r => setConversations(r.data))
                .catch(err => console.error(err));

            // If this message belongs to the currently open conversation, append
            setActive(current => {
                if (
                    current &&
                    (payload.conversation_id === current.id ||
                        current.contact?.id === payload.contact_id)
                ) {
                    setMessages(m => [
                        ...m,
                        {
                            id: Date.now(),
                            direction: payload.from_me ? 'outgoing' : 'incoming',
                            body: payload.body,
                            type: payload.type,
                            status: 'sent',
                            created_at: new Date().toISOString(),
                        },
                    ]);
                }
                return current;
            });
        });

        socket.on('connect_error', (err) => {
            console.error('Socket error:', err.message);
        });

        return () => {
            socket.disconnect();
        };
    }, [checkingConnection, whatsappAccount?.id]);

    // ==================================================
    // 4. Open a Conversation
    // ==================================================
    const openConversation = async (conv: Conversation) => {
        setActive(conv);
        setLoadingMsgs(true);
        try {
            const res = await fetchMessages(conv.id);
            setMessages(res.messages);
            setConversations(prev =>
                prev.map(c => (c.id === conv.id ? { ...c, unread_count: 0 } : c))
            );
        } catch (err) {
            console.error('Failed to fetch messages:', err);
        } finally {
            setLoadingMsgs(false);
        }
    };

    // ==================================================
    // 5. Send Message
    // ==================================================
    const handleSend = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!active || !input.trim() || sending) return;

        const body = input.trim();
        setInput('');
        setSending(true);

        const tempId = Date.now();
        setMessages(m => [
            ...m,
            {
                id: tempId,
                direction: 'outgoing',
                body,
                type: 'text',
                status: 'pending',
                created_at: new Date().toISOString(),
            },
        ]);

        try {
            const saved = await sendMessage(active.id, body);
            setMessages(m =>
                m.map(x => (x.id === tempId ? { ...x, ...saved, status: 'sent' } : x))
            );
            setConversations(prev =>
                prev.map(c =>
                    c.id === active.id
                        ? {
                            ...c,
                            last_message_preview: body,
                            last_message_at: new Date().toISOString(),
                        }
                        : c
                )
            );
        } catch (err) {
            console.error('Send failed:', err);
            setMessages(m =>
                m.map(x => (x.id === tempId ? { ...x, status: 'failed' } : x))
            );
        } finally {
            setSending(false);
        }
    };

    // ==================================================
    // 6. Disconnect WhatsApp
    // ==================================================
    const handleDisconnect = async () => {
        if (!whatsappAccount) return;
        if (!confirm('Disconnect WhatsApp? You will need to scan QR again.')) return;

        setDisconnecting(true);
        try {
            // Tell Node to logout
            socketRef.current?.emit('logout');

            // Tell Laravel to mark DB disconnected
            await apiClient.post(
                `/channel-accounts/${whatsappAccount.id}/disconnect`
            );

            router.replace('/whatsApp');
        } catch (err) {
            console.error('Disconnect failed:', err);
            alert('Failed to disconnect. Please try again.');
        } finally {
            setDisconnecting(false);
        }
    };

    // ==================================================
    // 7. Auto-scroll thread
    // ==================================================
    useEffect(() => {
        threadEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    // ==================================================
    // 8. RENDER
    // ==================================================

    // Initial connection check
    if (checkingConnection) {
        return (
            <div className="h-[calc(100vh-80px)] flex items-center justify-center bg-white rounded-xl shadow">
                <Loading size="lg" text="Checking WhatsApp connection..." />
            </div>
        );
    }

    return (
        <div className="h-[calc(100vh-80px)] flex flex-col bg-white rounded-xl shadow overflow-hidden">
            {/* ====== Top Bar: WhatsApp account + Disconnect ====== */}
            <div className="flex items-center justify-between px-4 py-3 border-b bg-[#249D8F] text-white shrink-0">
                <div className="flex items-center gap-2 text-sm font-semibold">
                    <FaWhatsapp className="text-xl" />
                    <span>
                        {whatsappAccount?.account_name || 'WhatsApp'}
                        {whatsappAccount?.account_id &&
                            ` · +${whatsappAccount.account_id}`}
                    </span>
                    <span className="ml-2 flex items-center gap-1 text-[11px] bg-white/20 px-2 py-0.5 rounded-full">
                        <span className="h-1.5 w-1.5 rounded-full bg-green-300 animate-pulse" />
                        Connected
                    </span>
                </div>
                <button
                    onClick={handleDisconnect}
                    disabled={disconnecting}
                    className="flex items-center gap-2 px-3 py-1.5 bg-white/20 hover:bg-white/30 rounded-lg text-xs font-medium transition disabled:opacity-50"
                >
                    <FaSignOutAlt />
                    {disconnecting ? 'Disconnecting...' : 'Disconnect'}
                </button>
            </div>

            {/* ====== Main 2-column layout ====== */}
            <div className="flex-1 flex overflow-hidden">
                {/* === Conversation List === */}
                <aside className="w-80 border-r flex flex-col">
                    <div className="p-4 border-b">
                        <h2 className="text-lg font-semibold text-[#1D2128]">Inbox</h2>
                        <p className="text-xs text-gray-500">
                            {conversations.length} conversation
                            {conversations.length !== 1 ? 's' : ''}
                        </p>
                    </div>

                    <div className="flex-1 overflow-y-auto">
                        {loadingList ? (
                            <div className="p-6 flex justify-center">
                                <Loading />
                            </div>
                        ) : conversations.length === 0 ? (
                            <div className="p-6 text-center text-sm text-gray-500">
                                No conversations yet.
                                <br />
                                Wait for a message on WhatsApp.
                            </div>
                        ) : (
                            conversations.map(conv => (
                                <button
                                    key={conv.id}
                                    onClick={() => openConversation(conv)}
                                    className={`w-full text-left px-4 py-3 border-b hover:bg-[#FDF0D5]/50 transition ${active?.id === conv.id ? 'bg-[#FDF0D5]' : ''
                                        }`}
                                >
                                    <div className="flex justify-between items-center">
                                        <span className="font-medium text-sm truncate">
                                            {conv.contact?.name || 'Unknown'}
                                        </span>
                                        {conv.unread_count > 0 && (
                                            <span className="bg-[#E76F51] text-white text-xs px-2 rounded-full">
                                                {conv.unread_count}
                                            </span>
                                        )}
                                    </div>
                                    <p className="text-xs text-gray-500 truncate mt-1">
                                        {conv.last_message_preview || '—'}
                                    </p>
                                    <p className="text-[10px] text-gray-400 mt-1">
                                        {conv.channel_account?.account_name} ·{' '}
                                        {conv.channel_account?.provider}
                                    </p>
                                </button>
                            ))
                        )}
                    </div>
                </aside>

                {/* === Message Thread === */}
                <section className="flex-1 flex flex-col bg-[#FDF0D5]/30">
                    {!active ? (
                        <div className="flex-1 flex items-center justify-center text-gray-400">
                            Select a conversation
                        </div>
                    ) : (
                        <>
                            {/* Thread header */}
                            <div className="p-4 border-b bg-white shrink-0">
                                <div className="font-semibold text-[#1D2128]">
                                    {active.contact?.name}
                                </div>
                                <div className="text-xs text-gray-500">
                                    via {active.channel_account?.account_name} (
                                    {active.channel_account?.provider})
                                </div>
                            </div>

                            {/* Messages */}
                            <div className="flex-1 overflow-y-auto p-4 space-y-3">
                                {loadingMsgs ? (
                                    <div className="flex justify-center pt-10">
                                        <Loading />
                                    </div>
                                ) : messages.length === 0 ? (
                                    <div className="text-center text-sm text-gray-400 pt-10">
                                        No messages yet
                                    </div>
                                ) : (
                                    messages.map(m => (
                                        <div
                                            key={m.id}
                                            className={`flex ${m.direction === 'outgoing'
                                                    ? 'justify-end'
                                                    : 'justify-start'
                                                }`}
                                        >
                                            <div
                                                className={`max-w-[70%] px-3 py-2 rounded-2xl text-sm whitespace-pre-wrap break-words ${m.direction === 'outgoing'
                                                        ? 'bg-[#249D8F] text-white rounded-br-none'
                                                        : 'bg-white border text-[#1D2128] rounded-bl-none'
                                                    }`}
                                            >
                                                {m.body || `[${m.type}]`}
                                                <div
                                                    className={`text-[10px] mt-1 ${m.direction === 'outgoing'
                                                            ? 'text-white/70'
                                                            : 'text-gray-400'
                                                        }`}
                                                >
                                                    {new Date(
                                                        m.created_at
                                                    ).toLocaleTimeString([], {
                                                        hour: '2-digit',
                                                        minute: '2-digit',
                                                    })}
                                                    {m.status === 'pending' && ' · sending'}
                                                    {m.status === 'failed' && ' · ❌ failed'}
                                                </div>
                                            </div>
                                        </div>
                                    ))
                                )}
                                <div ref={threadEndRef} />
                            </div>

                            {/* Composer */}
                            <form
                                onSubmit={handleSend}
                                className="p-3 border-t bg-white flex gap-2 shrink-0"
                            >
                                <input
                                    value={input}
                                    onChange={e => setInput(e.target.value)}
                                    placeholder="Type a message..."
                                    disabled={sending}
                                    className="flex-1 border rounded-full px-4 py-2 text-sm outline-none focus:border-[#249D8F]"
                                />
                                <button
                                    type="submit"
                                    disabled={sending || !input.trim()}
                                    className="bg-[#249D8F] text-white px-5 py-2 rounded-full text-sm font-medium disabled:opacity-50 hover:bg-[#1f8578]"
                                >
                                    {sending ? '...' : 'Send'}
                                </button>
                            </form>
                        </>
                    )}
                </section>
            </div>
        </div>
    );
}