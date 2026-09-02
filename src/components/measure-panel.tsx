import { useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, TextInput, View } from 'react-native';

import { MeasurementChart } from '@/components/measurement-chart';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { TimeRangeToggle } from '@/components/time-range-toggle';
import { Accent, Colors, Glow, Spacing } from '@/constants/theme';
import { useAuth } from '@/context/auth-context';
import { useTheme } from '@/hooks/use-theme';
import {
  groupMeasurementsByType,
  listBodyMeasurements,
  MEASUREMENT_TYPES,
  saveBodyMeasurement,
  type MeasurementEntry,
  type MeasurementType,
} from '@/lib/body-measurements';
import { filterByRange, type TimeRangeKey } from '@/lib/time-ranges';

function round(value: number) {
  return Math.round(value * 10) / 10;
}

function todayISODate() {
  return new Date().toISOString().slice(0, 10);
}

function typeLabel(type: MeasurementType) {
  return MEASUREMENT_TYPES.find((t) => t.key === type)?.label ?? type;
}

/** Waist/chest/arms/thighs/hips/neck logging — one measurement type
 * selected at a time, so the log form, graph, and history below it are
 * always all showing the same type and never mix data from another. */
export function MeasurePanel() {
  const theme = useTheme();
  const { session } = useAuth();
  const logDate = todayISODate();

  const [entries, setEntries] = useState<MeasurementEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [selectedType, setSelectedType] = useState<MeasurementType>('waist');
  const [valueInput, setValueInput] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const [timeRange, setTimeRange] = useState<TimeRangeKey>('1m');

  const load = useCallback(() => {
    if (!session) return;
    setLoading(true);
    listBodyMeasurements(session.user.id)
      .then(setEntries)
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load your measurements.'))
      .finally(() => setLoading(false));
  }, [session]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const grouped = useMemo(() => groupMeasurementsByType(entries), [entries]);
  const selectedEntries = grouped[selectedType];

  const todayEntry = selectedEntries.find((entry) => entry.logDate === logDate);

  const handleSelectType = (type: MeasurementType) => {
    setSelectedType(type);
    setSaveError(null);
    const existingToday = grouped[type].find((entry) => entry.logDate === logDate);
    setValueInput(existingToday ? String(existingToday.valueCm) : '');
  };

  const filteredEntries = useMemo(
    () => filterByRange(selectedEntries, timeRange, logDate),
    [selectedEntries, timeRange, logDate]
  );

  const handleSave = async () => {
    setSaveError(null);
    if (!session) return;

    const parsedValue = Number(valueInput);
    if (!valueInput.trim() || Number.isNaN(parsedValue) || parsedValue <= 0) {
      setSaveError('Enter a measurement as a number greater than 0.');
      return;
    }

    setSaving(true);
    try {
      await saveBodyMeasurement(session.user.id, logDate, selectedType, parsedValue);
      load();
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Something went wrong saving this entry.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <ThemedText type="smallBold" style={styles.sectionLabel}>
        Measurement
      </ThemedText>

      <View style={styles.typeRow}>
        {MEASUREMENT_TYPES.map((type) => (
          <Pressable key={type.key} onPress={() => handleSelectType(type.key)} style={styles.typeChipWrap}>
            <View style={[styles.typeChip, selectedType === type.key && styles.typeChipActive]}>
              <ThemedText
                type="small"
                style={selectedType === type.key ? styles.typeChipActiveText : styles.typeChipText}>
                {type.label}
              </ThemedText>
            </View>
          </Pressable>
        ))}
      </View>

      <ThemedText type="smallBold" style={styles.sectionLabel2}>
        {todayEntry ? `Today's ${typeLabel(selectedType).toLowerCase()}` : `Log today's ${typeLabel(selectedType).toLowerCase()}`}
      </ThemedText>

      <TextInput
        value={valueInput}
        onChangeText={setValueInput}
        placeholder={`${typeLabel(selectedType)} (cm)`}
        placeholderTextColor={theme.textSecondary}
        keyboardType="numeric"
        style={[styles.input, { color: theme.text, borderColor: theme.backgroundSelected }]}
      />

      {saveError && <ThemedText style={styles.error}>{saveError}</ThemedText>}

      <Pressable
        style={({ pressed }) => [styles.primaryButton, pressed && styles.pressed]}
        onPress={handleSave}
        disabled={saving}>
        {saving ? (
          <ActivityIndicator color={Colors.text} />
        ) : (
          <ThemedText type="smallBold" style={styles.primaryButtonText}>
            {todayEntry ? 'Update' : 'Save'}
          </ThemedText>
        )}
      </Pressable>

      <ThemedText type="smallBold" style={styles.sectionLabel2}>
        {typeLabel(selectedType)} trend
      </ThemedText>

      <TimeRangeToggle value={timeRange} onChange={setTimeRange} />

      {!loading && !error && filteredEntries.length >= 2 && (
        <ThemedView type="backgroundElement" style={styles.chartCard}>
          <MeasurementChart entries={filteredEntries.map((entry) => ({ logDate: entry.logDate, value: entry.valueCm }))} />
        </ThemedView>
      )}

      {!loading && !error && filteredEntries.length < 2 && (
        <ThemedText themeColor="textSecondary" style={styles.notEnoughData}>
          Not enough {typeLabel(selectedType).toLowerCase()} measurements in this range to draw a graph.
        </ThemedText>
      )}

      <ThemedText type="smallBold" style={styles.historyLabel}>
        History
      </ThemedText>

      {loading && <ActivityIndicator style={styles.loader} />}
      {!loading && error && <ThemedText style={styles.error}>{error}</ThemedText>}
      {!loading && !error && filteredEntries.length === 0 && (
        <ThemedText themeColor="textSecondary">No {typeLabel(selectedType).toLowerCase()} logged in this range.</ThemedText>
      )}

      {!loading &&
        !error &&
        filteredEntries.map((entry) => (
          <ThemedView key={entry.id} type="backgroundElement" style={styles.entryRow}>
            <ThemedText type="small" themeColor="textSecondary">
              {entry.logDate}
            </ThemedText>
            <ThemedText type="smallBold">{round(entry.valueCm)} cm</ThemedText>
          </ThemedView>
        ))}
    </>
  );
}

const styles = StyleSheet.create({
  sectionLabel: {
    marginBottom: Spacing.half,
  },
  sectionLabel2: {
    marginTop: Spacing.three,
    marginBottom: Spacing.half,
  },
  typeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.one,
  },
  typeChipWrap: {
    minWidth: '30%',
  },
  typeChip: {
    borderRadius: 999,
    paddingVertical: Spacing.one,
    paddingHorizontal: Spacing.two,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.backgroundElement,
  },
  typeChipActive: {
    backgroundColor: Accent,
  },
  typeChipText: {
    color: Colors.textSecondary,
  },
  typeChipActiveText: {
    color: Colors.text,
  },
  input: {
    borderWidth: 1,
    borderRadius: Spacing.two,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.three,
    fontSize: 16,
  },
  error: {
    color: Accent,
    textAlign: 'center',
  },
  primaryButton: {
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
  primaryButtonText: {
    color: Colors.text,
  },
  chartCard: {
    borderRadius: Spacing.two,
    padding: Spacing.three,
  },
  notEnoughData: {
    textAlign: 'center',
    marginTop: Spacing.two,
  },
  historyLabel: {
    marginTop: Spacing.three,
  },
  loader: {
    marginTop: Spacing.two,
  },
  entryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderRadius: Spacing.two,
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.three,
  },
});
