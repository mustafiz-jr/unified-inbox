'use client';

import { useEffect, useState } from 'react';
import { FaTimes, FaStar } from 'react-icons/fa';
import { fetchChatInfo } from '@/lib/inboxApi';
import Loading from '@/app/components/loading/Loading';

type Props = {
    conversation: any;
    onClose: () => void;
    onJumpToMessage?: (id: number) => void;
};

export default function ChatInfoPanel({ conversation, onClose, onJumpToMessage }: Props) {
    const [loading, setLoading] = useState(true);
    const [info, setInfo] = useState<any>(null);
    const [tab, setTab] = useState<'overview' | 'media' | 'starred'>('overview');

    useEffect(() => {
        setLoading(true);
        fetchChatInfo(conversation.id)
            .then(setInfo)
            .catch(console.error)
            .finally(() => setLoading(false));
    }, [conversation.id]);

    return (
        <aside className="w-full md:w-80 border-l bg-white flex flex-col">
            <div className="px-3 py-3 border-b flex items-center justify-between shrink-0">
                <h3 className="font-semibold text-sm">Chat info</h3>
                <button onClick={onClose}><FaTimes /></button>
            </div>

            {loading ? (
                <div className="flex-1 flex items-center justify-center"><Loading /></div>
            ) : (
                <>
                    <div className="p-4 flex flex-col items-center border-b">
                        <div className="w-20 h-20 rounded-full bg-[#249D8F]/20 flex items-center justify-center text-[#249D8F] font-bold text-2xl">
                            {conversation.contact?.name?.charAt(0).toUpperCase() || '?'}
                        </div>
                        <div className="mt-2 font-semibold">{conversation.contact?.name}</div>
                        {conversation.contact?.phone_number && (
                            <div className="text-xs text-gray-500">+{conversation.contact.phone_number}</div>
                        )}
                        <div className="flex gap-2 mt-3 text-xs">
                            {conversation.is_pinned && <span className="px-2 py-1 bg-gray-100 rounded-full">📌 Pinned</span>}
                            {conversation.is_muted && <span className="px-2 py-1 bg-gray-100 rounded-full">🔕 Muted</span>}
                            {conversation.is_archived && <span className="px-2 py-1 bg-gray-100 rounded-full">📦 Archived</span>}
                        </div>
                    </div>

                    <div className="flex border-b text-xs">
                        {(['overview', 'media', 'starred'] as const).map(t => (
                            <button
                                key={t}
                                onClick={() => setTab(t)}
                                className={`flex-1 py-2 capitalize ${tab === t ? 'text-[#249D8F] border-b-2 border-[#249D8F] font-semibold' : 'text-gray-500'}`}
                            >{t}</button>
                        ))}
                    </div>

                    <div className="flex-1 overflow-y-auto p-3">
                        {tab === 'overview' && (
                            <div className="space-y-3 text-sm">
                                <InfoRow label="Via" value={`${conversation.channel_account?.account_name} (${conversation.channel_account?.provider})`} />
                                <InfoRow label="Unread" value={String(conversation.unread_count)} />
                                <InfoRow label="Last message" value={conversation.last_message_at ? new Date(conversation.last_message_at).toLocaleString() : '—'} />
                            </div>
                        )}

                        {tab === 'media' && (
                            <div className="grid grid-cols-3 gap-1">
                                {(info?.media || []).length === 0 ? (
                                    <p className="col-span-3 text-center text-xs text-gray-400 py-4">No shared media</p>
                                ) : info.media.map((m: any) => (
                                    <button
                                        key={m.id}
                                        onClick={() => onJumpToMessage?.(m.id)}
                                        className="aspect-square bg-gray-100 rounded overflow-hidden"
                                        title={m.media_filename || m.type}
                                    >
                                        {m.type === 'image' && m.media_url ? (
                                            <img src={m.media_url} alt="" className="w-full h-full object-cover" loading="lazy" />
                                        ) : (
                                            <div className="w-full h-full flex items-center justify-center text-[10px] text-gray-500 uppercase">
                                                {m.type}
                                            </div>
                                        )}
                                    </button>
                                ))}
                            </div>
                        )}

                        {tab === 'starred' && (
                            <div className="space-y-2">
                                {(info?.starred || []).length === 0 ? (
                                    <p className="text-center text-xs text-gray-400 py-4">No starred messages</p>
                                ) : info.starred.map((m: any) => (
                                    <button
                                        key={m.id}
                                        onClick={() => onJumpToMessage?.(m.id)}
                                        className="w-full text-left p-2 border rounded hover:bg-gray-50 text-xs"
                                    >
                                        <div className="flex items-center gap-1 text-yellow-500 mb-0.5">
                                            <FaStar className="text-[10px]" />
                                            <span className="text-gray-400 text-[10px]">{new Date(m.created_at).toLocaleString()}</span>
                                        </div>
                                        <div className="truncate">{m.body || `[${m.type}]`}</div>
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>
                </>
            )}
        </aside>
    );
}

function InfoRow({ label, value }: { label: string; value: string }) {
    return (
        <div>
            <div className="text-[10px] uppercase text-gray-400">{label}</div>
            <div className="text-gray-700 break-words">{value}</div>
        </div>
    );
}