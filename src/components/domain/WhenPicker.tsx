import React, { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, View } from 'react-native';

import { Chip, Text } from '@/components/primitives';
import { currentLocale } from '@/i18n';
import { useTheme } from '@/theme';

/**
 * Picking a day and an hour.
 *
 * Deliberately not a calendar. Borrowing a drill is a this-week decision — a
 * month grid asks someone to navigate 30 squares to reach Thursday, and a
 * native date picker means a native module (absent from Expo Go) and a
 * different, worse dialog on web. A row of real days you can read at a glance
 * is faster, works identically everywhere, and mirrors correctly in Hebrew
 * because it is laid out with flexbox rather than absolute positions.
 *
 * The hours are the hours people actually hand tools over: before work, over
 * lunch, and the two evening slots that do most of the traffic.
 */

const HOURS = [8, 12, 15, 18, 20] as const;

export type WhenValue = { date: Date };

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function addDays(d: Date, n: number): Date {
  const out = new Date(d);
  out.setDate(out.getDate() + n);
  return out;
}

function sameDay(a: Date, b: Date): boolean {
  return startOfDay(a).getTime() === startOfDay(b).getTime();
}

function dayLabel(
  date: Date,
  t: (key: string) => string,
  today: Date,
): { top: string; bottom: string } {
  const locale = currentLocale() === 'he' ? 'he-IL' : 'en-GB';
  const days = Math.round((startOfDay(date).getTime() - startOfDay(today).getTime()) / 86_400_000);

  if (days === 0) return { top: t('chat.today'), bottom: '' };
  if (days === 1) return { top: t('chat.tomorrow'), bottom: '' };

  try {
    const weekday = new Intl.DateTimeFormat(locale, { weekday: 'short' }).format(date);
    // dd/mm, because that is how the date was asked for and how it reads here.
    const dm = new Intl.DateTimeFormat(locale, { day: '2-digit', month: '2-digit' }).format(date);
    return { top: weekday, bottom: dm };
  } catch {
    return { top: `${date.getDate()}`, bottom: '' };
  }
}

export function WhenPicker({
  label,
  value,
  onChange,
  /** Nothing before this instant can be chosen — a return cannot precede a pickup. */
  earliest,
  days = 21,
  testID,
}: {
  label: string;
  value: Date;
  onChange: (next: Date) => void;
  earliest?: Date;
  days?: number;
  testID?: string;
}) {
  const { t } = useTranslation();
  const { spacing } = useTheme();

  const today = useMemo(() => new Date(), []);
  const floor = earliest ?? today;

  const options = useMemo(
    () =>
      Array.from({ length: days }, (_, i) => addDays(startOfDay(today), i)).filter(
        (d) => startOfDay(d).getTime() >= startOfDay(floor).getTime(),
      ),
    [days, today, floor],
  );

  const setDay = (day: Date) => {
    const next = new Date(day);
    next.setHours(value.getHours(), value.getMinutes(), 0, 0);
    onChange(next);
  };

  const setHour = (hour: number) => {
    const next = new Date(value);
    next.setHours(hour, 0, 0, 0);
    onChange(next);
  };

  // An hour that has already passed today is not a choice, it is a mistake.
  const hourDisabled = (hour: number) => {
    const candidate = new Date(value);
    candidate.setHours(hour, 0, 0, 0);
    return candidate.getTime() < floor.getTime();
  };

  return (
    <View style={{ gap: spacing.sm }} testID={testID}>
      <Text variant="label" tone="muted" uppercase>
        {label}
      </Text>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ gap: spacing.sm, paddingVertical: 2 }}
      >
        {options.map((day) => {
          const { top, bottom } = dayLabel(day, t, today);
          return (
            <Chip
              key={day.toISOString()}
              label={bottom ? `${top} ${bottom}` : top}
              variant="outline"
              selected={sameDay(day, value)}
              onPress={() => setDay(day)}
            />
          );
        })}
      </ScrollView>

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
        {HOURS.map((hour) => {
          const disabled = hourDisabled(hour);
          return (
            <Chip
              key={hour}
              label={`${String(hour).padStart(2, '0')}:00`}
              variant="outline"
              selected={value.getHours() === hour}
              onPress={disabled ? undefined : () => setHour(hour)}
              tone={disabled ? 'neutral' : 'accent'}
            />
          );
        })}
      </View>
    </View>
  );
}
