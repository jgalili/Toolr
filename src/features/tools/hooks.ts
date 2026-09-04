import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { api } from '@/lib/api';
import { capture } from '@/lib/analytics';
import type { ListingInput } from '@/schemas/forms';
import type { Coords, ToolFilters, ToolSummary } from '@/types/domain';

export const toolKeys = {
  search: (centre: Coords, filters: ToolFilters) =>
    ['tools', 'search', centre.latitude.toFixed(3), centre.longitude.toFixed(3), filters] as const,
  detail: (id: string) => ['tools', 'detail', id] as const,
  mine: ['tools', 'mine'] as const,
  favorites: ['tools', 'favorites'] as const,
  profile: (id: string) => ['profile', id] as const,
  profileTools: (id: string) => ['profile', id, 'tools'] as const,
  ratings: (id: string) => ['profile', id, 'ratings'] as const,
};

export function useSearchTools(centre: Coords, filters: ToolFilters, enabled = true) {
  return useQuery({
    queryKey: toolKeys.search(centre, filters),
    enabled,
    queryFn: async () => {
      const results = await api.searchTools({ ...filters, centre });
      capture(results.length === 0 ? 'search_no_results' : 'search_tool', {
        radius_m: filters.radiusM,
        free_only: filters.freeOnly,
        result_count: results.length,
      });
      return results;
    },
  });
}

export function useTool(id: string | undefined) {
  return useQuery({
    queryKey: toolKeys.detail(id ?? ''),
    enabled: Boolean(id),
    queryFn: async () => {
      const tool = await api.getTool(id!);
      if (tool) capture('view_tool', { category: tool.categorySlug, free: tool.paymentMode === 'free' });
      return tool;
    },
  });
}

export function useMyTools() {
  return useQuery({ queryKey: toolKeys.mine, queryFn: () => api.getMyTools() });
}

export function useFavorites() {
  return useQuery({ queryKey: toolKeys.favorites, queryFn: () => api.getFavorites() });
}

export function useProfile(id: string | undefined) {
  return useQuery({
    queryKey: toolKeys.profile(id ?? ''),
    enabled: Boolean(id),
    queryFn: () => api.getProfile(id!),
  });
}

export function useProfileTools(id: string | undefined) {
  return useQuery({
    queryKey: toolKeys.profileTools(id ?? ''),
    enabled: Boolean(id),
    queryFn: () => api.getProfileTools(id!),
  });
}

export function useRatings(id: string | undefined) {
  return useQuery({
    queryKey: toolKeys.ratings(id ?? ''),
    enabled: Boolean(id),
    queryFn: () => api.getRatingsFor(id!),
  });
}

/** Optimistic favourite — the heart must respond instantly or it feels broken. */
export function useToggleFavorite() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ toolId, favorite }: { toolId: string; favorite: boolean }) =>
      api.setFavorite(toolId, favorite),

    onMutate: async ({ toolId, favorite }) => {
      await queryClient.cancelQueries({ queryKey: ['tools'] });
      const snapshot = queryClient.getQueriesData<ToolSummary[]>({ queryKey: ['tools', 'search'] });

      queryClient.setQueriesData<ToolSummary[]>({ queryKey: ['tools', 'search'] }, (old) =>
        old?.map((tool) => (tool.id === toolId ? { ...tool, isFavorite: favorite } : tool)),
      );
      queryClient.setQueryData(toolKeys.detail(toolId), (old: unknown) =>
        old ? { ...(old as object), isFavorite: favorite } : old,
      );
      if (favorite) capture('favorite_added', { tool_id_present: true });
      return { snapshot };
    },

    onError: (_error, _vars, context) => {
      context?.snapshot?.forEach(([key, data]) => queryClient.setQueryData(key, data));
    },

    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: toolKeys.favorites });
    },
  });
}

export function useCreateTool() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ input, photoUri }: { input: ListingInput; photoUri: string | null }) =>
      api.createTool(input, photoUri),
    onSuccess: (_data, { input }) => {
      capture('tool_listing_created', {
        free: input.isFree,
        category: input.categorySlug,
        model_confirmed: input.isModelConfirmed,
      });
      void queryClient.invalidateQueries({ queryKey: ['tools'] });
    },
  });
}

export function useSetToolStatus() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: 'active' | 'paused' | 'removed' }) =>
      api.setToolStatus(id, status),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['tools'] }),
  });
}
