import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, TextInput } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { HeroStat } from '@/components/hero-stat';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { WeightTrendChart } from '@/components/weight-trend-chart';
import { Accent, Colors, Glow, Spacing } from '@/constants/theme';
import { useAuth } from '@/context/auth-context';
import { useTheme } from '@/hooks/use-theme';
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

export default function ProgressScreen() {
  const theme = useTheme();
  const { session } = useAuth();
  const logDate = todayISODate();

  const [logs, setLogs] = useState<WeightLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [weightInput, setWeightInput] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const [tdee, setTdee] = useState<TdeeEstimate | null>(null);
  const [confidence, setConfidence] = useState<TdeeConfidence | null>(null);

  const load = useCallback(() => {
    if (!session) return;
    setLoading(true);
    listWeightLogs(session.user.id)
      .then((data) => {
        setLogs(data);
        const todayEntry = data.find((entry) => entry.logDate === logDate);
        setWeightInput(todayEntry ? String(todayEntry.weight) : '');
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

  const handleSave = async () => {
    setSaveError(null);
    if (!session) return;

    const parsedWeight = Number(weightInput);
    if (!weightInput.trim() || Number.isNaN(parsedWeight) || parsedWeight <= 0) {
      setSaveError('Enter your weight as a number.');
      return;
    }

    setSaving(true);
    try {
      await saveWeightLog(session.user.id, logDate, parsedWeight);
      load();
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Something went wrong saving this entry.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
          <ThemedText type="title" style={styles.title}>
            Progress
          </ThemedText>

          <ThemedText type="smallBold" style={styles.sectionLabel}>
            {todayEntry ? "Today's weight" : "Log today's weight"}
          </ThemedText>

          <TextInput
            value={weightInput}
            onChangeText={setWeightInput}
            placeholder="Weight"
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
              Not enough logged data yet to estimate your maintenance calories — keep logging your weight and meals
              daily.
            </ThemedText>
          )}

          {!loading && !error && logs.length >= 2 && (
            <ThemedView type="backgroundElement" style={styles.chartCard}>
              <WeightTrendChart entries={logs} />
            </ThemedView>
          )}

          <ThemedText type="smallBold" style={styles.historyLabel}>
            History
          </ThemedText>

          {loading && <ActivityIndicator style={styles.loader} />}
          {!loading && error && <ThemedText style={styles.error}>{error}</ThemedText>}
          {!loading && !error && logs.length === 0 && (
            <ThemedText themeColor="textSecondary">No weight logged yet.</ThemedText>
          )}

          {!loading &&
            !error &&
            logs.map((entry) => (
              <ThemedView key={entry.id} type="backgroundElement" style={styles.entryRow}>
                <ThemedText type="small" themeColor="textSecondary">
                  {entry.logDate}
                </ThemedText>
                <ThemedText type="smallBold">
                  {entry.weight}
                  <ThemedText type="small" themeColor="textSecondary">
                    {'  ·  trend '}
                    {round(entry.weightTrend)}
                  </ThemedText>
                </ThemedText>
              </ThemedView>
            ))}
        </ScrollView>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  safeArea: { flex: 1, paddingHorizontal: Spacing.four, paddingTop: Spacing.four },
  scrollContent: {
    gap: Spacing.two,
    paddingBottom: Spacing.four,
  },
  title: {
    marginBottom: Spacing.two,
  },
  sectionLabel: {
    marginBottom: Spacing.half,
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
    marginTop: Spacing.three,
  },
  confidenceLine: {
    textAlign: 'center',
    marginTop: -Spacing.two,
  },
  tdeeAsOf: {
    textAlign: 'center',
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
