import { Redirect, router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Accent, Colors, Glow, Spacing } from '@/constants/theme';
import { useAuth } from '@/context/auth-context';
import { getClientActivityFeed, subscribeToClientActivity, type ClientActivityEvent } from '@/lib/coach-dashboard';
import { complianceColor } from '@/lib/compliance';
import { getErrorMessage } from '@/lib/errors';

const FEED_LIMIT = 30;

function formatRelativeTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(diffMs / 60000);
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function eventDescription(event: ClientActivityEvent): string {
  if (event.kind === 'meal') {
    const macros = event.protein !== null ? `${Math.round(event.calories)} cal · ${Math.round(event.protein)}g protein` : `${Math.round(event.calories)} cal`;
    return `logged ${event.meal} — ${macros}`;
  }
  if (event.kind === 'habit') {
    return `completed "${event.habitName}"`;
  }
  const parts = [`completed ${event.workoutName}`];
  if (event.durationMinutes !== null) parts.push(`${event.durationMinutes}min`);
  if (event.totalWeightLifted > 0) parts.push(`${(event.totalWeightLifted / 1000).toFixed(1)}t lifted`);
  if (event.sessionRpe !== null) parts.push(`RPE ${event.sessionRpe}/10`);
  return parts.join(' · ');
}

function dotStyle(kind: ClientActivityEvent['kind']) {
  if (kind === 'workout') return styles.dotWorkout;
  if (kind === 'habit') return styles.dotHabit;
  return styles.dotMeal;
}

function EventRow({ event }: { event: ClientActivityEvent }) {
  return (
    <View style={styles.eventCardWrap}>
      <ThemedView type="backgroundElement" style={styles.eventCard}>
        <View style={styles.eventHeader}>
          <View style={styles.eventHeaderLeft}>
            <View style={[styles.dot, dotStyle(event.kind)]} />
            <ThemedText type="smallBold">{event.clientName}</ThemedText>
          </View>
          <ThemedText type="small" themeColor="textSecondary">
            {formatRelativeTime(event.at)}
          </ThemedText>
        </View>

        <ThemedText type="small" style={styles.eventDescription}>
          {eventDescription(event)}
        </ThemedText>

        <View style={styles.scoresRow}>
          <ThemedText type="small" themeColor="textSecondary">
            Momentum {event.momentumScore !== null ? event.momentumScore.toFixed(1) : '--'}
          </ThemedText>
          <ThemedText
            type="small"
            style={event.complianceScore !== null ? { color: complianceColor(event.complianceScore) } : undefined}
            themeColor={event.complianceScore === null ? 'textSecondary' : undefined}>
            Compliance {event.complianceScore !== null ? `${event.complianceScore}%` : '--'}
          </ThemedText>
        </View>
      </ThemedView>
    </View>
  );
}

/**
 * The coach's real-time, cross-client activity feed — every logged meal,
 * completed habit, and completed workout, across every client, in one
 * chronological stream (see getClientActivityFeed() in coach-dashboard.ts
 * for exactly how the three are merged, and subscribeToClientActivity()
 * for how new events arrive live without a manual refresh).
 */
export default function ActivityScreen() {
  const { profile, loadingProfile } = useAuth();

  const [events, setEvents] = useState<ClientActivityEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback((showSpinner: boolean) => {
    if (showSpinner) setLoading(true);
    setError(null);
    getClientActivityFeed(FEED_LIMIT)
      .then(setEvents)
      .catch((err) => setError(getErrorMessage(err, 'Failed to load the activity feed.')))
      .finally(() => {
        setLoading(false);
        setRefreshing(false);
      });
  }, []);

  useFocusEffect(
    useCallback(() => {
      if (!profile || profile.role !== 'coach') return;

      load(true);
      const unsubscribe = subscribeToClientActivity(() => load(false));
      return unsubscribe;
    }, [profile, load])
  );

  if (!loadingProfile && profile?.role === 'client') {
    return <Redirect href="/client" />;
  }

  const handleRefresh = () => {
    setRefreshing(true);
    load(false);
  };

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} style={styles.backButton}>
            <ThemedText type="linkPrimary">Back</ThemedText>
          </Pressable>
          <ThemedText type="title" style={styles.title}>
            Client Activity
          </ThemedText>
        </View>

        {loading && <ActivityIndicator style={styles.loader} />}
        {!loading && error && <ThemedText style={styles.error}>{error}</ThemedText>}

        {!loading && !error && (
          <ScrollView
            contentContainerStyle={styles.scrollContent}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={Colors.textSecondary} />}>
            {events.length === 0 ? (
              <ThemedText themeColor="textSecondary" style={styles.emptyText}>
                Nothing logged yet.
              </ThemedText>
            ) : (
              events.map((event, index) => <EventRow key={`${event.kind}-${event.clientId}-${event.at}-${index}`} event={event} />)
            )}
          </ScrollView>
        )}
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  safeArea: { flex: 1, paddingHorizontal: Spacing.four, paddingTop: Spacing.four },
  header: {
    marginBottom: Spacing.two,
  },
  backButton: {
    marginBottom: Spacing.two,
  },
  title: {
    fontSize: 26,
    lineHeight: 32,
  },
  loader: {
    marginTop: Spacing.five,
  },
  error: {
    color: Accent,
    textAlign: 'center',
    marginTop: Spacing.five,
  },
  scrollContent: {
    gap: Spacing.two,
    paddingBottom: Spacing.six,
  },
  emptyText: {
    textAlign: 'center',
    marginTop: Spacing.five,
  },
  eventCardWrap: {
    ...Glow.teal,
  },
  eventCard: {
    borderRadius: Spacing.two,
    padding: Spacing.three,
    gap: Spacing.one,
  },
  eventHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  eventHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: Colors.tealBright,
  },
  dotMeal: {
    backgroundColor: Colors.tealBright,
  },
  dotWorkout: {
    backgroundColor: Colors.tealDeepLight,
  },
  dotHabit: {
    backgroundColor: Colors.textSecondary,
  },
  eventDescription: {
    color: Colors.text,
  },
  scoresRow: {
    flexDirection: 'row',
    gap: Spacing.three,
    marginTop: Spacing.half,
  },
});
