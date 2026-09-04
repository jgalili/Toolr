import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';

import { capture } from '@/lib/analytics';
import { api } from '@/lib/api';
import type { Message } from '@/types/domain';

export const chatKeys = {
  conversations: ['conversations'] as const,
  messages: (id: string) => ['conversations', id, 'messages'] as const,
};

export function useConversations() {
  return useQuery({ queryKey: chatKeys.conversations, queryFn: () => api.getConversations() });
}

export function useMessages(conversationId: string | undefined) {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: chatKeys.messages(conversationId ?? ''),
    enabled: Boolean(conversationId),
    queryFn: () => api.getMessages(conversationId!),
  });

  // Realtime. New messages are merged rather than refetched, so the thread
  // doesn't jump while someone is reading it.
  useEffect(() => {
    if (!conversationId) return;
    return api.subscribeToMessages(conversationId, (message) => {
      queryClient.setQueryData<Message[]>(chatKeys.messages(conversationId), (old) => {
        if (!old) return [message];
        if (old.some((m) => m.id === message.id)) return old;
        return [...old.filter((m) => !m.pending || m.body !== message.body), message];
      });
    });
  }, [conversationId, queryClient]);

  return query;
}

/**
 * Optimistic send: the bubble appears immediately, marked pending, and is
 * replaced when the server confirms. On failure it is rolled back rather than
 * left looking sent.
 */
export function useSendMessage(conversationId: string, senderId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ body, kind }: { body: string; kind?: 'text' | 'quick_reply' }) =>
      api.sendMessage(conversationId, body, kind),

    onMutate: async ({ body, kind }) => {
      await queryClient.cancelQueries({ queryKey: chatKeys.messages(conversationId) });
      const previous = queryClient.getQueryData<Message[]>(chatKeys.messages(conversationId));
      const optimistic: Message = {
        id: `pending-${Date.now()}`,
        conversationId,
        senderId,
        kind: kind ?? 'text',
        body,
        createdAt: new Date().toISOString(),
        pending: true,
      };
      queryClient.setQueryData<Message[]>(chatKeys.messages(conversationId), (old) => [
        ...(old ?? []),
        optimistic,
      ]);
      return { previous };
    },

    onError: (_error, _vars, context) => {
      queryClient.setQueryData(chatKeys.messages(conversationId), context?.previous);
    },

    onSuccess: (message) => {
      capture('message_sent');
      queryClient.setQueryData<Message[]>(chatKeys.messages(conversationId), (old) => [
        ...(old ?? []).filter((m) => !m.pending),
        message,
      ]);
      void queryClient.invalidateQueries({ queryKey: chatKeys.conversations });
    },
  });
}
