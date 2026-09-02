import { ActivityIndicator, ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { SessionCalendar } from '@/components/session-calendar';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useAuth } from '@/context/auth-context';

/** Just the screen chrome — the actual calendar (view toggle, drag,
 * visual states, phase overlay) lives entirely in SessionCalendar,
 * shared with the coach's Programme Builder view of the same client's
 * schedule. */
export default function CalendarScreen() {
  const { session } = useAuth();

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <ScrollView contentContainerStyle={styles.scrollContent}>
          <ThemedText type="title" style={styles.title}>
            Calendar
          </ThemedText>

          {!session ? <ActivityIndicator style={styles.loader} /> : <SessionCalendar clientId={session.user.id} role="client" />}
        </ScrollView>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  safeArea: { flex: 1, paddingHorizontal: Spacing.four, paddingTop: Spacing.four },
  scrollContent: {
    paddingBottom: Spacing.four,
  },
  title: {
    marginBottom: Spacing.two,
  },
  loader: {
    marginTop: Spacing.four,
  },
});
