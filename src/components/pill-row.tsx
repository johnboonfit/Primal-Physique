import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Accent, Colors, Spacing } from '@/constants/theme';

export type PillItem = {
  key: string;
  label: string;
  onPress: () => void;
};

type PillRowProps = {
  items: PillItem[];
  /** Which item (if any) should render in the selected/Accent-filled
   * state -- Progress's Metrics/Measure/Exercise/Photos switcher passes
   * the current sub-tab, so only that one pill is red/white and the rest
   * sit in the plain resting look. Left unset entirely for a row of
   * plain navigation pills (Training's View Calendar/Log Activity/Form
   * Check, Nutrition's Saved Meals) -- there's no "selected" concept for
   * a one-shot action button, so every pill in that kind of row renders
   * red/white by default instead. */
  activeKey?: string;
};

/**
 * The one pill-row look used across the app -- first established on
 * Progress's Metrics/Measure/Exercise/Photos switcher, now the shared
 * source of truth so every other screen's "row of pill buttons under
 * the title" (Training, Nutrition) stays visually identical to it
 * rather than each screen keeping its own copy of the same styles.
 */
export function PillRow({ items, activeKey }: PillRowProps) {
  return (
    <View style={styles.row}>
      {items.map((item) => {
        const active = activeKey === undefined ? true : item.key === activeKey;
        return (
          <Pressable key={item.key} onPress={item.onPress}>
            <View style={[styles.pill, active && styles.pillActive]}>
              <ThemedText type="smallBold" style={active ? styles.pillActiveText : styles.pillText}>
                {item.label}
              </ThemedText>
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
    marginBottom: Spacing.two,
  },
  pill: {
    borderRadius: 999,
    paddingVertical: Spacing.one,
    paddingHorizontal: Spacing.three,
    backgroundColor: Colors.backgroundElement,
  },
  pillActive: {
    backgroundColor: Accent,
  },
  pillText: {
    color: Colors.textSecondary,
  },
  pillActiveText: {
    color: Colors.text,
  },
});
