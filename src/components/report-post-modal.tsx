import { useState } from 'react';
import { ActivityIndicator, Modal, Pressable, StyleSheet, TextInput, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Accent, Colors, Glow, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

type ReportPostModalProps = {
  visible: boolean;
  busy?: boolean;
  error?: string | null;
  onSubmit: (reason: string) => void;
  onCancel: () => void;
};

/**
 * A real Modal, same reasoning as ConfirmDialog — react-native-web's
 * Alert is a no-op stub. Kept separate from ConfirmDialog rather than
 * extending it: this one needs a free-text reason field, and
 * ConfirmDialog's callers all expect its fixed message-only shape.
 */
export function ReportPostModal({ visible, busy, error, onSubmit, onCancel }: ReportPostModalProps) {
  const theme = useTheme();
  const [reason, setReason] = useState('');

  const handleCancel = () => {
    setReason('');
    onCancel();
  };

  const handleSubmit = () => {
    onSubmit(reason);
    setReason('');
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={handleCancel}>
      <View style={styles.overlay}>
        <ThemedView type="backgroundElement" style={styles.card}>
          <ThemedText type="smallBold" style={styles.title}>
            Report this post?
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            Your coach will see this report. A reason is optional but helps them review it faster.
          </ThemedText>

          <TextInput
            value={reason}
            onChangeText={setReason}
            placeholder="What's wrong with this post? (optional)"
            placeholderTextColor={theme.textSecondary}
            multiline
            numberOfLines={3}
            style={[styles.input, { color: theme.text, borderColor: theme.backgroundSelected }]}
          />

          {error && <ThemedText style={styles.error}>{error}</ThemedText>}

          <Pressable
            style={({ pressed }) => [styles.confirmButton, pressed && styles.pressed]}
            onPress={handleSubmit}
            disabled={busy}>
            {busy ? (
              <ActivityIndicator color={Colors.text} />
            ) : (
              <ThemedText type="smallBold" style={styles.confirmButtonText}>
                Submit report
              </ThemedText>
            )}
          </Pressable>

          <Pressable style={styles.cancelButton} onPress={handleCancel} disabled={busy}>
            <ThemedText themeColor="textSecondary">Cancel</ThemedText>
          </Pressable>
        </ThemedView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: Spacing.four,
  },
  card: {
    width: '100%',
    maxWidth: 400,
    borderRadius: Spacing.four,
    padding: Spacing.four,
    gap: Spacing.two,
  },
  title: {
    marginBottom: Spacing.one,
  },
  input: {
    borderWidth: 1,
    borderRadius: Spacing.two,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.three,
    fontSize: 14,
    minHeight: 72,
    textAlignVertical: 'top',
  },
  error: {
    color: Accent,
  },
  confirmButton: {
    ...Glow.oxblood,
    backgroundColor: Accent,
    borderRadius: Spacing.two,
    paddingVertical: Spacing.three,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: Spacing.two,
  },
  pressed: {
    opacity: 0.85,
  },
  confirmButtonText: {
    color: Colors.text,
  },
  cancelButton: {
    alignItems: 'center',
    paddingVertical: Spacing.two,
  },
});
