import apiClient from './axios';

export const fetchConversations = (params?: { channel_account_id?: number; search?: string }) =>
    apiClient.get('/conversations', { params }).then(r => r.data);

export const fetchMessages = (conversationId: number) =>
    apiClient.get(`/conversations/${conversationId}`).then(r => r.data);

export const sendMessage = (conversationId: number, body: string) =>
    apiClient.post(`/conversations/${conversationId}/send`, { body }).then(r => r.data);