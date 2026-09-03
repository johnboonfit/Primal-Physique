import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { StatRing } from '@/components/stat-ring';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Accent, Colors, Glow, Spacing } from '@/constants/theme';
import { useAuth } from '@/context/auth-context';
import { getErrorMessage } from '@/lib/errors';
import { getSessionScorecard, type SessionScorecard } from '@/lib/session-scorecard';

function formatDuration(minutes: number | null): string {
  if (minutes === null) return '--';
  if (minutes < 1) return '<1m';
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return remainder > 0 ? `${hours}h ${remainder}m` : `${hours}h`;
}

function formatWeight(value: number): string {
  return Math.round(value).toLocaleString();
}

/**
 * The celebratory screen shown right after Mark Workout Complete --
 * computed fresh from workout_logs every time it's opened (nothing about
 * "a scorecard was shown" is stored), so it's never out of date and it's
 * harmless if this route is ever revisited directly. Reopening the same
 * assignment later from Training/Calendar still shows the ordinary
 * read-only /assigned/[id] view, exactly as before this chunk -- this is
 * a one-time landing screen right after finishing, not the permanent
 * detail view for a completed session.
 */
export default function SessionCompleteScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { session } = useAuth();
  const clientId = session?.user.id;

  const [scorecard, setScorecard] = useState<SessionScorecard | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id || !clientId) return;
    let cancelled = false;
    getSessionScorecard(id, clientId)
      .then((data) => {
        if (!cancelled) setScorecard(data);
      })
      .catch((err) => {
        if (!cancelled) setError(getErrorMessage(err, 'Failed to load your session summary.'));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [id, clientId]);

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <ScrollView contentContainerStyle={styles.scrollContent}>
          {loading && <ActivityIndicator style={styles.loader} />}
          {!loading && error && <ThemedText style={styles.error}>{error}</ThemedText>}

          {!loading && scorecard && (
            <>
              <View style={styles.badge}>
                <ThemedText type="smallBold" themeColor="tealBright" style={styles.badgeText}>
                  SESSION COMPLETE
                </ThemedText>
              </View>

              <ThemedText type="title" style={styles.workoutName}>
                {scorecard.workoutName}
              </ThemedText>
              <ThemedText themeColor="textSecondary" style={styles.date}>
                {scorecard.assignedDate}
              </ThemedText>

              {scorecard.pbs.length > 0 ? (
                <View style={styles.pbSection}>
                  {scorecard.pbs.map((pb) => (
                    <ThemedView key={pb.exerciseLibraryId} type="backgroundElement" style={styles.pbCard}>
                      <ThemedText type="smallBold" themeColor="tealBright" style={styles.pbTag}>
                        NEW PB
                      </ThemedText>
                      <ThemedText type="smallBold">{pb.exerciseName}</ThemedText>
                      <ThemedText type="title" style={styles.pbWeight}>
                        {formatWeight(pb.newWeight)}kg
                      </ThemedText>
                      <ThemedText type="small" themeColor="textSecondary">
                        Up from {formatWeight(pb.previousWeight)}kg
                      </ThemedText>
                    </ThemedView>
                  ))}
                </View>
              ) : (
                <ThemedText themeColor="textSecondary" style={styles.noPbNote}>
                  No new PBs this session -- keep pushing.
                </ThemedText>
              )}

              <View style={styles.heroRow}>
                <StatRing value={`${formatWeight(scorecard.totalWeightLifted)}kg`} label="Total Weight Lifted" size={190} />
              </View>

              <View style={styles.supportingRow}>
                <StatRing value={formatDuration(scorecard.durationMinutes)} label="Duration" size={130} />
                <StatRing
                  value={scorecard.sessionRpe !== null ? `${scorecard.sessionRpe}/10` : '--'}
                  label="Session RPE"
                  // 0 (an empty ring), not omitted -- this stat DOES have
                  // a real 0-10 cap, so "not rated" should read as
                  // honestly empty, never as a fully-filled "maxed out"
                  // ring implying a rating that was never actually given.
                  progress={scorecard.sessionRpe !== null ? scorecard.sessionRpe / 10 : 0}
                  size={130}
                />
              </View>

              <Pressable
                style={({ pressed }) => [styles.doneButton, pressed && styles.pressed]}
                onPress={() => router.replace('/client/training')}>
                <ThemedText type="smallBold" style={styles.doneButtonText}>
                  Done
                </ThemedText>
              </Pressable>
            </>
          )}
        </ScrollView>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  safeArea: { flex: 1 },
  scrollContent: {
    padding: Spacing.four,
    alignItems: 'center',
    gap: Spacing.three,
  },
  loader: {
    marginTop: Spacing.five,
  },
  error: {
    color: Accent,
    textAlign: 'center',
    marginTop: Spacing.five,
  },
  badge: {
    borderWidth: 1,
    borderColor: Colors.tealBright,
    borderRadius: 999,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.one,
    marginTop: Spacing.two,
  },
  badgeText: {
    letterSpacing: 1,
  },
  workoutName: {
    textAlign: 'center',
  },
  date: {
    marginBottom: Spacing.one,
  },
  pbSection: {
    width: '100%',
    gap: Spacing.two,
  },
  pbCard: {
    ...Glow.teal,
    borderRadius: Spacing.three,
    padding: Spacing.three,
    borderWidth: 1,
    borderColor: Colors.tealBright,
    gap: Spacing.half,
  },
  pbTag: {
    letterSpacing: 1,
  },
  pbWeight: {
    marginTop: Spacing.half,
  },
  noPbNote: {
    textAlign: 'center',
  },
  heroRow: {
    marginTop: Spacing.two,
  },
  supportingRow: {
    flexDirection: 'row',
    gap: Spacing.five,
    marginTop: Spacing.two,
  },
  doneButton: {
    ...Glow.oxblood,
    backgroundColor: Accent,
    borderRadius: Spacing.two,
    paddingVertical: Spacing.three,
    paddingHorizontal: Spacing.six,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: Spacing.four,
    width: '100%',
  },
  pressed: {
    opacity: 0.85,
  },
  doneButtonText: {
    color: Colors.text,
  },
});
