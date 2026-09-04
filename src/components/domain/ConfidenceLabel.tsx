import React from 'react';
import { useTranslation } from 'react-i18next';

import { Chip } from '@/components/primitives';

export type Confidence = 'likely' | 'possible' | 'uncertain';

/**
 * Three phrases, never a percentage.
 *
 * "83% confident" reads as precision the model does not have; people either
 * over-trust it or find it baffling.
 */
export function ConfidenceLabel({ level }: { level: Confidence }) {
  const { t } = useTranslation();
  const label =
    level === 'likely'
      ? t('ai.likely')
      : level === 'possible'
        ? t('ai.possibleMatch')
        : t('ai.modelUncertain');
  const tone = level === 'likely' ? 'accent' : level === 'possible' ? 'neutral' : 'warning';
  return <Chip label={label} tone={tone} />;
}
