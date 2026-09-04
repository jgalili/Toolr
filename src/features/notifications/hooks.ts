import { useQuery } from '@tanstack/react-query';

import { api } from '@/lib/api';

export function useNotifications() {
  return useQuery({
    queryKey: ['notifications'],
    queryFn: () => api.getNotifications(),
    staleTime: 30_000,
  });
}

/**
 * Drives the dot on the bell. Deliberately returns a count rather than a
 * boolean — a screen may want "3", and a dot is just `count > 0`.
 */
export function useUnreadCount(): number {
  const { data } = useNotifications();
  return (data ?? []).filter((n) => n.readAt == null).length;
}
