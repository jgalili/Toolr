import { useCallback, useState } from 'react';

import { useSearchTools } from '@/features/tools/hooks';
import { currentLocale } from '@/i18n';
import { capture } from '@/lib/analytics';
import { api } from '@/lib/api';
import type { Interpretation } from '@/schemas/ai';
import { DEFAULT_FILTERS, type Coords, type ToolFilters } from '@/types/domain';

/**
 * Search state.
 *
 * Natural language goes through the interpreter first; if it fails, times out,
 * or the person is offline, we fall back to plain keyword search. Slightly
 * worse results, zero breakage — the AI is never on the critical path.
 */
export function useSearch(centre: Coords, initialQuery = '') {
  const [filters, setFilters] = useState<ToolFilters>({
    ...DEFAULT_FILTERS,
    query: initialQuery || null,
  });
  const [interpretation, setInterpretation] = useState<Interpretation | null>(null);
  const [interpreting, setInterpreting] = useState(false);

  const query = useSearchTools(centre, filters);

  const submit = useCallback(async (text: string) => {
    const trimmed = text.trim();
    if (trimmed.length === 0) {
      setInterpretation(null);
      setFilters((f) => ({ ...f, query: null, toolTypes: null }));
      return;
    }

    setFilters((f) => ({ ...f, query: trimmed, toolTypes: null }));

    // Only worth an interpretation call when the query looks like a sentence
    // rather than a single word — "drill" needs no interpreting.
    if (trimmed.split(/\s+/).length < 2) {
      setInterpretation(null);
      return;
    }

    setInterpreting(true);
    try {
      const result = await api.interpretQuery(trimmed, currentLocale());
      if (result && result.tool_types.length > 0) {
        setInterpretation(result);
        setFilters((f) => ({ ...f, toolTypes: result.tool_types }));
        capture('search_interpreted', { types: result.tool_types.length });
      } else {
        setInterpretation(null);
      }
    } finally {
      setInterpreting(false);
    }
  }, []);

  const clearInterpretation = useCallback(() => {
    setInterpretation(null);
    setFilters((f) => ({ ...f, toolTypes: null }));
  }, []);

  return {
    filters,
    setFilters,
    interpretation,
    interpreting,
    submit,
    clearInterpretation,
    results: query.data,
    loading: query.isPending || interpreting,
    error: query.error,
    refetch: query.refetch,
  };
}
