import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { capture } from '@/lib/analytics';
import { api } from '@/lib/api';

export const txKeys = {
  incoming: ['requests', 'incoming'] as const,
  outgoing: ['requests', 'outgoing'] as const,
  transactions: ['transactions'] as const,
  transaction: (id: string) => ['transactions', id] as const,
  pickup: (id: string) => ['transactions', id, 'pickup'] as const,
};

export function useIncomingRequests() {
  return useQuery({ queryKey: txKeys.incoming, queryFn: () => api.getIncomingRequests() });
}

export function useOutgoingRequests() {
  return useQuery({ queryKey: txKeys.outgoing, queryFn: () => api.getOutgoingRequests() });
}

export function useTransactions() {
  return useQuery({ queryKey: txKeys.transactions, queryFn: () => api.getTransactions() });
}

export function useTransaction(id: string | undefined) {
  return useQuery({
    queryKey: txKeys.transaction(id ?? ''),
    enabled: Boolean(id),
    queryFn: () => api.getTransaction(id!),
  });
}

/**
 * The exact pickup address.
 *
 * Deliberately its own query rather than a field on the transaction: it is a
 * separate authorization decision on the server, and keeping it separate here
 * means it can never be accidentally cached into a list response.
 */
export function usePickupLocation(transactionId: string | undefined, enabled: boolean) {
  return useQuery({
    queryKey: txKeys.pickup(transactionId ?? ''),
    enabled: Boolean(transactionId) && enabled,
    queryFn: () => api.getPickupLocation(transactionId!),
    staleTime: 5 * 60 * 1000,
  });
}

export function useCreateBorrowRequest() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: Parameters<typeof api.createBorrowRequest>[0]) =>
      api.createBorrowRequest(input),
    onSuccess: () => {
      capture('borrow_requested');
      void queryClient.invalidateQueries({ queryKey: ['requests'] });
    },
  });
}

export function useRespondToRequest() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      decision,
      dueAt,
    }: {
      id: string;
      decision: 'accepted' | 'declined';
      dueAt?: string | null;
    }) => api.respondToRequest(id, decision, dueAt),
    onSuccess: (_data, { decision }) => {
      capture(decision === 'accepted' ? 'borrow_accepted' : 'borrow_declined');
      void queryClient.invalidateQueries({ queryKey: ['requests'] });
      void queryClient.invalidateQueries({ queryKey: ['transactions'] });
      void queryClient.invalidateQueries({ queryKey: ['conversations'] });
    },
  });
}

export function useConfirmPickup() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.confirmPickup(id),
    onSuccess: () => {
      capture('pickup_confirmed');
      void queryClient.invalidateQueries({ queryKey: ['transactions'] });
    },
  });
}

export function useConfirmReturn() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.confirmReturn(id),
    onSuccess: () => {
      capture('return_confirmed');
      void queryClient.invalidateQueries({ queryKey: ['transactions'] });
    },
  });
}

export function useSubmitRating() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: Parameters<typeof api.submitRating>[0]) => api.submitRating(input),
    onSuccess: (_data, variables) => {
      capture('rating_submitted', { stars: variables.stars });
      void queryClient.invalidateQueries({ queryKey: ['transactions'] });
    },
  });
}

export function useReportIssue() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: Parameters<typeof api.reportIssue>[0]) => api.reportIssue(input),
    onSuccess: (_data, variables) => {
      capture('issue_reported', { reason: variables.reason });
      void queryClient.invalidateQueries({ queryKey: ['transactions'] });
    },
  });
}
