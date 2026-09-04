import { useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useLocation } from '@/features/location/useLocation';
import { useCreateTool } from '@/features/tools/hooks';

import { useListingDraft } from './draft';

/**
 * Turning a draft into a listing.
 *
 * Two screens can finish a listing — the one-screen Add Tool flow and the
 * longer details form — and they must produce byte-identical rows. Keeping the
 * mapping here rather than in either screen is what guarantees that.
 *
 * The coordinate handed over is the person's *current area centre*, and the
 * database immediately derives a fuzzed public point from it. The exact point
 * never touches the public table, even for an instant.
 */
export function useSubmitListing() {
  const { t } = useTranslation();
  const router = useRouter();
  const { draft, reset } = useListingDraft();
  const { centre, neighbourhood } = useLocation();
  const createTool = useCreateTool();
  const [error, setError] = useState<string | null>(null);

  const submit = useCallback(
    async (pricePerDayAgorot: number | null) => {
      setError(null);
      try {
        const { id } = await createTool.mutateAsync({
          input: {
            title: draft.title || t('categories.other'),
            toolType: draft.toolType || draft.categorySlug,
            brand: draft.brand,
            model: draft.model,
            isModelConfirmed: draft.isModelConfirmed,
            categorySlug: draft.categorySlug,
            description: draft.description,
            condition: draft.condition,
            accessories: draft.accessories,
            instructions: draft.instructions,
            maxBorrowDays: draft.maxBorrowDays,
            isFree: draft.isFree,
            pricePerDayAgorot: draft.isFree ? null : pricePerDayAgorot,
            availabilityMode: draft.availabilityMode,
            risk: draft.risk,
            coords: centre,
            neighbourhood,
          },
          photoUri: draft.photoUri,
        });
        const title = draft.title;
        reset();
        router.replace({ pathname: '/list/success', params: { id, title } });
      } catch (e) {
        // Swallowing the reason here is what made "it saved but said it
        // failed" so hard to place. Keep the friendly message, keep the cause.
        console.warn('[listing] submit failed:', e);
        setError(t('errors.genericBody'));
      }
    },
    [centre, createTool, draft, neighbourhood, reset, router, t],
  );

  return { submit, error, pending: createTool.isPending };
}
