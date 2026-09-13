import apiClient from './axios';

export const fetchConversations = (params?: { filter?: string; search?: string; channel_account_id?: number }) =>
    apiClient.get('/conversations', { params }).then(r => r.data);

export const fetchMessages = (conversationId: number, params?: { before_id?: number; limit?: number }) =>
    apiClient.get(`/conversations/${conversationId}`, { params }).then(r => r.data);

export const sendMessage = (conversationId: number, body: string, reply_to_id?: number) =>
    apiClient.post(`/conversations/${conversationId}/send`, { body, reply_to_id }).then(r => r.data);

export const editMessage = (id: number, body: string) => apiClient.post(`/messages/${id}/edit`, { body }).then(r => r.data);
export const deleteMessage = (id: number, scope: 'me' | 'everyone') => apiClient.delete(`/messages/${id}`, { params: { scope } }).then(r => r.data);
export const reactMessage = (id: number, emoji: string) => apiClient.post(`/messages/${id}/react`, { emoji }).then(r => r.data);
export const starMessage = (id: number) => apiClient.post(`/messages/${id}/star`).then(r => r.data);
export const forwardMessage = (id: number, ids: number[]) => apiClient.post(`/messages/${id}/forward`, { conversation_ids: ids }).then(r => r.data);
export const retryMessage = (id: number) => apiClient.post(`/messages/${id}/retry`).then(r => r.data);
export const searchMessages = (q: string, conversation_id?: number) => apiClient.get('/messages/search', { params: { q, conversation_id } }).then(r => r.data);
export const fetchStarred = () => apiClient.get('/messages/starred').then(r => r.data);

export const updateConversation = (id: number, data: { is_pinned?: boolean; is_muted?: boolean; is_archived?: boolean }) =>
    apiClient.patch(`/conversations/${id}`, data).then(r => r.data);
export const deleteConversation = (id: number) => apiClient.delete(`/conversations/${id}`).then(r => r.data);
export const clearConversation = (id: number) => apiClient.post(`/conversations/${id}/clear`).then(r => r.data);
export const markRead = (id: number) => apiClient.post(`/conversations/${id}/read`).then(r => r.data);
export const markUnread = (id: number) => apiClient.post(`/conversations/${id}/unread`).then(r => r.data);
export const fetchChatInfo = (id: number) => apiClient.get(`/conversations/${id}/info`).then(r => r.data);

export const sendTyping = (to: string, state: 'composing' | 'paused' | 'recording') =>
    fetch('http://localhost:5001/send-typing', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ to, state }),
    });