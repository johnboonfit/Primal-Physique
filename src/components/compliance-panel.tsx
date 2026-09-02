import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { HeroStat } from '@/components/hero-stat';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Accent, Spacing } from '@/constants/theme';
import { useAuth } from '@/context/auth-context';
import { getComplianceScore, type ComplianceBreakdown } from '@/lib/compliance';

function round(rate: number) {
  return Math.round(rate * 100);
}

/** Compliance Score — the average of check-in punctuality and macro
 * adherence over the trailing 4 weeks. Both halves read from data that
 * already exists elsewhere (form_check_ins, food_logs, the real
 * Adaptive TDEE target) — nothing new is logged here, this panel is
 * purely a read/display of getComplianceScore(). */
export function CompliancePanel() {
  const { session } = useAuth();

  const [breakdown, setBreakdown] = useState<ComplianceBreakdown | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      if (!session) return;
      let cancelled = false;

      setLoading(true);
      getComplianceScore(session.user.id)
        .then((data) => {
          if (!cancelled) setBreakdown(data);
        })
        .catch((err) => {
          if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to calculate your Compliance Score.');
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });

      return () => {
        cancelled = true;
      };
    }, [session])
  );

  if (loading) return <ActivityIndicator style={styles.loader} />;
  if (error) return <ThemedText style={styles.error}>{error}</ThemedText>;
  if (!breakdown) return null;

  return (
    <View style={styles.container}>
      <HeroStat value={`${breakdown.score}%`} label="Compliance Score" progress={breakdown.score / 100} />

      <ThemedText type="small" themeColor="textSecondary" style={styles.windowLabel}>
        Last 4 weeks · {breakdown.windowStart} – {breakdown.windowEnd}
      </ThemedText>

      <ThemedView type="backgroundElement" style={styles.card}>
        <View style={styles.rowHeader}>
          <ThemedText type="smallBold">Check-in punctuality</ThemedText>
          <ThemedText type="smallBold">{round(breakdown.punctualityRate)}%</ThemedText>
        </View>
        <ThemedText type="small" themeColor="textSecondary">
          {breakdown.checkInsScheduled === 0
            ? 'No check-ins scheduled yet in this window.'
            : `${breakdown.checkInsOnTime} of ${breakdown.checkInsScheduled} submitted on time.`}
        </ThemedText>
      </ThemedView>

      <ThemedView type="backgroundElement" style={styles.card}>
        <View style={styles.rowHeader}>
          <ThemedText type="smallBold">Macro adherence</ThemedText>
          <ThemedText type="smallBold">{round(breakdown.macroAdherenceRate)}%</ThemedText>
        </View>
        <ThemedText type="small" themeColor="textSecondary">
          {breakdown.targetCalories === null
            ? 'No calorie target yet — needs a real TDEE estimate first.'
            : `${breakdown.daysAdherent} of ${breakdown.daysInWindow} days within 15% of ${Math.round(breakdown.targetCalories)} kcal/day.`}
        </ThemedText>
      </ThemedView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: Spacing.two,
  },
  loader: {
    marginTop: Spacing.five,
  },
  error: {
    color: Accent,
    textAlign: 'center',
    marginTop: Spacing.five,
  },
  windowLabel: {
    textAlign: 'center',
    marginTop: -Spacing.two,
  },
  card: {
    borderRadius: Spacing.two,
    padding: Spacing.three,
    gap: Spacing.half,
  },
  rowHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
});
