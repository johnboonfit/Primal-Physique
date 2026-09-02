import { ActivityIndicator, Modal, Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Accent, Colors, Glow, Spacing } from '@/constants/theme';

type ConfirmDialogProps = {
  visible: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
};

/**
 * A real modal, not `Alert.alert` — react-native-web's Alert is a no-op
 * stub (see node_modules/react-native-web/src/exports/Alert), so it would
 * silently do nothing on the web build. `Modal` renders a real overlay on
 * every platform this app ships to, same as the food-log-entry modal on
 * the client's Nutrition tab already relies on.
 */
export function ConfirmDialog({ visible, title, message, confirmLabel = 'Archive', busy, onConfirm, onCancel }: ConfirmDialogProps) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <View style={styles.overlay}>
        <ThemedView type="backgroundElement" style={styles.card}>
          <ThemedText type="smallBold" style={styles.title}>
            {title}
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            {message}
          </ThemedText>

          <Pressable
            style={({ pressed }) => [styles.confirmButton, pressed && styles.pressed]}
            onPress={onConfirm}
            disabled={busy}>
            {busy ? (
              <ActivityIndicator color={Colors.text} />
            ) : (
              <ThemedText type="smallBold" style={styles.confirmButtonText}>
                {confirmLabel}
              </ThemedText>
            )}
          </Pressable>

          <Pressable style={styles.cancelButton} onPress={onCancel} disabled={busy}>
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
