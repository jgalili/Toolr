import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FlatList, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Avatar, Button, Card, EmptyState, SegmentedControl, Skeleton, Text } from '@/components/primitives';
import { useSession } from '@/features/auth/session';
import { useConversations } from '@/features/chat/hooks';
import { WhenPicker } from '@/components/domain/WhenPicker';
import { useIncomingRequests, useRespondToRequest } from '@/features/transactions/hooks';
import { currentLocale } from '@/i18n';
import { formatDayTime } from '@/lib/format';
import { useTheme } from '@/theme';

/**
 * Inbox: requests first, chats second.
 *
 * Incoming requests carry inline Accept / Decline so the common case is one
 * tap from the notification, not a three-screen journey.
 */
export default function Inbox() {
  const { t } = useTranslation();
  const router = useRouter();
  const { colors, spacing } = useTheme();
  const insets = useSafeAreaInsets();
  const { isGuest } = useSession();
  const [tab, setTab] = useState<'requests' | 'chats'>('requests');
  // Which request has its return-time picker open, and the time being tried.
  const [editing, setEditing] = useState<string | null>(null);
  const [dueDraft, setDueDraft] = useState<Date | null>(null);

  const requests = useIncomingRequests();
  const conversations = useConversations();
  const respond = useRespondToRequest();

  if (isGuest) {
    return (
      <View style={{ flex: 1, paddingTop: insets.top, backgroundColor: colors.background }}>
        <EmptyState
          title={t('auth.browsingAsGuest')}
          body={t('auth.guestExplainer')}
          primaryAction={{ label: t('home.needTool'), onPress: () => router.push('/search') }}
        />
      </View>
    );
  }

  const pending = (requests.data ?? []).filter((r) => r.status === 'pending');
  const loading = requests.isPending || conversations.isPending;

  return (
    <View style={{ flex: 1, paddingTop: insets.top, backgroundColor: colors.background }}>
      <View style={{ padding: spacing.lg, gap: spacing.md }}>
        <Text variant="title">{t('inbox.title')}</Text>
        <SegmentedControl
          segments={[
            { value: 'requests', label: t('inbox.requests') },
            { value: 'chats', label: t('inbox.chats') },
          ]}
          value={tab}
          onChange={setTab}
        />
      </View>

      {loading ? (
        <View style={{ paddingHorizontal: spacing.lg, gap: spacing.md }}>
          {[0, 1, 2].map((n) => (
            <Skeleton key={n} height={92} radius={16} />
          ))}
        </View>
      ) : tab === 'requests' ? (
        <FlatList
          data={pending}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ paddingHorizontal: spacing.lg, gap: spacing.md }}
          ListEmptyComponent={<EmptyState title={t('inbox.noRequests')} />}
          renderItem={({ item }) => (
            <Card>
              <View style={{ gap: spacing.md }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
                  <Avatar uri={item.borrower.avatarUrl} name={item.borrower.firstName} size={44} />
                  <View style={{ flex: 1, gap: 2 }}>
                    <Text variant="bodyStrong">
                      {t('inbox.wantsToBorrow', {
                        name: item.borrower.firstName,
                        tool: item.toolTitle,
                      })}
                    </Text>
                    <Text variant="caption" tone="muted">
                      {t('inbox.fromUntil', {
                        from: formatDayTime(item.startAt, currentLocale()),
                        until: formatDayTime(item.endAt, currentLocale()),
                      })}
                    </Text>
                  </View>
                </View>

                {item.message ? (
                  <Text variant="body" tone="secondary">
                    “{item.message}”
                  </Text>
                ) : null}

                {/* "Yes, but Thursday" is the most common real answer, and
                    without it an owner has to decline someone they are happy
                    to lend to. Folded away, so the one-tap yes stays one tap. */}
                {editing === item.id ? (
                  <WhenPicker
                    label={t('request.returnBy')}
                    value={dueDraft ?? new Date(item.endAt)}
                    onChange={setDueDraft}
                    earliest={new Date(item.startAt)}
                  />
                ) : null}

                <View style={{ flexDirection: 'row', gap: spacing.sm }}>
                  <Button
                    label={
                      editing === item.id && dueDraft
                        ? t('request.acceptWithChange', {
                            when: formatDayTime(dueDraft.toISOString(), currentLocale()),
                          })
                        : t('inbox.accept')
                    }
                    fullWidth={false}
                    style={{ flex: 1 }}
                    loading={respond.isPending}
                    onPress={() =>
                      respond.mutate({
                        id: item.id,
                        decision: 'accepted',
                        dueAt: editing === item.id ? (dueDraft?.toISOString() ?? null) : null,
                      })
                    }
                  />
                  <Button
                    label={t('inbox.decline')}
                    variant="secondary"
                    fullWidth={false}
                    style={{ flex: 1 }}
                    onPress={() => respond.mutate({ id: item.id, decision: 'declined' })}
                  />
                </View>

                <Button
                  label={editing === item.id ? t('request.acceptAsAsked') : t('request.adjustReturn')}
                  variant="ghost"
                  onPress={() => {
                    if (editing === item.id) {
                      setEditing(null);
                      setDueDraft(null);
                    } else {
                      setEditing(item.id);
                      setDueDraft(new Date(item.endAt));
                    }
                  }}
                />
              </View>
            </Card>
          )}
        />
      ) : (
        <FlatList
          data={conversations.data ?? []}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ paddingHorizontal: spacing.lg, gap: spacing.sm }}
          ListEmptyComponent={<EmptyState title={t('inbox.noChats')} />}
          renderItem={({ item }) => (
            <Card onPress={() => router.push(`/chat/${item.id}`)} accessibilityLabel={item.counterparty.firstName}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
                <Avatar uri={item.counterparty.avatarUrl} name={item.counterparty.firstName} size={44} />
                <View style={{ flex: 1, gap: 2 }}>
                  <Text variant="bodyStrong">{item.counterparty.firstName}</Text>
                  <Text variant="caption" tone="muted" numberOfLines={1}>
                    {item.toolTitle ? `${item.toolTitle} · ` : ''}
                    {item.lastMessage ?? ''}
                  </Text>
                </View>
                {item.unread ? (
                  <View
                    style={{
                      width: 10,
                      height: 10,
                      borderRadius: 5,
                      backgroundColor: colors.accent,
                    }}
                  />
                ) : null}
              </View>
            </Card>
          )}
        />
      )}
    </View>
  );
}
