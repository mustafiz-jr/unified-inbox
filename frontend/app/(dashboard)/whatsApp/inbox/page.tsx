'use client';

import { useEffect, useRef, useState, useMemo, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { io, Socket } from 'socket.io-client';
import {
    FaWhatsapp, FaSignOutAlt, FaSearch, FaEllipsisV, FaPhone, FaVideo,
    FaArrowLeft, FaPaperclip, FaSmile, FaMicrophone, FaPaperPlane,
    FaTimes, FaCheck, FaCheckDouble, FaStar, FaReply, FaTrash, FaEdit,
    FaCopy, FaForward, FaRegStar, FaInfoCircle, FaArchive, FaThumbtack,
    FaBellSlash, FaBell, FaCheckDouble as FaRead, FaEnvelope,
} from 'react-icons/fa';
import { MdOutlineMarkChatUnread } from 'react-icons/md';

import apiClient from '@/lib/axios';
import Loading from '@/app/components/loading/Loading';
import {
    fetchConversations, fetchMessages, sendMessage, editMessage, deleteMessage,
    reactMessage, starMessage, forwardMessage, retryMessage, searchMessages,
    updateConversation, deleteConversation, clearConversation, markRead, markUnread,
    fetchChatInfo, sendTyping,
} from '@/lib/inboxApi';
import ChatInfoPanel from './components/ChatInfoPanel';

type ContactIdentity = { id: number; external_id: string; display_name?: string | null };
type Contact = {
    id: number;
    name: string;
    phone_number?: string | null;
    avatar_url?: string | null;
    identities?: ContactIdentity[];
};
type Conversation = {
    id: number;
    contact: Contact;
    channel_account: { id: number; provider: string; account_name: string; account_id?: string | null };
    last_message_at: string | null;
    last_message_preview: string | null;
    unread_count: number;
    is_pinned: boolean;
    is_muted: boolean;
    is_archived: boolean;
};
type Reaction = { id: number; reactor_jid: string; emoji: string };
type Msg = {
    id: number;
    direction: 'incoming' | 'outgoing';
    body: string | null;
    type: string;
    status: string;
    created_at: string;
    sent_at?: string | null;
    edited_at?: string | null;
    is_starred?: boolean;
    is_deleted?: boolean;
    media_url?: string | null;
    media_mime?: string | null;
    media_filename?: string | null;
    media_duration?: number | null;
    reply_to_id?: number | null;
    reply_to?: { id: number; body: string | null; type: string; direction: string } | null;
    reactions?: Reaction[];
    external_message_id?: string | null;
    contact_external_id?: string;
};

const REACTION_EMOJIS = ['👍', '❤️', '😂', '😮', '😢', '🙏'];
const COMMON_EMOJIS = ['😀', '😁', '😂', '🤣', '😊', '😍', '😘', '😎', '🤔', '😴', '😭', '😡', '👍', '👎', '👏', '🙏', '🔥', '💯', '❤️', '💔', '🎉', '✅', '❌', '⚡', '⭐', '🚀', '☕', '🍕', '🎂'];

export default function InboxPage() {
    const router = useRouter();
    const [conversations, setConversations] = useState<Conversation[]>([]);
    const [active, setActive] = useState<Conversation | null>(null);
    const [messages, setMessages] = useState<Msg[]>([]);
    const [input, setInput] = useState('');
    const [listFilter, setListFilter] = useState<'all' | 'unread' | 'archived' | 'pinned'>('all');
    const [listSearch, setListSearch] = useState('');
    const [loadingList, setLoadingList] = useState(true);
    const [loadingMsgs, setLoadingMsgs] = useState(false);
    const [loadingMore, setLoadingMore] = useState(false);
    const [hasMore, setHasMore] = useState(false);
    const [sending, setSending] = useState(false);
    const [whatsappAccount, setWhatsappAccount] = useState<any>(null);
    const [checkingConnection, setCheckingConnection] = useState(true);
    const [disconnecting, setDisconnecting] = useState(false);
    const [replyTo, setReplyTo] = useState<Msg | null>(null);
    const [editing, setEditing] = useState<Msg | null>(null);
    const [contextMenu, setContextMenu] = useState<{ msg: Msg; x: number; y: number } | null>(null);
    const [reactionPicker, setReactionPicker] = useState<{ msg: Msg; x: number; y: number } | null>(null);
    const [showEmoji, setShowEmoji] = useState(false);
    const [emojiSearch, setEmojiSearch] = useState('');
    const [showInfo, setShowInfo] = useState(false);
    const [showChatSearch, setShowChatSearch] = useState(false);
    const [chatSearch, setChatSearch] = useState('');
    const [chatSearchResults, setChatSearchResults] = useState<Msg[]>([]);
    const [mobileView, setMobileView] = useState<'list' | 'chat'>('list');
    const [presence, setPresence] = useState<Record<string, { presence?: string; lastSeen?: number }>>({});
    const [connected, setConnected] = useState(true);
    const [forwarding, setForwarding] = useState<Msg | null>(null);
    const [forwardSelection, setForwardSelection] = useState<number[]>([]);
    const [selected, setSelected] = useState<Set<number>>(new Set());
    const [newMsgIndicator, setNewMsgIndicator] = useState(false);

    const socketRef = useRef<Socket | null>(null);
    const threadRef = useRef<HTMLDivElement>(null);
    const typingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const typingSentRef = useRef(false);

    // ==================================================
    // Connection guard
    // ==================================================
    useEffect(() => {
        (async () => {
            try {
                const res = await apiClient.get('/channel-accounts', { params: { provider: 'whatsapp' } });
                const wa = (res.data?.data || []).find((a: any) => a.status === 'connected');
                if (!wa) { router.replace('/whatsApp'); return; }
                setWhatsappAccount(wa);
                setCheckingConnection(false);
            } catch {
                router.replace('/whatsApp');
            }
        })();
    }, [router]);

    // ==================================================
    // Load conversations
    // ==================================================
    const loadConversations = useCallback(async () => {
        setLoadingList(true);
        try {
            const res = await fetchConversations({ filter: listFilter, search: listSearch || undefined });
            setConversations(res.data || []);
        } catch (e) { console.error(e); }
        finally { setLoadingList(false); }
    }, [listFilter, listSearch]);

    useEffect(() => {
        if (checkingConnection) return;
        const t = setTimeout(loadConversations, 200);
        return () => clearTimeout(t);
    }, [checkingConnection, loadConversations]);

    // ==================================================
    // Socket
    // ==================================================
    useEffect(() => {
        if (checkingConnection) return;
        const socket = io('http://localhost:5001', { transports: ['websocket', 'polling'] });
        socketRef.current = socket;

        socket.on('connect', () => {
            setConnected(true);
            if (whatsappAccount?.id) socket.emit('set-channel-account', whatsappAccount.id);
        });
        socket.on('disconnect', () => setConnected(false));
        socket.on('connect_error', () => setConnected(false));

        socket.on('user', (user: any) => {
            if (user?.name && user.name !== user.number && user.name !== `+${user.number}`) {
                setWhatsappAccount((p: any) => p ? { ...p, account_name: user.name } : p);
            }
        });

        socket.on('new-message', (payload: any) => {
            loadConversations();
            setActive(current => {
                if (!current) return current;

                const matches =
                    (payload.conversation_id && payload.conversation_id === current.id) ||
                    (payload.contact_id && payload.contact_id === current.contact?.id) ||
                    (payload.contact_external_id && jidFor(current) === payload.contact_external_id);

                if (matches) {
                    const nearBottom = threadRef.current
                        ? threadRef.current.scrollHeight - threadRef.current.scrollTop - threadRef.current.clientHeight < 200
                        : true;

                    setMessages(m => [...m, {
                        id: payload.message_id || payload.local_id || Date.now(),
                        direction: payload.from_me ? 'outgoing' : 'incoming',
                        body: payload.body,
                        type: payload.type,
                        status: 'sent',
                        created_at: new Date().toISOString(),
                        sent_at: new Date().toISOString(),
                        media_url: payload.media_url,
                        media_mime: payload.media_mime,
                        media_filename: payload.media_filename,
                        media_duration: payload.media_duration,
                        external_message_id: payload.external_message_id,
                        reply_to: payload.reply_to_external_id
                            ? { id: 0, body: payload.reply_to_body || '', type: 'text', direction: payload.reply_to_from_me ? 'outgoing' : 'incoming' }
                            : null,
                        reactions: [],
                    }]);

                    if (!nearBottom) setNewMsgIndicator(true);
                    else setTimeout(() => threadRef.current?.scrollTo({ top: threadRef.current.scrollHeight, behavior: 'smooth' }), 50);
                }
                return current;
            });
        });

        socket.on('history-synced', () => loadConversations());

        socket.on('message-reaction', (payload: any) => {
            setMessages(prev => prev.map(m => {
                if (m.external_message_id !== payload.external_message_id) return m;
                const reactions = (m.reactions || []).filter(r => r.reactor_jid !== payload.reactor_jid);
                if (payload.emoji) reactions.push({ id: Date.now(), reactor_jid: payload.reactor_jid, emoji: payload.emoji });
                return { ...m, reactions };
            }));
        });

        socket.on('message-status', (payload: any) => {
            setMessages(prev => prev.map(m => m.external_message_id === payload.external_message_id ? { ...m, status: payload.status } : m));
        });

        socket.on('presence', (payload: any) => {
            setPresence(p => ({ ...p, [payload.jid]: { presence: payload.presence, lastSeen: payload.lastSeen } }));
        });

        return () => { socket.disconnect(); };
    }, [checkingConnection, whatsappAccount?.id, loadConversations]);

    // ==================================================
    // Open conversation
    // ==================================================
    const openConversation = useCallback(async (conv: Conversation) => {
        setActive(conv);
        setMobileView('chat');
        setLoadingMsgs(true);
        setMessages([]);
        setHasMore(false);
        setReplyTo(null);
        setEditing(null);
        setSelected(new Set());
        setShowInfo(false);
        setShowChatSearch(false);
        setChatSearch('');
        setChatSearchResults([]);

        const extId = jidFor(conv);
        if (extId) {
            fetch('http://localhost:5001/subscribe-presence', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ to: extId }),
            }).catch(() => { });
        }

        try {
            const res = await fetchMessages(conv.id, { limit: 40 });
            setMessages(res.messages || []);
            setHasMore(!!res.has_more);
            setConversations(prev => prev.map(c => c.id === conv.id ? { ...c, unread_count: 0 } : c));
            setTimeout(() => threadRef.current?.scrollTo({ top: threadRef.current.scrollHeight }), 80);
        } catch (e) { console.error(e); }
        finally { setLoadingMsgs(false); }
    }, []);

    // ==================================================
    // Load older
    // ==================================================
    const loadOlder = useCallback(async () => {
        if (!active || !hasMore || loadingMore || messages.length === 0) return;
        setLoadingMore(true);
        const beforeId = messages[0].id;
        const prevHeight = threadRef.current?.scrollHeight || 0;
        try {
            const res = await fetchMessages(active.id, { before_id: beforeId, limit: 40 });
            setMessages(prev => [...(res.messages || []), ...prev]);
            setHasMore(!!res.has_more);
            requestAnimationFrame(() => {
                if (threadRef.current) {
                    const newHeight = threadRef.current.scrollHeight;
                    threadRef.current.scrollTop = newHeight - prevHeight;
                }
            });
        } catch (e) { console.error(e); }
        finally { setLoadingMore(false); }
    }, [active, hasMore, loadingMore, messages]);

    // ==================================================
    // Send / edit
    // ==================================================
    const handleSend = async (e?: React.FormEvent) => {
        e?.preventDefault();
        if (!active || !input.trim() || sending) return;
        const body = input.trim();

        // EDIT mode
        if (editing) {
            try {
                const updated = await editMessage(editing.id, body);
                setMessages(m => m.map(x => x.id === editing.id ? { ...x, ...updated } : x));
            } catch (err) { alert('Edit failed'); }
            setEditing(null);
            setInput('');
            return;
        }

        // NEW message
        const replyId = replyTo?.id;
        setInput('');
        setReplyTo(null);
        setSending(true);

        const tempId = Date.now();
        setMessages(m => [...m, {
            id: tempId, direction: 'outgoing', body, type: 'text', status: 'pending',
            created_at: new Date().toISOString(), sent_at: new Date().toISOString(),
            reply_to_id: replyId || null,
            reply_to: replyTo ? { id: replyTo.id, body: replyTo.body, type: replyTo.type, direction: replyTo.direction } : null,
            reactions: [],
        }]);

        try {
            const saved = await sendMessage(active.id, body, replyId);
            setMessages(m => m.map(x => x.id === tempId ? { ...x, ...saved } : x));

            setConversations(prev => prev.map(c => c.id === active.id
                ? { ...c, last_message_preview: body, last_message_at: new Date().toISOString() }
                : c));
            setTimeout(() => threadRef.current?.scrollTo({ top: threadRef.current.scrollHeight, behavior: 'smooth' }), 50);
        } catch (err) {
            setMessages(m => m.map(x => x.id === tempId ? { ...x, status: 'failed' } : x));
        } finally { setSending(false); }
    };

    // ==================================================
    // Typing indicator
    // ==================================================
    const handleInputChange = (v: string) => {
        setInput(v);
        const to = jidFor(active);
        if (!to) return;

        if (!typingSentRef.current) {
            typingSentRef.current = true;
            sendTyping(to, 'composing').catch(() => { });
        }

        if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
        typingTimerRef.current = setTimeout(() => {
            typingSentRef.current = false;
            sendTyping(to, 'paused').catch(() => { });
        }, 2500);
    };

    // ==================================================
    // Disconnect
    // ==================================================
    const handleDisconnect = async () => {
        if (!whatsappAccount) return;
        if (!confirm('Disconnect WhatsApp? You will need to scan QR again.')) return;
        setDisconnecting(true);
        try {
            socketRef.current?.emit('logout');
            await apiClient.post(`/channel-accounts/${whatsappAccount.id}/disconnect`);
            router.replace('/whatsApp');
        } catch { alert('Failed to disconnect.'); }
        finally { setDisconnecting(false); }
    };

    // ==================================================
    // Context menu actions
    // ==================================================
    const handleReact = async (msg: Msg, emoji: string) => {
        setReactionPicker(null);
        setContextMenu(null);
        const mine = (msg.reactions || []).find(r => r.reactor_jid === 'me');
        const newEmoji = mine?.emoji === emoji ? '' : emoji;

        setMessages(prev => prev.map(m => {
            if (m.id !== msg.id) return m;
            const reactions = (m.reactions || []).filter(r => r.reactor_jid !== 'me');
            if (newEmoji) reactions.push({ id: Date.now(), reactor_jid: 'me', emoji: newEmoji });
            return { ...m, reactions };
        }));

        try { await reactMessage(msg.id, newEmoji); } catch { alert('Reaction failed'); }
    };

    const handleStar = async (msg: Msg) => {
        setContextMenu(null);
        try {
            const r = await starMessage(msg.id);
            setMessages(prev => prev.map(m => m.id === msg.id ? { ...m, is_starred: r.is_starred } : m));
        } catch { alert('Failed'); }
    };

    const handleDelete = async (msg: Msg, scope: 'me' | 'everyone') => {
        setContextMenu(null);
        const txt = scope === 'everyone' ? 'Delete for everyone?' : 'Delete this message?';
        if (!confirm(txt)) return;
        try {
            await deleteMessage(msg.id, scope);
            if (scope === 'everyone') {
                setMessages(prev => prev.map(m => m.id === msg.id ? { ...m, body: null, is_deleted: true, media_url: null } : m));
            } else {
                setMessages(prev => prev.filter(m => m.id !== msg.id));
            }
        } catch { alert('Failed to delete'); }
    };

    const handleCopy = (msg: Msg) => {
        setContextMenu(null);
        if (msg.body) navigator.clipboard.writeText(msg.body);
    };

    const handleRetry = async (msg: Msg) => {
        try {
            const updated = await retryMessage(msg.id);
            setMessages(prev => prev.map(m => m.id === msg.id ? { ...m, ...updated } : m));
        } catch { alert('Retry failed'); }
    };

    const startReply = (msg: Msg) => { setContextMenu(null); setReplyTo(msg); setEditing(null); };
    const startEdit = (msg: Msg) => { setContextMenu(null); setEditing(msg); setReplyTo(null); setInput(msg.body || ''); };

    const openForward = (msg: Msg) => {
        setContextMenu(null);
        setForwarding(msg);
        setForwardSelection([]);
    };

    const confirmForward = async () => {
        if (!forwarding || forwardSelection.length === 0) return;
        try {
            await forwardMessage(forwarding.id, forwardSelection);
            setForwarding(null);
            setForwardSelection([]);
            loadConversations();
        } catch { alert('Forward failed'); }
    };

    const handleChatMenu = async (action: 'pin' | 'mute' | 'archive' | 'read' | 'unread' | 'clear' | 'delete', conv: Conversation) => {
        try {
            if (action === 'pin') await updateConversation(conv.id, { is_pinned: !conv.is_pinned });
            if (action === 'mute') await updateConversation(conv.id, { is_muted: !conv.is_muted });
            if (action === 'archive') await updateConversation(conv.id, { is_archived: !conv.is_archived });
            if (action === 'read') await markRead(conv.id);
            if (action === 'unread') await markUnread(conv.id);
            if (action === 'clear') { if (!confirm('Clear all messages?')) return; await clearConversation(conv.id); }
            if (action === 'delete') { if (!confirm('Delete this chat?')) return; await deleteConversation(conv.id); setActive(null); setMobileView('list'); }
            loadConversations();
        } catch { alert('Action failed'); }
    };

    // ==================================================
    // Chat search
    // ==================================================
    useEffect(() => {
        if (!active || !showChatSearch) return;
        const q = chatSearch.trim();
        if (!q) { setChatSearchResults([]); return; }
        const t = setTimeout(async () => {
            try {
                const r = await searchMessages(q, active.id);
                setChatSearchResults(r.data || []);
            } catch { }
        }, 300);
        return () => clearTimeout(t);
    }, [chatSearch, active, showChatSearch]);

    const scrollToMessage = (id: number) => {
        const el = document.getElementById(`msg-${id}`);
        if (el) {
            el.scrollIntoView({ behavior: 'smooth', block: 'center' });
            el.classList.add('ring-2', 'ring-yellow-400');
            setTimeout(() => el.classList.remove('ring-2', 'ring-yellow-400'), 1500);
        }
    };

    // ==================================================
    // Scroll handling
    // ==================================================
    useEffect(() => {
        const el = threadRef.current;
        if (!el) return;
        const onScroll = () => {
            if (el.scrollTop < 100 && hasMore && !loadingMore) loadOlder();
            const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 200;
            if (nearBottom) setNewMsgIndicator(false);
        };
        el.addEventListener('scroll', onScroll);
        return () => el.removeEventListener('scroll', onScroll);
    }, [hasMore, loadingMore, loadOlder]);

    // ==================================================
    // Close menus on Escape / click
    // ==================================================
    useEffect(() => {
        const close = () => { setContextMenu(null); setReactionPicker(null); };
        const esc = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                close();
                setShowEmoji(false);
                setReplyTo(null);
                if (editing) { setEditing(null); setInput(''); }
                if (selected.size) setSelected(new Set());
            }
        };
        window.addEventListener('click', close);
        window.addEventListener('keydown', esc);
        return () => { window.removeEventListener('click', close); window.removeEventListener('keydown', esc); };
    }, [editing, selected]);

    // ==================================================
    // Helpers
    // ==================================================
    const getContactName = (c?: Contact) => c?.name || 'Unknown';

    const dateLabel = (iso: string) => {
        const d = new Date(iso);
        const now = new Date();
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const yest = new Date(today); yest.setDate(today.getDate() - 1);
        const dd = new Date(d.getFullYear(), d.getMonth(), d.getDate());
        if (dd.getTime() === today.getTime()) return 'Today';
        if (dd.getTime() === yest.getTime()) return 'Yesterday';
        return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
    };

    const sameDay = (a: string, b: string) => {
        const d1 = new Date(a), d2 = new Date(b);
        return d1.toDateString() === d2.toDateString();
    };

    const renderStatus = (msg: Msg) => {
        if (msg.direction !== 'outgoing') return null;
        if (msg.status === 'pending') return <span className="text-[10px] opacity-70">🕐</span>;
        if (msg.status === 'failed') return <span className="text-[10px] text-red-300">❌</span>;
        if (msg.status === 'sent') return <FaCheck className="text-[10px] opacity-70" />;
        if (msg.status === 'delivered') return <FaCheckDouble className="text-[10px] opacity-70" />;
        if (msg.status === 'read') return <FaCheckDouble className="text-[10px] text-blue-200" />;
        return null;
    };

    const groupReactions = (msg: Msg) => {
        const map = new Map<string, { count: number; mine: boolean }>();
        (msg.reactions || []).forEach(r => {
            const cur = map.get(r.emoji) || { count: 0, mine: false };
            cur.count++;
            if (r.reactor_jid === 'me') cur.mine = true;
            map.set(r.emoji, cur);
        });
        return Array.from(map.entries()).map(([emoji, v]) => ({ emoji, ...v }));
    };


    const jidFor = (conv: Conversation | null | undefined): string | null => {
        if (!conv?.contact) return null;
        const ext = conv.contact.identities?.[0]?.external_id;
        if (ext) return ext;
        if (conv.contact.phone_number) {
            return `${conv.contact.phone_number}@s.whatsapp.net`;
        }
        return null;
    };


    const presenceFor = (conv: Conversation) => {
        const jid = jidFor(conv);
        if (!jid) return null;
        return presence[jid];
    };

    // ==================================================
    // Loading
    // ==================================================
    if (checkingConnection) {
        return (
            <div className="h-[calc(100vh-80px)] flex items-center justify-center bg-white rounded-xl shadow">
                <Loading size="lg" text="Checking WhatsApp connection..." />
            </div>
        );
    }

    const displayName = whatsappAccount?.account_name || 'WhatsApp';
    const displayNumber = whatsappAccount?.account_id;

    // ==================================================
    // Render
    // ==================================================
    return (
        <div className="h-[calc(100vh-80px)] flex flex-col bg-white rounded-xl shadow overflow-hidden relative">

            {/* ========== Top bar ========== */}
            <div className="flex items-center justify-between px-4 py-3 border-b bg-[#249D8F] text-white shrink-0">
                <div className="flex items-center gap-2 text-sm font-semibold">
                    <FaWhatsapp className="text-xl" />
                    <span className="truncate max-w-[280px]">{displayName}</span>
                    {displayNumber && displayName !== displayNumber && (
                        <span className="text-white/80 font-normal">· +{displayNumber}</span>
                    )}
                    <span className={`ml-2 h-2 w-2 rounded-full ${connected ? 'bg-green-300' : 'bg-red-400 animate-pulse'}`} title={connected ? 'Connected' : 'Reconnecting...'} />
                </div>
                <button onClick={handleDisconnect} disabled={disconnecting} className="text-xl hover:text-red-500" title="Disconnect">
                    <FaSignOutAlt />
                </button>
            </div>

            {/* ========== Main layout ========== */}
            <div className="flex-1 flex overflow-hidden">

                {/* ========== Sidebar ========== */}
                <aside className={`w-full md:w-80 border-r flex-col ${mobileView === 'list' ? 'flex' : 'hidden md:flex'}`}>
                    {/* Search */}
                    <div className="p-3 border-b">
                        <div className="relative">
                            <FaSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-xs" />
                            <input
                                value={listSearch}
                                onChange={e => setListSearch(e.target.value)}
                                placeholder="Search or start new chat"
                                className="w-full bg-gray-100 rounded-lg pl-9 pr-3 py-2 text-sm outline-none focus:bg-white focus:ring-1 focus:ring-[#249D8F]"
                            />
                        </div>
                    </div>

                    {/* Filters */}
                    <div className="flex gap-1 px-2 py-2 border-b overflow-x-auto">
                        {(['all', 'unread', 'pinned', 'archived'] as const).map(f => (
                            <button
                                key={f}
                                onClick={() => setListFilter(f)}
                                className={`text-xs px-3 py-1 rounded-full capitalize whitespace-nowrap ${listFilter === f ? 'bg-[#249D8F] text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
                            >
                                {f}
                            </button>
                        ))}
                    </div>

                    {/* List */}
                    <div className="flex-1 overflow-y-auto">
                        {loadingList ? (
                            <div className="p-6 flex justify-center"><Loading /></div>
                        ) : conversations.length === 0 ? (
                            <div className="p-6 text-center text-sm text-gray-500">
                                {listFilter === 'archived' ? 'No archived chats' :
                                    listSearch ? 'No results' : 'No conversations yet.'}
                            </div>
                        ) : conversations.map(conv => {
                            const p = presenceFor(conv);
                            const isTyping = p?.presence === 'composing';
                            const isOnline = p?.presence === 'available';
                            return (
                                <button
                                    key={conv.id}
                                    onClick={() => openConversation(conv)}
                                    className={`w-full text-left px-3 py-3 border-b hover:bg-[#FDF0D5]/50 transition relative ${active?.id === conv.id ? 'bg-[#FDF0D5]' : ''}`}
                                >
                                    <div className="flex items-start gap-3">
                                        <div className="w-10 h-10 rounded-full bg-[#249D8F]/20 flex items-center justify-center text-[#249D8F] font-semibold shrink-0">
                                            {getContactName(conv.contact).charAt(0).toUpperCase()}
                                            {isOnline && <span className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-green-500 border-2 border-white rounded-full md:relative md:bottom-auto md:right-auto" />}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center justify-between gap-2">
                                                <span className={`text-sm truncate ${conv.unread_count > 0 ? 'font-bold' : 'font-medium'}`}>
                                                    {getContactName(conv.contact)}
                                                </span>
                                                <div className="flex items-center gap-1 shrink-0">
                                                    {conv.is_pinned && <FaThumbtack className="text-[10px] text-gray-400" />}
                                                    {conv.is_muted && <FaBellSlash className="text-[10px] text-gray-400" />}
                                                    <span className="text-[10px] text-gray-400">
                                                        {conv.last_message_at && new Date(conv.last_message_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                                    </span>
                                                </div>
                                            </div>
                                            <div className="flex items-center justify-between gap-2 mt-0.5">
                                                <span className={`text-xs truncate ${conv.unread_count > 0 ? 'text-gray-700 font-medium' : 'text-gray-500'}`}>
                                                    {isTyping ? <span className="text-[#249D8F] italic">typing…</span> : (conv.last_message_preview || '—')}
                                                </span>
                                                {conv.unread_count > 0 && (
                                                    <span className="bg-[#249D8F] text-white text-[10px] px-1.5 rounded-full shrink-0">{conv.unread_count}</span>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                </button>
                            );
                        })}
                    </div>
                </aside>

                {/* ========== Chat area ========== */}
                <section className={`flex-1 flex-col bg-[#FDF0D5]/30 ${mobileView === 'chat' ? 'flex' : 'hidden md:flex'}`}>
                    {!active ? (
                        <div className="flex-1 flex items-center justify-center text-gray-400 text-sm">
                            Select a conversation to start messaging
                        </div>
                    ) : (
                        <>
                            {/* Header */}
                            <div className="px-3 py-2 border-b bg-white flex items-center justify-between shrink-0">
                                <div className="flex items-center gap-2 min-w-0">
                                    <button className="md:hidden text-lg p-1" onClick={() => setMobileView('list')}>
                                        <FaArrowLeft />
                                    </button>
                                    <div className="w-9 h-9 rounded-full bg-[#249D8F]/20 flex items-center justify-center text-[#249D8F] font-semibold shrink-0">
                                        {getContactName(active.contact).charAt(0).toUpperCase()}
                                    </div>
                                    <div className="min-w-0">
                                        <div className="font-semibold text-sm truncate text-[#1D2128]">
                                            {getContactName(active.contact)}
                                        </div>
                                        <div className="text-[11px] text-gray-500 truncate">
                                            {presenceFor(active)?.presence === 'composing' ? (
                                                <span className="text-[#249D8F] italic">typing…</span>
                                            ) : presenceFor(active)?.presence === 'available' ? (
                                                <span className="text-green-600">online</span>
                                            ) : active.contact?.phone_number ? (
                                                `+${active.contact.phone_number}`
                                            ) : 'offline'}
                                        </div>
                                    </div>
                                </div>

                                <div className="flex items-center gap-1 text-gray-500">
                                    <button
                                        className="p-2 hover:bg-gray-100 rounded-full"
                                        onClick={() => setShowChatSearch(s => !s)}
                                        title="Search in chat"
                                    >
                                        <FaSearch />
                                    </button>
                                    {active.contact?.phone_number && (
                                        <>
                                            <a
                                                href={`https://wa.me/${active.contact.phone_number}`}
                                                target="_blank" rel="noreferrer"
                                                className="p-2 hover:bg-gray-100 rounded-full" title="Voice call"
                                            ><FaPhone /></a>
                                            <a
                                                href={`https://wa.me/${active.contact.phone_number}`}
                                                target="_blank" rel="noreferrer"
                                                className="p-2 hover:bg-gray-100 rounded-full hidden sm:block" title="Video call"
                                            ><FaVideo /></a>
                                        </>
                                    )}
                                    <button
                                        className="p-2 hover:bg-gray-100 rounded-full"
                                        onClick={() => setShowInfo(s => !s)}
                                        title="Chat info"
                                    >
                                        <FaInfoCircle />
                                    </button>
                                    <ChatMenu conv={active} onAction={handleChatMenu} />
                                </div>
                            </div>

                            {/* Chat search bar */}
                            {showChatSearch && (
                                <div className="px-3 py-2 border-b bg-white flex items-center gap-2">
                                    <FaSearch className="text-gray-400 text-xs" />
                                    <input
                                        autoFocus
                                        value={chatSearch}
                                        onChange={e => setChatSearch(e.target.value)}
                                        placeholder="Search messages..."
                                        className="flex-1 text-sm outline-none bg-transparent"
                                    />
                                    <span className="text-xs text-gray-400">{chatSearchResults.length} found</span>
                                    <button onClick={() => { setShowChatSearch(false); setChatSearch(''); setChatSearchResults([]); }}>
                                        <FaTimes className="text-gray-400" />
                                    </button>
                                </div>
                            )}

                            {showChatSearch && chatSearchResults.length > 0 && (
                                <div className="max-h-40 overflow-y-auto border-b bg-white">
                                    {chatSearchResults.map(r => (
                                        <button
                                            key={r.id}
                                            onClick={() => scrollToMessage(r.id)}
                                            className="w-full text-left px-3 py-2 border-b last:border-b-0 hover:bg-gray-50 text-xs"
                                        >
                                            <div className="text-gray-700 truncate">{r.body}</div>
                                            <div className="text-gray-400 text-[10px]">
                                                {new Date(r.created_at).toLocaleString()} · {r.direction === 'outgoing' ? 'You' : getContactName(active.contact)}
                                            </div>
                                        </button>
                                    ))}
                                </div>
                            )}

                            {/* Messages */}
                            <div
                                ref={threadRef}
                                className="flex-1 overflow-y-auto p-3 space-y-1 relative"
                                onContextMenu={(e) => e.preventDefault()}
                            >
                                {loadingMsgs ? (
                                    <div className="flex justify-center pt-10"><Loading /></div>
                                ) : messages.length === 0 ? (
                                    <div className="text-center text-sm text-gray-400 pt-10">No messages yet</div>
                                ) : (
                                    <>
                                        {loadingMore && <div className="text-center py-2 text-xs text-gray-400">Loading older messages…</div>}
                                        {messages.map((m, i) => {
                                            const prev = messages[i - 1];
                                            const showDate = !prev || !sameDay(prev.created_at, m.created_at);
                                            const isSelected = selected.has(m.id);
                                            const isDeleted = m.is_deleted && !m.deleted_for_everyone;
                                            const groupedReactions = groupReactions(m);
                                            return (
                                                <div key={m.id}>
                                                    {showDate && (
                                                        <div className="flex justify-center my-3">
                                                            <span className="bg-white/90 text-[10px] uppercase tracking-wide text-gray-500 px-3 py-1 rounded-full shadow-sm">
                                                                {dateLabel(m.created_at)}
                                                            </span>
                                                        </div>
                                                    )}
                                                    <div
                                                        id={`msg-${m.id}`}
                                                        className={`flex ${m.direction === 'outgoing' ? 'justify-end' : 'justify-start'} group`}
                                                    >
                                                        <div className="flex items-end gap-1 max-w-[78%]">
                                                            {/* action chevron */}
                                                            <button
                                                                className="opacity-0 group-hover:opacity-100 text-gray-400 p-1 rounded-full hover:bg-gray-200"
                                                                onClick={(e) => {
                                                                    e.stopPropagation();
                                                                    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                                                                    setContextMenu({ msg: m, x: rect.left, y: rect.bottom });
                                                                }}
                                                            >
                                                                <FaEllipsisV className="text-[10px]" />
                                                            </button>

                                                            <div className={`relative px-3 py-2 rounded-2xl text-sm whitespace-pre-wrap break-words ${m.direction === 'outgoing'
                                                                ? 'bg-[#249D8F] text-white rounded-br-none'
                                                                : 'bg-white border text-[#1D2128] rounded-bl-none'
                                                                } ${isSelected ? 'ring-2 ring-yellow-400' : ''}`}
                                                                onClick={(e) => {
                                                                    if (e.shiftKey) {
                                                                        const s = new Set(selected);
                                                                        s.add(m.id);
                                                                        setSelected(s);
                                                                    }
                                                                }}
                                                            >
                                                                {/* Reply preview */}
                                                                {m.reply_to && (
                                                                    <div className={`mb-1.5 pl-2 border-l-2 text-[11px] rounded ${m.direction === 'outgoing' ? 'border-white/60 text-white/90' : 'border-[#249D8F] text-gray-600'
                                                                        }`}>
                                                                        <div className="font-semibold">
                                                                            {m.reply_to.direction === 'outgoing' ? 'You' : getContactName(active.contact)}
                                                                        </div>
                                                                        <div className="truncate max-w-[200px]">
                                                                            {m.reply_to.body || `[${m.reply_to.type}]`}
                                                                        </div>
                                                                    </div>
                                                                )}

                                                                {/* Body */}
                                                                {m.deleted_for_everyone ? (
                                                                    <div className="italic text-xs opacity-80 flex items-center gap-1">
                                                                        <FaBan /> This message was deleted
                                                                    </div>
                                                                ) : m.type === 'text' ? (
                                                                    <div>
                                                                        {renderLinkified(m.body)}
                                                                        {m.edited_at && <span className="text-[10px] ml-1 opacity-70">(edited)</span>}
                                                                    </div>
                                                                ) : m.type === 'image' && m.media_url ? (
                                                                    <a href={m.media_url} target="_blank" rel="noreferrer">
                                                                        <img src={m.media_url} alt="" className="max-w-[240px] rounded-lg" loading="lazy" />
                                                                    </a>
                                                                ) : m.type === 'video' && m.media_url ? (
                                                                    <video src={m.media_url} controls className="max-w-[240px] rounded-lg" />
                                                                ) : m.type === 'audio' && m.media_url ? (
                                                                    <audio src={m.media_url} controls className="max-w-[220px]" />
                                                                ) : m.type === 'document' && m.media_url ? (
                                                                    <a href={m.media_url} target="_blank" rel="noreferrer" className="underline">
                                                                        📄 {m.media_filename || 'Document'}
                                                                    </a>
                                                                ) : (
                                                                    <span className="opacity-70 text-xs">[{m.type}]</span>
                                                                )}

                                                                {/* Footer */}
                                                                <div className={`flex items-center gap-1 justify-end text-[10px] mt-1 ${m.direction === 'outgoing' ? 'text-white/70' : 'text-gray-400'
                                                                    }`}>
                                                                    {m.is_starred && <FaStar className="text-yellow-300 text-[9px]" />}
                                                                    <span>{new Date(m.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                                                                    {renderStatus(m)}
                                                                </div>

                                                                {/* Reactions */}
                                                                {groupedReactions.length > 0 && (
                                                                    <div className={`absolute -bottom-3 ${m.direction === 'outgoing' ? 'right-1' : 'left-1'} flex gap-0.5 bg-white border rounded-full px-1.5 py-0.5 shadow-sm`}>
                                                                        {groupedReactions.map(r => (
                                                                            <button
                                                                                key={r.emoji}
                                                                                onClick={(e) => { e.stopPropagation(); handleReact(m, r.emoji); }}
                                                                                className={`text-[11px] ${r.mine ? 'bg-yellow-100 rounded-full px-0.5' : ''}`}
                                                                            >
                                                                                {r.emoji}{r.count > 1 ? r.count : ''}
                                                                            </button>
                                                                        ))}
                                                                    </div>
                                                                )}

                                                                {m.status === 'failed' && (
                                                                    <button
                                                                        onClick={() => handleRetry(m)}
                                                                        className="text-[10px] underline mt-1 block"
                                                                    >
                                                                        Retry
                                                                    </button>
                                                                )}
                                                            </div>
                                                        </div>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </>
                                )}

                                {newMsgIndicator && (
                                    <button
                                        onClick={() => {
                                            threadRef.current?.scrollTo({ top: threadRef.current.scrollHeight, behavior: 'smooth' });
                                            setNewMsgIndicator(false);
                                        }}
                                        className="sticky bottom-2 mx-auto block bg-[#249D8F] text-white text-xs px-3 py-1.5 rounded-full shadow-lg"
                                    >
                                        New messages ↓
                                    </button>
                                )}
                            </div>

                            {/* Reply / Edit banner */}
                            {(replyTo || editing) && (
                                <div className="px-3 py-2 border-t bg-[#FDF0D5] flex items-center justify-between text-xs">
                                    <div className="flex items-center gap-2 min-w-0">
                                        {editing ? <FaEdit className="text-[#249D8F]" /> : <FaReply className="text-[#249D8F]" />}
                                        <div className="min-w-0">
                                            <div className="font-semibold text-[#249D8F]">
                                                {editing ? 'Editing message' : `Replying to ${replyTo?.direction === 'outgoing' ? 'yourself' : getContactName(active.contact)}`}
                                            </div>
                                            <div className="truncate text-gray-600 max-w-[400px]">
                                                {(editing || replyTo)?.body || `[${(editing || replyTo)?.type}]`}
                                            </div>
                                        </div>
                                    </div>
                                    <button onClick={() => { setReplyTo(null); setEditing(null); setInput(''); }}><FaTimes /></button>
                                </div>
                            )}

                            {/* Composer */}
                            <form onSubmit={handleSend} className="p-2 border-t bg-white flex items-end gap-2 shrink-0 relative">
                                {showEmoji && (
                                    <div className="absolute bottom-full left-2 mb-2 bg-white border rounded-xl shadow-lg p-3 w-72 z-20">
                                        <input
                                            value={emojiSearch}
                                            onChange={e => setEmojiSearch(e.target.value)}
                                            placeholder="Search emoji"
                                            className="w-full text-xs border rounded px-2 py-1 mb-2 outline-none"
                                        />
                                        <div className="grid grid-cols-8 gap-1 max-h-40 overflow-y-auto">
                                            {COMMON_EMOJIS
                                                .filter(e => !emojiSearch || e.includes(emojiSearch))
                                                .map(e => (
                                                    <button
                                                        key={e} type="button"
                                                        onClick={() => { setInput(i => i + e); setShowEmoji(false); }}
                                                        className="text-xl hover:bg-gray-100 rounded p-1"
                                                    >{e}</button>
                                                ))}
                                        </div>
                                    </div>
                                )}

                                <button type="button" onClick={() => setShowEmoji(s => !s)} className="text-gray-500 p-2 hover:text-[#249D8F]">
                                    <FaSmile />
                                </button>
                                <button type="button" className="text-gray-500 p-2 hover:text-[#249D8F]" title="Attach">
                                    <FaPaperclip />
                                </button>

                                <textarea
                                    value={input}
                                    onChange={e => handleInputChange(e.target.value)}
                                    onKeyDown={e => {
                                        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
                                    }}
                                    placeholder={editing ? 'Edit message…' : 'Type a message'}
                                    rows={1}
                                    className="flex-1 resize-none border rounded-2xl px-3 py-2 text-sm outline-none focus:border-[#249D8F] max-h-32"
                                />

                                {input.trim() ? (
                                    <button
                                        type="submit" disabled={sending}
                                        className="bg-[#249D8F] text-white p-2.5 rounded-full disabled:opacity-50 hover:bg-[#1f8578]"
                                    >
                                        <FaPaperPlane className="text-sm" />
                                    </button>
                                ) : (
                                    <button type="button" className="text-gray-500 p-2 hover:text-[#249D8F]" title="Voice">
                                        <FaMicrophone />
                                    </button>
                                )}
                            </form>
                        </>
                    )}
                </section>

                {/* ========== Info panel ========== */}
                {showInfo && active && (
                    <ChatInfoPanel
                        conversation={active}
                        onClose={() => setShowInfo(false)}
                        onJumpToMessage={scrollToMessage}
                    />
                )}
            </div>

            {/* ========== Message context menu ========== */}
            {contextMenu && (
                <div
                    className="fixed z-40 bg-white shadow-2xl border rounded-lg py-1 text-sm w-44"
                    style={{ top: contextMenu.y + 4, left: Math.min(contextMenu.x, window.innerWidth - 200) }}
                    onClick={(e) => e.stopPropagation()}
                >
                    <MenuItem icon={<FaReply />} label="Reply" onClick={() => startReply(contextMenu.msg)} />
                    <MenuItem icon={<FaSmile />} label="React" onClick={(e) => {
                        e?.stopPropagation();
                        setReactionPicker({ msg: contextMenu.msg, x: contextMenu.x, y: contextMenu.y - 60 });
                        setContextMenu(null);
                    }} />
                    {contextMenu.msg.body && (
                        <MenuItem icon={<FaCopy />} label="Copy" onClick={() => handleCopy(contextMenu.msg)} />
                    )}
                    <MenuItem icon={<FaForward />} label="Forward" onClick={() => openForward(contextMenu.msg)} />
                    <MenuItem
                        icon={contextMenu.msg.is_starred ? <FaStar className="text-yellow-500" /> : <FaRegStar />}
                        label={contextMenu.msg.is_starred ? 'Unstar' : 'Star'}
                        onClick={() => handleStar(contextMenu.msg)}
                    />
                    {contextMenu.msg.direction === 'outgoing' && contextMenu.msg.type === 'text' && !contextMenu.msg.is_deleted && (
                        <MenuItem icon={<FaEdit />} label="Edit" onClick={() => startEdit(contextMenu.msg)} />
                    )}
                    <div className="border-t my-1" />
                    <MenuItem
                        icon={<FaTrash />} label="Delete for me" danger
                        onClick={() => handleDelete(contextMenu.msg, 'me')}
                    />
                    {contextMenu.msg.direction === 'outgoing' && (
                        <MenuItem
                            icon={<FaTrash />} label="Delete for everyone" danger
                            onClick={() => handleDelete(contextMenu.msg, 'everyone')}
                        />
                    )}
                </div>
            )}

            {/* ========== Reaction picker ========== */}
            {reactionPicker && (
                <div
                    className="fixed z-50 bg-white shadow-2xl border rounded-full px-2 py-1.5 flex gap-1"
                    style={{ top: Math.max(10, reactionPicker.y), left: Math.min(reactionPicker.x, window.innerWidth - 260) }}
                    onClick={(e) => e.stopPropagation()}
                >
                    {REACTION_EMOJIS.map(e => (
                        <button
                            key={e}
                            className="text-xl hover:scale-125 transition-transform"
                            onClick={() => handleReact(reactionPicker.msg, e)}
                        >{e}</button>
                    ))}
                    <button
                        className="text-xs text-gray-400 px-2"
                        onClick={() => handleReact(reactionPicker.msg, '')}
                    >✕</button>
                </div>
            )}

            {/* ========== Forward modal ========== */}
            {forwarding && (
                <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={() => setForwarding(null)}>
                    <div className="bg-white rounded-xl shadow-2xl w-full max-w-md p-4" onClick={e => e.stopPropagation()}>
                        <div className="flex items-center justify-between mb-3">
                            <h3 className="font-semibold">Forward to…</h3>
                            <button onClick={() => setForwarding(null)}><FaTimes /></button>
                        </div>
                        <div className="max-h-72 overflow-y-auto border rounded-lg mb-3">
                            {conversations.map(c => (
                                <label key={c.id} className="flex items-center gap-2 px-3 py-2 hover:bg-gray-50 cursor-pointer border-b last:border-b-0">
                                    <input
                                        type="checkbox"
                                        checked={forwardSelection.includes(c.id)}
                                        onChange={(e) => {
                                            setForwardSelection(prev => e.target.checked
                                                ? [...prev, c.id]
                                                : prev.filter(x => x !== c.id));
                                        }}
                                    />
                                    <div className="w-8 h-8 rounded-full bg-[#249D8F]/20 flex items-center justify-center text-[#249D8F] font-semibold text-sm">
                                        {getContactName(c.contact).charAt(0).toUpperCase()}
                                    </div>
                                    <span className="text-sm truncate">{getContactName(c.contact)}</span>
                                </label>
                            ))}
                        </div>
                        <div className="flex justify-end gap-2">
                            <button onClick={() => setForwarding(null)} className="px-4 py-2 text-sm rounded-lg border">Cancel</button>
                            <button
                                disabled={forwardSelection.length === 0}
                                onClick={confirmForward}
                                className="px-4 py-2 text-sm rounded-lg bg-[#249D8F] text-white disabled:opacity-50"
                            >Forward ({forwardSelection.length})</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

// ==================================================
// Small helper components
// ==================================================
function MenuItem({ icon, label, onClick, danger }: { icon: React.ReactNode; label: string; onClick: (e?: React.MouseEvent) => void; danger?: boolean }) {
    return (
        <button
            onClick={(e) => { e.stopPropagation(); onClick(e); }}
            className={`w-full flex items-center gap-2 px-3 py-1.5 hover:bg-gray-100 text-left ${danger ? 'text-red-600' : 'text-gray-700'}`}
        >
            <span className="text-xs">{icon}</span>
            <span>{label}</span>
        </button>
    );
}

function ChatMenu({ conv, onAction }: { conv: Conversation; onAction: (a: any, c: Conversation) => void }) {
    const [open, setOpen] = useState(false);
    return (
        <div className="relative">
            <button className="p-2 hover:bg-gray-100 rounded-full" onClick={(e) => { e.stopPropagation(); setOpen(o => !o); }}>
                <FaEllipsisV />
            </button>
            {open && (
                <>
                    <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
                    <div className="absolute right-0 top-10 z-40 bg-white border rounded-lg shadow-xl w-52 py-1 text-sm">
                        <MenuItem icon={<FaEnvelope />} label={conv.unread_count > 0 ? 'Mark as read' : 'Mark as unread'} onClick={() => { setOpen(false); onAction(conv.unread_count > 0 ? 'read' : 'unread', conv); }} />
                        <MenuItem icon={<FaThumbtack />} label={conv.is_pinned ? 'Unpin chat' : 'Pin chat'} onClick={() => { setOpen(false); onAction('pin', conv); }} />
                        <MenuItem icon={conv.is_muted ? <FaBell /> : <FaBellSlash />} label={conv.is_muted ? 'Unmute' : 'Mute'} onClick={() => { setOpen(false); onAction('mute', conv); }} />
                        <MenuItem icon={<FaArchive />} label={conv.is_archived ? 'Unarchive' : 'Archive'} onClick={() => { setOpen(false); onAction('archive', conv); }} />
                        <div className="border-t my-1" />
                        <MenuItem icon={<FaTrash />} label="Clear messages" onClick={() => { setOpen(false); onAction('clear', conv); }} />
                        <MenuItem icon={<FaTrash />} label="Delete chat" danger onClick={() => { setOpen(false); onAction('delete', conv); }} />
                    </div>
                </>
            )}
        </div>
    );
}

function renderLinkified(text: string | null | undefined) {
    if (!text) return null;
    const parts = text.split(/(https?:\/\/[^\s]+)/g);
    return parts.map((p, i) => /^https?:\/\//.test(p)
        ? <a key={i} href={p} target="_blank" rel="noreferrer noopener" className="underline break-all">{p}</a>
        : <span key={i}>{p}</span>
    );
}

function FaBan() { return <span className="text-[10px]">🚫</span>; }