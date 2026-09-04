import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppHeader } from '@/components/domain/AppHeader';
import { Icon, type IconName } from '@/components/domain/Icon';
import { ToolIllustration } from '@/components/domain/ToolIllustration';
import { Avatar, EmptyState, Text } from '@/components/primitives';
import { useSession } from '@/features/auth/session';
import { useConversations, useMessages, useSendMessage } from '@/features/chat/hooks';
import { useTransaction } from '@/features/transactions/hooks';
import { useTool } from '@/features/tools/hooks';
import { backIcon } from '@/i18n/direction';
import { currentLocale } from '@/i18n';
import { formatDistance, formatMoney, formatRelativeDay, formatTime } from '@/lib/format';
import { useTheme } from '@/theme';

const QUICK_REPLIES = [
  'chat.quickReplies.onMyWay',
  'chat.quickReplies.runningLate',
  'chat.quickReplies.thanks',
];

/** One cell of the three-up facts strip under the tool. */
function Fact({
  icon,
  value,
  caption,
  tone,
}: {
  icon: IconName;
  value: string;
  caption?: string;
  tone?: 'accent';
}) {
  const { colors, spacing } = useTheme();
  return (
    <View style={{ flex: 1, alignItems: 'center', gap: spacing.xs }}>
      <Icon name={icon} color={colors.textMuted} size={19} />
      <Text
        variant="bodyStrong"
        center
        numberOfLines={1}
        // "tomorrow" is lower-case because it also appears mid-sentence in the
        // return banner; as a standalone label it needs a capital.
        style={{
          fontSize: 14,
          textTransform: 'capitalize',
          color: tone === 'accent' ? colors.free : colors.text,
        }}
      >
        {value}
      </Text>
      {caption ? (
        <Text variant="caption" tone="muted" center numberOfLines={1} style={{ fontSize: 12 }}>
          {caption}
        </Text>
      ) : null}
    </View>
  );
}

/**
 * The conversation.
 *
 * Scoped to one exchange, and it says so at the top: which tool, which state,
 * when it is due back. A borrow chat that loses that context turns into two
 * people trying to remember what they agreed, which is exactly where these
 * arrangements go wrong.
 */
export default function Chat() {
  const { conversationId } = useLocalSearchParams<{ conversationId: string }>();
  const { t } = useTranslation();
  const router = useRouter();
  const { colors, spacing, radius, hitSize } = useTheme();
  const insets = useSafeAreaInsets();
  const { userId } = useSession();
  const listRef = useRef<FlatList>(null);

  const { data: conversations } = useConversations();
  const conversation = conversations?.find((c) => c.id === conversationId);
  const { data: messages, isPending } = useMessages(conversationId);
  const { data: transaction } = useTransaction(conversation?.transactionId ?? undefined);
  const { data: tool } = useTool(conversation?.toolId ?? undefined);
  const send = useSendMessage(conversationId, userId ?? '');
  const [text, setText] = useState('');

  function submit(body: string, kind?: 'text' | 'quick_reply') {
    const trimmed = body.trim();
    if (!trimmed) return;
    send.mutate({ body: trimmed, kind });
    setText('');
  }

  const locale = currentLocale();
  const due = transaction?.dueAt ?? null;

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: colors.background, paddingTop: insets.top }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={{ paddingHorizontal: spacing.sm }}>
        <AppHeader
          align="center"
          size={26}
          left={{ icon: backIcon(), label: t('common.back'), onPress: () => router.back() }}
          right={{
            icon: 'more',
            label: t('common.more'),
            onPress: () =>
              conversation?.transactionId
                ? router.push(`/transaction/${conversation.transactionId}`)
                : router.push(`/tool/${conversation?.toolId}`),
          }}
        />
      </View>

      {/* What this conversation is about, pinned. */}
      {conversation?.toolTitle ? (
        <View
          style={{
            margin: spacing.lg,
            marginBottom: spacing.sm,
            borderRadius: radius.lg,
            borderWidth: 1,
            borderColor: colors.border,
            backgroundColor: colors.surface,
            overflow: 'hidden',
          }}
        >
          <Pressable
            onPress={() => conversation.toolId && router.push(`/tool/${conversation.toolId}`)}
            accessibilityRole="button"
            accessibilityLabel={conversation.toolTitle}
            style={({ pressed }) => ({
              flexDirection: 'row',
              alignItems: 'center',
              gap: spacing.md,
              padding: spacing.md,
              opacity: pressed ? 0.9 : 1,
            })}
          >
            <View
              style={{
                width: 52,
                height: 52,
                borderRadius: radius.md,
                overflow: 'hidden',
                backgroundColor: colors.surfaceSunken,
              }}
            >
              {conversation.toolPhotoUrl ? (
                <Image
                  source={{ uri: conversation.toolPhotoUrl }}
                  style={{ width: '100%', height: '100%' }}
                  contentFit="cover"
                />
              ) : (
                <ToolIllustration
                  toolType={tool?.toolType}
                  category={tool?.categorySlug ?? 'other'}
                  size={46}
                />
              )}
            </View>

            <View style={{ flex: 1, gap: spacing.xs }}>
              <Text variant="bodyStrong" numberOfLines={1}>
                {conversation.toolTitle}
              </Text>
              {transaction ? (
                <View
                  style={{
                    alignSelf: 'flex-start',
                    paddingHorizontal: spacing.md,
                    paddingVertical: 3,
                    borderRadius: radius.pill,
                    backgroundColor: colors.accent,
                  }}
                >
                  <Text variant="caption" tone="onAccent" style={{ fontSize: 13 }}>
                    {t(`transaction.steps.${transaction.status === 'agreed' ? 'accepted' : 'pickedUp'}`)}
                  </Text>
                </View>
              ) : null}
            </View>
          </Pressable>

          {transaction || tool ? (
            <View
              style={{
                flexDirection: 'row',
                paddingVertical: spacing.md,
                marginHorizontal: spacing.md,
                marginBottom: spacing.md,
                borderRadius: radius.md,
                borderWidth: 1,
                borderColor: colors.border,
              }}
            >
              {due ? (
                <Fact
                  icon="calendar"
                  value={formatRelativeDay(due, t, locale)}
                  caption={formatTime(due, locale)}
                />
              ) : null}
              {tool ? (
                <Fact
                  icon="tag"
                  tone="accent"
                  value={
                    tool.paymentMode === 'free'
                      ? t('common.free')
                      : formatMoney(tool.pricePerDayAgorot ?? 0, tool.currency, locale)
                  }
                />
              ) : null}
              {tool ? (
                <Fact
                  icon="pin"
                  value={t('common.away', { distance: formatDistance(tool.distanceM, t) })}
                />
              ) : null}
            </View>
          ) : null}
        </View>
      ) : null}

      <FlatList
        ref={listRef}
        data={messages ?? []}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ paddingHorizontal: spacing.lg, paddingBottom: spacing.md, gap: spacing.md }}
        onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: true })}
        ListEmptyComponent={isPending ? null : <EmptyState title={t('chat.sayHi')} />}
        renderItem={({ item }) => {
          const mine = item.senderId === userId;

          if (item.kind === 'system') {
            return (
              <Text variant="caption" tone="muted" center>
                {item.body}
              </Text>
            );
          }

          return (
            <View
              style={{
                flexDirection: mine ? 'row-reverse' : 'row',
                alignItems: 'flex-end',
                gap: spacing.sm,
              }}
            >
              {mine ? (
                <View
                  style={{
                    width: 34,
                    height: 34,
                    borderRadius: 17,
                    backgroundColor: colors.accent,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Text variant="caption" tone="onAccent" style={{ fontSize: 12 }}>
                    {t('chat.you')}
                  </Text>
                </View>
              ) : (
                <Avatar
                  uri={conversation?.counterparty.avatarUrl ?? null}
                  name={conversation?.counterparty.firstName ?? '?'}
                  size={34}
                />
              )}

              <View style={{ maxWidth: '76%', gap: 3 }}>
                <Text
                  variant="caption"
                  tone="muted"
                  style={{ fontSize: 12, textAlign: mine ? 'right' : 'left' }}
                >
                  {mine ? t('chat.you') : (conversation?.counterparty.firstName ?? '')}
                </Text>
                <View
                  style={{
                    padding: spacing.md,
                    borderRadius: radius.lg,
                    backgroundColor: mine ? colors.accentSoft : colors.surface,
                    borderWidth: 1,
                    borderColor: mine ? colors.accentSoft : colors.border,
                    opacity: item.pending ? 0.6 : 1,
                  }}
                >
                  <Text variant="body">{item.body}</Text>
                </View>
                <View
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: spacing.xs,
                    justifyContent: mine ? 'flex-end' : 'flex-start',
                  }}
                >
                  <Text variant="caption" tone="muted" style={{ fontSize: 12 }}>
                    {item.pending ? t('chat.pending') : formatTime(item.createdAt, locale)}
                  </Text>
                  {mine && !item.pending ? (
                    <Icon name="ticks" color={colors.accent} size={15} strokeWidth={2} />
                  ) : null}
                </View>
              </View>
            </View>
          );
        }}
      />

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{
          paddingHorizontal: spacing.lg,
          gap: spacing.sm,
          paddingBottom: spacing.sm,
        }}
      >
        {QUICK_REPLIES.map((key) => (
          <Pressable
            key={key}
            onPress={() => submit(t(key), 'quick_reply')}
            accessibilityRole="button"
            accessibilityLabel={t(key)}
            testID={`quick-${key.split('.').pop()}`}
            style={({ pressed }) => ({
              paddingHorizontal: spacing.lg,
              paddingVertical: spacing.sm,
              borderRadius: radius.pill,
              borderWidth: 1,
              borderColor: colors.accent,
              backgroundColor: colors.surface,
              opacity: pressed ? 0.8 : 1,
            })}
          >
            <Text variant="bodyStrong" tone="accent" style={{ fontSize: 14 }}>
              {t(key)}
            </Text>
          </Pressable>
        ))}
      </ScrollView>

      {/* The one thing that goes wrong most often is a late return. Say it
          before it happens, not after. */}
      {due ? (
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: spacing.md,
            marginHorizontal: spacing.lg,
            marginBottom: spacing.sm,
            padding: spacing.md,
            borderRadius: radius.md,
            backgroundColor: colors.warningSoft,
          }}
        >
          <Icon name="clock" color={colors.warning} size={22} />
          <View style={{ flex: 1, gap: 2 }}>
            <Text variant="bodyStrong" style={{ fontSize: 15, color: colors.warning }}>
              {t('chat.returnBy', {
                when: formatRelativeDay(due, t, locale),
                time: formatTime(due, locale),
              })}
            </Text>
            <Text variant="caption" tone="muted">
              {t('chat.returnReminder')}
            </Text>
          </View>
        </View>
      ) : null}

      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: spacing.sm,
          paddingHorizontal: spacing.lg,
          paddingTop: spacing.md,
          paddingBottom: insets.bottom + spacing.md,
          borderTopWidth: 1,
          borderTopColor: colors.border,
          backgroundColor: colors.surface,
        }}
      >
        <Pressable
          onPress={() => conversation?.toolId && router.push(`/tool/${conversation.toolId}`)}
          accessibilityRole="button"
          accessibilityLabel={t('common.more')}
          style={{
            width: 38,
            height: 38,
            borderRadius: 19,
            borderWidth: 1,
            borderColor: colors.border,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Icon name="plus" color={colors.textSecondary} size={20} />
        </Pressable>

        <TextInput
          value={text}
          onChangeText={setText}
          placeholder={t('chat.placeholder')}
          placeholderTextColor={colors.textMuted}
          multiline
          accessibilityLabel={t('chat.placeholder')}
          testID="chat-input"
          style={{
            flex: 1,
            minHeight: hitSize.min,
            maxHeight: 120,
            color: colors.text,
            fontSize: 16,
            paddingHorizontal: spacing.lg,
            paddingVertical: spacing.md,
            borderRadius: radius.pill,
            borderWidth: 1,
            borderColor: colors.border,
            backgroundColor: colors.background,
          }}
        />

        <Pressable
          onPress={() => submit(text)}
          disabled={text.trim().length === 0}
          accessibilityRole="button"
          accessibilityLabel={t('chat.send')}
          testID="chat-send"
          style={({ pressed }) => ({
            width: 44,
            height: 44,
            alignItems: 'center',
            justifyContent: 'center',
            opacity: text.trim().length === 0 ? 0.35 : pressed ? 0.7 : 1,
          })}
        >
          <Icon name="send" color={colors.accent} size={24} />
        </Pressable>
      </View>

      {/* NailedIt never auto-shares a phone number. Saying so, once, is worth it. */}
      <Text variant="caption" tone="muted" center style={{ paddingBottom: spacing.sm }}>
        {t('chat.phoneNotShared')}
      </Text>
    </KeyboardAvoidingView>
  );
}
