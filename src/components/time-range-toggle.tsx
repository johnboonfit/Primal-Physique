import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Accent, Colors, Spacing } from '@/constants/theme';
import { TIME_RANGES, type TimeRangeKey } from '@/lib/time-ranges';

export function TimeRangeToggle({ value, onChange }: { value: TimeRangeKey; onChange: (key: TimeRangeKey) => void }) {
  return (
    <View style={styles.row}>
      {TIME_RANGES.map((range) => (
        <Pressable key={range.key} onPress={() => onChange(range.key)} style={styles.chipWrap}>
          <View style={[styles.chip, value === range.key && styles.chipActive]}>
            <ThemedText type="small" style={value === range.key ? styles.chipActiveText : styles.chipText}>
              {range.label}
            </ThemedText>
          </View>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: Spacing.one,
    marginBottom: Spacing.two,
  },
  chipWrap: {
    flex: 1,
  },
  chip: {
    borderRadius: 999,
    paddingVertical: Spacing.one,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.backgroundElement,
  },
  chipActive: {
    backgroundColor: Accent,
  },
  chipText: {
    color: Colors.textSecondary,
  },
  chipActiveText: {
    color: Colors.text,
  },
});
