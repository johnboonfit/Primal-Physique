import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';

// A fixed, curated grid rather than a full emoji-keyboard library —
// this is a composer accent, not a replacement for the OS keyboard's
// own emoji support (which still works fine by itself).
const EMOJIS = [
  '😀', '😂', '😍', '😊', '😉', '😎', '🤔', '😢',
  '😡', '👍', '👎', '👏', '🙏', '💪', '🔥', '💯',
  '❤️', '🎉', '✅', '❌', '😴', '🤗', '😅', '🙌',
  '👊', '🏆', '💦', '🥵', '🫡', '😤', '🤯', '👀',
];

type EmojiPickerProps = {
  visible: boolean;
  onSelect: (emoji: string) => void;
  onClose: () => void;
};

/** Same Modal shape as ConfirmDialog/ReportPostModal — a real overlay,
 * not react-native-web's no-op Alert. */
export function EmojiPicker({ visible, onSelect, onClose }: EmojiPickerProps) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <ThemedView type="backgroundElement" style={styles.card}>
          <ScrollView contentContainerStyle={styles.grid}>
            {EMOJIS.map((emoji) => (
              <Pressable key={emoji} style={styles.cell} onPress={() => onSelect(emoji)}>
                <ThemedText style={styles.emoji}>{emoji}</ThemedText>
              </Pressable>
            ))}
          </ScrollView>
          <Pressable style={styles.closeButton} onPress={onClose}>
            <ThemedText themeColor="textSecondary">Close</ThemedText>
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
    justifyContent: 'flex-end',
  },
  card: {
    borderTopLeftRadius: Spacing.four,
    borderTopRightRadius: Spacing.four,
    paddingTop: Spacing.three,
    paddingHorizontal: Spacing.three,
    maxHeight: 280,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  cell: {
    width: '12.5%',
    aspectRatio: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emoji: {
    fontSize: 24,
  },
  closeButton: {
    alignItems: 'center',
    paddingVertical: Spacing.three,
  },
});
