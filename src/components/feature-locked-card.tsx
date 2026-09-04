import { StyleSheet } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';

/**
 * The one "this feature is gated" visual, shared by every screen a
 * client-feature-toggle (or, for Leaderboards, a membership tier) can
 * lock — a greyed card naming the feature and why. Kept as one shared
 * component specifically so all three (soon four) call sites can't
 * quietly drift into slightly different locked-state designs.
 */
export function FeatureLockedCard({ title, message }: { title: string; message: string }) {
  return (
    <ThemedView type="backgroundElement" style={styles.card}>
      <ThemedText type="smallBold" style={styles.title}>
        🔒 {title}
      </ThemedText>
      <ThemedText themeColor="textSecondary">{message}</ThemedText>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: Spacing.two,
    padding: Spacing.four,
    gap: Spacing.two,
    alignItems: 'center',
    opacity: 0.6,
  },
  title: {
    marginBottom: Spacing.one,
  },
});
