import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';

import type { Identification } from '@/schemas/ai';
import type { CategorySlug, Condition, RiskLevel } from '@/types/domain';

export type ListingDraft = {
  photoUri: string | null;
  title: string;
  toolType: string;
  brand: string | null;
  model: string | null;
  isModelConfirmed: boolean;
  categorySlug: CategorySlug;
  description: string | null;
  condition: Condition | null;
  accessories: string | null;
  instructions: string | null;
  maxBorrowDays: number | null;
  risk: RiskLevel;
  isFree: boolean;
  pricePerDayAgorot: number | null;
  availabilityMode: 'now' | 'dates' | 'ask';
  /** How the identification ended up — the metric that tells us whether the
   *  thirty-second promise is real. */
  aiOutcome: 'accepted' | 'corrected' | 'rejected' | 'generic' | 'none';
};

const EMPTY: ListingDraft = {
  photoUri: null,
  title: '',
  toolType: '',
  brand: null,
  model: null,
  isModelConfirmed: false,
  categorySlug: 'other',
  description: null,
  condition: null,
  accessories: null,
  instructions: null,
  maxBorrowDays: null,
  risk: 'low',
  isFree: true,
  pricePerDayAgorot: null,
  availabilityMode: 'now',
  aiOutcome: 'none',
};

type DraftApi = {
  draft: ListingDraft;
  update(patch: Partial<ListingDraft>): void;
  reset(): void;
  applyIdentification(identification: Identification, outcome: ListingDraft['aiOutcome']): void;
};

const DraftContext = createContext<DraftApi | null>(null);

export function ListingDraftProvider({ children }: { children: React.ReactNode }) {
  const [draft, setDraft] = useState<ListingDraft>(EMPTY);

  const update = useCallback((patch: Partial<ListingDraft>) => {
    setDraft((current) => ({ ...current, ...patch }));
  }, []);

  const reset = useCallback(() => setDraft(EMPTY), []);

  const applyIdentification = useCallback(
    (identification: Identification, outcome: ListingDraft['aiOutcome']) => {
      setDraft((current) => ({
        ...current,
        title:
          identification.suggested_title ??
          [identification.brand, identification.tool_type].filter(Boolean).join(' ') ??
          current.title,
        toolType: identification.tool_type ?? current.toolType,
        brand: identification.brand,
        // The server already blanked a model it wasn't sure about. We never
        // re-introduce one here.
        model: identification.model,
        isModelConfirmed: outcome === 'accepted' && identification.model != null,
        categorySlug: (identification.category ?? 'other') as CategorySlug,
        description: identification.suggested_description,
        condition:
          identification.condition_hint === 'unknown' ? null : identification.condition_hint,
        accessories:
          identification.visible_accessories.length > 0
            ? identification.visible_accessories.join(', ')
            : null,
        risk: identification.risk,
        aiOutcome: outcome,
      }));
    },
    [],
  );

  const value = useMemo<DraftApi>(
    () => ({ draft, update, reset, applyIdentification }),
    [draft, update, reset, applyIdentification],
  );

  return <DraftContext.Provider value={value}>{children}</DraftContext.Provider>;
}

export function useListingDraft(): DraftApi {
  const ctx = useContext(DraftContext);
  if (!ctx) throw new Error('useListingDraft must be used inside <ListingDraftProvider>');
  return ctx;
}
