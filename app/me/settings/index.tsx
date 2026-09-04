import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { Button, Card, Screen, Text } from '@/components/primitives';
import { chevron } from '@/i18n/direction';
import { useSession } from '@/features/auth/session';
import { useLocation } from '@/features/location/useLocation';
import { api } from '@/lib/api';
import { useTheme } from '@/theme';

function Item({ label, onPress }: { label: string; onPress: () => void }) {
  const { spacing } = useTheme();
  return (
    <Card onPress={onPress} accessibilityLabel={label}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: spacing.md }}>
        <Text variant="bodyLarge">{label}</Text>
        <Text variant="body" tone="muted">
          {chevron()}
        </Text>
      </View>
    </Card>
  );
}

export default function Settings() {
  const { t } = useTranslation();
  const router = useRouter();
  const { spacing } = useTheme();
  const session = useSession();
  const { centre } = useLocation();
  const [sampleState, setSampleState] = useState<'idle' | 'loading' | 'done' | 'skipped'>('idle');
  const [moveState, setMoveState] = useState<'idle' | 'loading' | 'done' | 'failed'>('idle');
  const [movedCount, setMovedCount] = useState(0);
  const [borrowState, setBorrowState] = useState<'idle' | 'loading' | 'done' | 'noTool' | 'already' | 'failed'>('idle');
  const [borrowTool, setBorrowTool] = useState('');
  const [answerState, setAnswerState] = useState<'idle' | 'loading' | 'done' | 'none' | 'failed'>('idle');
  const [answeredCount, setAnsweredCount] = useState(0);

  /**
   * Demo affordance. It exists so the app can be shown to someone without
   * two people having to arrange an actual borrow first.
   */
  async function loadSample() {
    setSampleState('loading');
    try {
      const result = await api.loadSampleData();
      setSampleState(result.ok ? 'done' : 'skipped');
    } catch {
      setSampleState('skipped');
    }
  }

  /**
   * The demo listings live in Tel Aviv. Anywhere else, the app searches your
   * own neighbourhood, finds nothing, and looks broken. This picks the whole
   * demo neighbourhood up and sets it down around you, layout intact.
   */
  async function moveDemoHere() {
    setMoveState('loading');
    try {
      const result = await api.moveDemoToolsHere(centre);
      setMovedCount(result.moved ?? 0);
      setMoveState(result.ok ? 'done' : 'failed');
    } catch {
      setMoveState('failed');
    }
  }

  /**
   * The lending side of the app needs someone to ask. Alone, nobody does, so
   * Accept / handover / return / rate-the-borrower are never reachable. This
   * has a seeded neighbour send a genuine request against one of your tools.
   */
  async function askToBorrowMine() {
    setBorrowState('loading');
    try {
      const result = await api.demoBorrowMyTool();
      if (result.ok) {
        setBorrowTool(result.tool ?? '');
        setBorrowState('done');
      } else {
        setBorrowState(result.reason === 'already_asked' ? 'already' : 'noTool');
      }
    } catch {
      setBorrowState('failed');
    }
  }

  /** The mirror image: the fictional owners answer what you asked them. */
  async function answerMyRequests() {
    setAnswerState('loading');
    try {
      const result = await api.demoAnswerMyRequests();
      setAnsweredCount(result.answered ?? 0);
      setAnswerState(result.ok && (result.answered ?? 0) > 0 ? 'done' : 'none');
    } catch {
      setAnswerState('failed');
    }
  }

  return (
    <Screen scroll>
      <View style={{ paddingTop: spacing.xxl, gap: spacing.lg }}>
        <Text variant="title">{t('settings.title')}</Text>

        <View style={{ gap: spacing.sm }}>
          <Item label={t('settings.account')} onPress={() => router.push('/me/settings/account')} />
          <Item label={t('settings.notifications')} onPress={() => router.push('/me/settings/notifications')} />
          <Item label={t('settings.language')} onPress={() => router.push('/me/settings/language')} />
          <Item label={t('settings.privacy')} onPress={() => router.push('/me/settings/privacy')} />
          <Item label={t('settings.legal')} onPress={() => router.push('/me/settings/legal')} />
        </View>

        {!session.isGuest ? (
          <View style={{ gap: spacing.xs }}>
            <Button
              label={t('settings.sampleData')}
              variant="secondary"
              loading={sampleState === 'loading'}
              onPress={() => void loadSample()}
              testID="load-sample-data"
            />
            <Text variant="caption" tone="muted">
              {sampleState === 'done'
                ? t('settings.sampleDataDone')
                : sampleState === 'skipped'
                  ? t('settings.sampleDataSkipped')
                  : t('settings.sampleDataHint')}
            </Text>
          </View>
        ) : null}

        {!session.isGuest ? (
          <View style={{ gap: spacing.xs }}>
            <Button
              label={t('settings.moveDemo')}
              variant="secondary"
              loading={moveState === 'loading'}
              onPress={() => void moveDemoHere()}
              testID="move-demo-tools"
            />
            <Text variant="caption" tone="muted">
              {moveState === 'done'
                ? t('settings.moveDemoDone', { count: movedCount })
                : moveState === 'failed'
                  ? t('settings.moveDemoFailed')
                  : t('settings.moveDemoHint')}
            </Text>
          </View>
        ) : null}

        {!session.isGuest ? (
          <Button label={t('auth.signOut')} variant="secondary" onPress={() => void session.signOut()} />
        ) : null}

        {!session.isGuest ? (
          <View style={{ gap: spacing.sm }}>
            <Button
              label={t('settings.demoBorrow')}
              variant="secondary"
              loading={borrowState === 'loading'}
              onPress={() => void askToBorrowMine()}
            />
            <Text variant="caption" tone="muted">
              {borrowState === 'done'
                ? t('settings.demoBorrowDone', { tool: borrowTool })
                : borrowState === 'already'
                  ? t('settings.demoBorrowAlready')
                  : borrowState === 'noTool'
                    ? t('settings.demoBorrowNoTool')
                    : t('settings.demoBorrowHint')}
            </Text>

            <Button
              label={t('settings.demoAnswer')}
              variant="secondary"
              loading={answerState === 'loading'}
              onPress={() => void answerMyRequests()}
            />
            <Text variant="caption" tone="muted">
              {answerState === 'done'
                ? t('settings.demoAnswerDone', { count: answeredCount })
                : answerState === 'none'
                  ? t('settings.demoAnswerNone')
                  : t('settings.demoAnswerHint')}
            </Text>
          </View>
        ) : null}

        <Button
          label={t('settings.deleteAccount')}
          variant="destructive"
          onPress={() => router.push('/me/settings/delete-account')}
        />

        <Text variant="caption" tone="muted" center>
          {t('settings.version', { version: '0.1.0' })}
        </Text>
      </View>
    </Screen>
  );
}
