import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, Switch, View } from 'react-native';

import { SafetyNote } from '@/components/domain/SafetyNote';
import { WhenPicker } from '@/components/domain/WhenPicker';
import { Button, Input, Screen, SegmentedControl, Text } from '@/components/primitives';
import { useCreateBorrowRequest } from '@/features/transactions/hooks';
import { useTool } from '@/features/tools/hooks';
import { currentLocale } from '@/i18n';
import { daysBetween, formatDayTime, formatMoney } from '@/lib/format';
import { useTheme } from '@/theme';

type When = 'today' | 'tomorrow' | 'dates';

const QUICK_MESSAGES = [
  'request.messagePlaceholder',
];

/**
 * The two shortcuts, spelled out.
 *
 * "Today" means this evening back by nine — the overwhelmingly common shape of
 * a neighbourly borrow, and worth one tap rather than four. Anything that is
 * not that shape goes through the picker.
 */
function shortcutWindow(when: 'today' | 'tomorrow'): { start: Date; end: Date } {
  const start = new Date();
  if (when === 'tomorrow') start.setDate(start.getDate() + 1);
  start.setHours(18, 0, 0, 0);

  const end = new Date(start);
  end.setHours(21, 0, 0, 0);

  return { start, end };
}

export default function BorrowRequestComposer() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t } = useTranslation();
  const router = useRouter();
  const { spacing, colors, radius } = useTheme();

  const { data: tool } = useTool(id);
  const create = useCreateBorrowRequest();

  const [when, setWhen] = useState<When>('today');
  const [message, setMessage] = useState('');
  const [acknowledged, setAcknowledged] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Held as real dates rather than derived from the segment, so switching to
  // "Choose dates" starts from what the shortcut would have given you instead
  // of dumping you at an arbitrary default.
  const [start, setStart] = useState(() => shortcutWindow('today').start);
  const [end, setEnd] = useState(() => shortcutWindow('today').end);

  function chooseShortcut(next: When) {
    setWhen(next);
    if (next === 'dates') return;
    const window = shortcutWindow(next);
    setStart(window.start);
    setEnd(window.end);
  }

  /** A return before the pickup is not a window, it is a typo. */
  function changeStart(next: Date) {
    setStart(next);
    if (end.getTime() <= next.getTime()) {
      const pushed = new Date(next);
      pushed.setDate(pushed.getDate() + 1);
      setEnd(pushed);
    }
  }

  const window = useMemo(
    () => ({ startAt: start.toISOString(), endAt: end.toISOString() }),
    [start, end],
  );
  const days = daysBetween(window.startAt, window.endAt);
  const needsAcknowledgement = tool?.risk === 'high';
  const windowValid = end.getTime() > start.getTime();

  const total =
    tool && tool.paymentMode !== 'free' ? (tool.pricePerDayAgorot ?? 0) * days : null;

  async function send() {
    if (!tool) return;
    setError(null);
    try {
      await create.mutateAsync({
        toolId: tool.id,
        startAt: window.startAt,
        endAt: window.endAt,
        message: message.trim() || null,
        riskAcknowledged: acknowledged,
      });
      router.replace('/(tabs)/inbox');
    } catch (e) {
      const text = e instanceof Error ? e.message : '';
      setError(text.includes('pending') ? t('request.alreadyRequested') : t('errors.genericBody'));
    }
  }

  return (
    <Screen scroll>
      <View style={{ paddingTop: spacing.xxl, gap: spacing.xl }}>
        <Text variant="title">{t('request.when')}</Text>

        <SegmentedControl
          segments={[
            { value: 'today', label: t('request.today') },
            { value: 'tomorrow', label: t('request.tomorrow') },
            { value: 'dates', label: t('request.chooseDates') },
          ]}
          value={when}
          onChange={chooseShortcut}
        />

        {when === 'dates' ? (
          <View style={{ gap: spacing.lg }}>
            <WhenPicker
              label={t('request.pickUpWhen')}
              value={start}
              onChange={changeStart}
              testID="pick-up-when"
            />
            <WhenPicker
              label={t('request.returnBy')}
              value={end}
              onChange={setEnd}
              earliest={start}
              testID="return-by"
            />
            {!windowValid ? (
              <Text variant="caption" tone="danger">
                {t('request.endBeforeStart')}
              </Text>
            ) : null}
          </View>
        ) : null}

        <Text variant="body" tone="secondary">
          {t('request.summary', {
            start: formatDayTime(window.startAt, currentLocale()),
            end: formatDayTime(window.endAt, currentLocale()),
          })}
        </Text>

        <View style={{ gap: spacing.sm }}>
          <Input
            label={`${t('request.messageLabel')} (${t('common.optional')})`}
            value={message}
            onChangeText={setMessage}
            placeholder={t('request.messagePlaceholder')}
            multiline
            maxLength={300}
          />
          <View style={{ flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap' }}>
            {QUICK_MESSAGES.map((key) => (
              <Pressable key={key} onPress={() => setMessage(t(key))}>
                <Text variant="caption" tone="accent">
                  {t(key)}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>

        <View
          style={{
            padding: spacing.lg,
            borderRadius: radius.md,
            backgroundColor: colors.surfaceSunken,
            gap: spacing.xs,
          }}
        >
          <Text variant="bodyStrong">
            {total == null
              ? t('request.priceFree')
              : t('request.priceTotal', {
                  count: days,
                  price: formatMoney(tool?.pricePerDayAgorot ?? 0, tool?.currency, currentLocale()),
                  total: formatMoney(total, tool?.currency, currentLocale()),
                })}
          </Text>
          {total != null ? (
            <Text variant="caption" tone="muted">
              {t('tool.paidDirectly')}
            </Text>
          ) : null}
        </View>

        {needsAcknowledgement ? (
          <View style={{ gap: spacing.md }}>
            <SafetyNote risk="high" />
            <View
              style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}
            >
              <Switch
                value={acknowledged}
                onValueChange={setAcknowledged}
                accessibilityLabel={t('request.riskAcknowledge')}
              />
              <Text variant="body" style={{ flex: 1 }}>
                {t('request.riskAcknowledge')}
              </Text>
            </View>
          </View>
        ) : null}

        {error ? (
          <Text variant="caption" tone="danger">
            {error}
          </Text>
        ) : null}

        <Button
          testID="send-request"
          size="large"
          label={t('request.send')}
          loading={create.isPending}
          disabled={(needsAcknowledgement && !acknowledged) || !windowValid}
          onPress={send}
        />
      </View>
    </Screen>
  );
}
