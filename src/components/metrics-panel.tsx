import { useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, TextInput, View } from 'react-native';

import { HeroStat } from '@/components/hero-stat';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { TimeRangeToggle } from '@/components/time-range-toggle';
import { WeightTrendChart } from '@/components/weight-trend-chart';
import { Accent, Colors, Glow, Spacing } from '@/constants/theme';
import { useAuth } from '@/context/auth-context';
import { useTheme } from '@/hooks/use-theme';
import { filterByRange, type TimeRangeKey } from '@/lib/time-ranges';
import { getLatestTdeeEstimate, getTdeeConfidence, type TdeeConfidence, type TdeeEstimate } from '@/lib/tdee';
import { listWeightLogs, saveWeightLog, type WeightLogEntry } from '@/lib/weight-logs';

function round(value: number) {
  return Math.round(value * 10) / 10;
}

function todayISODate() {
  return new Date().toISOString().slice(0, 10);
}

const CONFIDENCE_LABEL: Record<TdeeConfidence['level'], string> = {
  low: 'Low confidence',
  medium: 'Medium confidence',
  high: 'High confidence',
};

const CONFIDENCE_COLOR: Record<TdeeConfidence['level'], string> = {
  low: Accent,
  medium: Colors.textSecondary,
  high: Colors.tealBright,
};

/** Weight + body fat %/muscle % logging, Estimated TDEE, and the
 * smoothed weight trend chart — everything Progress had before the
 * Measure sub-tab existed, now living under the Metrics sub-tab. */
export function MetricsPanel() {
  const theme = useTheme();
  const { session } = useAuth();
  const logDate = todayISODate();

  const [logs, setLogs] = useState<WeightLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [weightInput, setWeightInput] = useState('');
  const [bodyFatInput, setBodyFatInput] = useState('');
  const [muscleInput, setMuscleInput] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const [tdee, setTdee] = useState<TdeeEstimate | null>(null);
  const [confidence, setConfidence] = useState<TdeeConfidence | null>(null);

  const [timeRange, setTimeRange] = useState<TimeRangeKey>('1m');

  const load = useCallback(() => {
    if (!session) return;
    setLoading(true);
    listWeightLogs(session.user.id)
      .then((data) => {
        setLogs(data);
        const todayEntry = data.find((entry) => entry.logDate === logDate);
        setWeightInput(todayEntry ? String(todayEntry.weight) : '');
        setBodyFatInput(todayEntry?.bodyFatPercent != null ? String(todayEntry.bodyFatPercent) : '');
        setMuscleInput(todayEntry?.musclePercent != null ? String(todayEntry.musclePercent) : '');
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load your weight history.'))
      .finally(() => setLoading(false));

    Promise.all([getLatestTdeeEstimate(session.user.id), getTdeeConfidence(session.user.id, logDate)])
      .then(([estimate, conf]) => {
        setTdee(estimate);
        setConfidence(conf);
      })
      .catch((err) => console.error('Failed to load TDEE estimate:', err));
  }, [session, logDate]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const todayEntry = logs.find((entry) => entry.logDate === logDate);

  const filteredLogs = useMemo(() => filterByRange(logs, timeRange, logDate), [logs, timeRange, logDate]);

  const handleSave = async () => {
    setSaveError(null);
    if (!session) return;

    const parsedWeight = Number(weightInput);
    if (!weightInput.trim() || Number.isNaN(parsedWeight) || parsedWeight <= 0) {
      setSaveError('Enter your weight as a number.');
      return;
    }

    const parsedBodyFat = bodyFatInput.trim() ? Number(bodyFatInput) : null;
    if (parsedBodyFat !== null && (Number.isNaN(parsedBodyFat) || parsedBodyFat < 0 || parsedBodyFat > 100)) {
      setSaveError('Body fat % must be a number between 0 and 100.');
      return;
    }

    const parsedMuscle = muscleInput.trim() ? Number(muscleInput) : null;
    if (parsedMuscle !== null && (Number.isNaN(parsedMuscle) || parsedMuscle < 0 || parsedMuscle > 100)) {
      setSaveError('Muscle % must be a number between 0 and 100.');
      return;
    }

    setSaving(true);
    try {
      await saveWeightLog(session.user.id, logDate, parsedWeight, parsedBodyFat, parsedMuscle);
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
        {todayEntry ? "Today's check-in" : "Log today's check-in"}
      </ThemedText>

      <ThemedText type="small" themeColor="textSecondary">
        Weight
      </ThemedText>
      <TextInput
        value={weightInput}
        onChangeText={setWeightInput}
        placeholder="Weight"
        placeholderTextColor={theme.textSecondary}
        keyboardType="numeric"
        style={[styles.input, { color: theme.text, borderColor: theme.backgroundSelected }]}
      />

      <ThemedText type="small" themeColor="textSecondary" style={styles.fieldLabel}>
        Body fat % (optional)
      </ThemedText>
      <TextInput
        value={bodyFatInput}
        onChangeText={setBodyFatInput}
        placeholder="e.g. 18.5"
        placeholderTextColor={theme.textSecondary}
        keyboardType="numeric"
        style={[styles.input, { color: theme.text, borderColor: theme.backgroundSelected }]}
      />

      <ThemedText type="small" themeColor="textSecondary" style={styles.fieldLabel}>
        Muscle % (optional)
      </ThemedText>
      <TextInput
        value={muscleInput}
        onChangeText={setMuscleInput}
        placeholder="e.g. 42"
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

      {tdee && (
        <>
          <HeroStat value={Math.round(tdee.estimatedTdee)} label="Estimated TDEE (kcal/day)" />
          {confidence && (
            <ThemedText type="small" style={[styles.confidenceLine, { color: CONFIDENCE_COLOR[confidence.level] }]}>
              {CONFIDENCE_LABEL[confidence.level]}
              {confidence.reason ? ` — ${confidence.reason}` : ''}
            </ThemedText>
          )}
          <ThemedText type="small" themeColor="textSecondary" style={styles.tdeeAsOf}>
            As of {tdee.calculatedDate}
            {tdee.calculatedDate !== logDate ? ' — not enough recent data to recalculate today' : ''}
          </ThemedText>
        </>
      )}

      {!tdee && confidence && (
        <ThemedText themeColor="textSecondary" style={styles.tdeeAsOf}>
          Not enough logged data yet to estimate your maintenance calories — keep logging your weight and meals daily.
        </ThemedText>
      )}

      <ThemedText type="smallBold" style={styles.sectionLabel2}>
        Weight trend
      </ThemedText>

      <TimeRangeToggle value={timeRange} onChange={setTimeRange} />

      {!loading && !error && filteredLogs.length >= 2 && (
        <ThemedView type="backgroundElement" style={styles.chartCard}>
          <WeightTrendChart entries={filteredLogs} />
        </ThemedView>
      )}

      {!loading && !error && filteredLogs.length < 2 && (
        <ThemedText themeColor="textSecondary" style={styles.notEnoughData}>
          Not enough weight logged in this range to draw a trend line.
        </ThemedText>
      )}

      <ThemedText type="smallBold" style={styles.historyLabel}>
        History
      </ThemedText>

      {loading && <ActivityIndicator style={styles.loader} />}
      {!loading && error && <ThemedText style={styles.error}>{error}</ThemedText>}
      {!loading && !error && filteredLogs.length === 0 && (
        <ThemedText themeColor="textSecondary">No weight logged in this range.</ThemedText>
      )}

      {!loading &&
        !error &&
        filteredLogs.map((entry) => (
          <ThemedView key={entry.id} type="backgroundElement" style={styles.entryRow}>
            <ThemedText type="small" themeColor="textSecondary">
              {entry.logDate}
            </ThemedText>
            <View style={styles.entryValues}>
              <ThemedText type="smallBold">
                {entry.weight}
                <ThemedText type="small" themeColor="textSecondary">
                  {'  ·  trend '}
                  {round(entry.weightTrend)}
                </ThemedText>
              </ThemedText>
              {(entry.bodyFatPercent !== null || entry.musclePercent !== null) && (
                <ThemedText type="small" themeColor="textSecondary">
                  {entry.bodyFatPercent !== null ? `${round(entry.bodyFatPercent)}% fat` : ''}
                  {entry.bodyFatPercent !== null && entry.musclePercent !== null ? '  ·  ' : ''}
                  {entry.musclePercent !== null ? `${round(entry.musclePercent)}% muscle` : ''}
                </ThemedText>
              )}
            </View>
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
  },
  fieldLabel: {
    marginTop: Spacing.two,
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
  confidenceLine: {
    textAlign: 'center',
    marginTop: -Spacing.two,
  },
  tdeeAsOf: {
    textAlign: 'center',
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
  entryValues: {
    alignItems: 'flex-end',
    gap: Spacing.half,
  },
});
