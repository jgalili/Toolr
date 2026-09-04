import React from 'react';
import { Modal, Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTheme } from '@/theme';

import { Text } from './Text';

type Props = {
  visible: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  /** Sheets that must be answered (a destructive confirm) set this false. */
  dismissable?: boolean;
  testID?: string;
};

/**
 * A bottom sheet. Auth uses this rather than a full screen on purpose:
 * dismissing must leave the person exactly where they were, still a guest,
 * with nothing lost.
 */
export function Sheet({ visible, onClose, title, children, dismissable = true, testID }: Props) {
  const { colors, radius, spacing, shadow } = useTheme();
  const insets = useSafeAreaInsets();

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={dismissable ? onClose : undefined}
      statusBarTranslucent
    >
      <View style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.4)' }}>
        <Pressable
          style={{ flex: 1 }}
          accessibilityLabel="Close"
          accessibilityRole="button"
          onPress={dismissable ? onClose : undefined}
        />
        <View
          testID={testID}
          style={[
            {
              backgroundColor: colors.background,
              borderTopLeftRadius: radius.xl,
              borderTopRightRadius: radius.xl,
              paddingTop: spacing.md,
              paddingBottom: insets.bottom + spacing.lg,
              maxHeight: '88%',
            },
            shadow.raised,
          ]}
        >
          <View
            style={{
              alignSelf: 'center',
              width: 40,
              height: 4,
              borderRadius: 2,
              backgroundColor: colors.borderStrong,
              marginBottom: spacing.md,
            }}
          />
          {title ? (
            <Text variant="heading" style={{ paddingHorizontal: spacing.lg, marginBottom: spacing.md }}>
              {title}
            </Text>
          ) : null}
          <ScrollView
            contentContainerStyle={{ paddingHorizontal: spacing.lg, gap: spacing.md }}
            keyboardShouldPersistTaps="handled"
          >
            {children}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}
