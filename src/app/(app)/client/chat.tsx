import { StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';

/**
 * Placeholder only — there's no messaging system built yet (no
 * conversations/messages tables, no coach-side inbox). This tab exists so
 * Chat already has its permanent position in the tab bar once real
 * messaging is built, rather than reshuffling the tab bar again later.
 */
export default function ChatScreen() {
  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={[styles.safeArea, styles.centered]}>
        <ThemedText type="title" style={styles.title}>
          Chat
        </ThemedText>
        <ThemedText themeColor="textSecondary" style={styles.subtitle}>
          Direct messaging with your coach is coming soon.
        </ThemedText>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  safeArea: { flex: 1, paddingHorizontal: Spacing.four },
  centered: { alignItems: 'center', justifyContent: 'center' },
  title: {
    marginBottom: Spacing.two,
  },
  subtitle: {
    textAlign: 'center',
  },
});
