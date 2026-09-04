import { Redirect, router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { StatTile } from '@/components/stat-tile';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Accent, Colors, Glow, Spacing } from '@/constants/theme';
import { useAuth } from '@/context/auth-context';
import { complianceColor } from '@/lib/compliance';
import {
  getClientsNeedingAttention,
  getCoachDashboardStats,
  getRecentClientActivity,
  type ActivityEvent,
  type ClientAttention,
  type CoachDashboardStats,
} from '@/lib/coach-dashboard';
import { getErrorMessage } from '@/lib/errors';

function greeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}

function todayLabel(): string {
  return new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });
}

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

function NavCard({ title, subtitle, href }: { title: string; subtitle: string; href: string }) {
  return (
    <Pressable style={({ pressed }) => [styles.navCard, pressed && styles.pressed]} onPress={() => router.push(href as never)}>
      <ThemedView type="backgroundElement" style={styles.navCardInner}>
        <ThemedText type="smallBold">{title}</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          {subtitle}
        </ThemedText>
      </ThemedView>
    </Pressable>
  );
}

function SectionLabel({ children }: { children: string }) {
  return (
    <ThemedText type="smallBold" style={styles.sectionLabel}>
      {children}
    </ThemedText>
  );
}

function ActivityRow({ event, isLast }: { event: ActivityEvent; isLast: boolean }) {
  const description =
    event.kind === 'meal'
      ? `logged ${event.meal} (${event.calories} cal)`
      : `completed ${event.workoutName}`;

  return (
    <View style={[styles.activityRow, isLast && styles.rowNoBorder]}>
      <View style={[styles.activityDot, event.kind === 'workout' && styles.activityDotWorkout]} />
      <View style={styles.activityTextGroup}>
        <ThemedText type="small">
          <ThemedText type="smallBold">{event.clientName}</ThemedText> {description}
        </ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          {formatRelativeTime(event.at)}
        </ThemedText>
      </View>
    </View>
  );
}

/**
 * The coach's home screen — a real dashboard built entirely from data
 * this app already has (client roster, Compliance Score, logged meals
 * and completed workouts, community reports), not a generic template
 * with placeholder widgets. Notably absent: a revenue card and an
 * appointments/calendar card, both staples of an off-the-shelf coaching
 * dashboard — this app has no billing or session-booking feature to
 * back either one honestly, so neither is faked here.
 */
export default function HomeScreen() {
  const { session, profile, loadingProfile, signOut } = useAuth();

  const [stats, setStats] = useState<CoachDashboardStats | null>(null);
  const [attention, setAttention] = useState<ClientAttention[]>([]);
  const [activity, setActivity] = useState<ActivityEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      if (!profile || profile.role !== 'coach') return;
      let cancelled = false;

      setLoading(true);
      setError(null);
      Promise.all([getCoachDashboardStats(), getClientsNeedingAttention(), getRecentClientActivity(8)])
        .then(([statsResult, attentionResult, activityResult]) => {
          if (cancelled) return;
          setStats(statsResult);
          setAttention(attentionResult);
          setActivity(activityResult);
        })
        .catch((err) => {
          if (!cancelled) setError(getErrorMessage(err, 'Failed to load your dashboard.'));
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });

      return () => {
        cancelled = true;
      };
    }, [profile])
  );

  if (!loadingProfile && profile?.role === 'client') {
    return <Redirect href="/client" />;
  }

  const firstName = (profile?.full_name || session?.user.email || 'Coach').split(' ')[0].split('@')[0];

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <ScrollView contentContainerStyle={styles.scrollContent}>
          <View style={styles.header}>
            <View>
              <ThemedText type="title" style={styles.greeting}>
                {greeting()}, {firstName}
              </ThemedText>
              <ThemedText themeColor="textSecondary">{todayLabel()}</ThemedText>
            </View>
          </View>

          {loading && <ActivityIndicator style={styles.loader} />}
          {!loading && error && <ThemedText style={styles.error}>{error}</ThemedText>}

          {!loading && !error && stats && (
            <>
              <View style={styles.statGrid}>
                <StatTile
                  value={String(stats.activeClients)}
                  label="Active Clients"
                  onPress={() => router.push('/clients')}
                  style={styles.statTileHalf}
                />
                <StatTile
                  value={stats.avgCompliance !== null ? `${stats.avgCompliance}%` : '--'}
                  label="Avg Compliance"
                  color={stats.avgCompliance !== null ? complianceColor(stats.avgCompliance) : undefined}
                  onPress={() => router.push('/clients')}
                  style={styles.statTileHalf}
                />
                <StatTile
                  value={String(stats.overdueCheckIns)}
                  label="Overdue Check-ins"
                  color={stats.overdueCheckIns > 0 ? Accent : undefined}
                  style={styles.statTileHalf}
                />
                <StatTile
                  value={String(stats.openReports)}
                  label="Open Reports"
                  color={stats.openReports > 0 ? Accent : undefined}
                  style={styles.statTileHalf}
                  onPress={() => router.push('/community/moderation' as never)}
                />
              </View>

              {stats.activeClients > 0 && (
                <>
                  <SectionLabel>Needs Attention</SectionLabel>
                  {attention.length === 0 ? (
                    <ThemedText themeColor="textSecondary" style={styles.allGoodText}>
                      Every client is above 50% compliance — nice work.
                    </ThemedText>
                  ) : (
                    <ThemedView type="backgroundElement" style={styles.attentionCard}>
                      {attention.map((client, index) => (
                        <Pressable
                          key={client.clientId}
                          style={[styles.attentionRow, index === attention.length - 1 && styles.rowNoBorder]}
                          onPress={() => router.push(`/clients/${client.clientId}`)}>
                          <ThemedText type="smallBold">{client.name}</ThemedText>
                          <ThemedText type="smallBold" style={{ color: Accent }}>
                            {client.complianceScore}%
                          </ThemedText>
                        </Pressable>
                      ))}
                    </ThemedView>
                  )}
                </>
              )}

              <SectionLabel>Manage</SectionLabel>
              <View style={styles.navGrid}>
                <NavCard title="Clients" subtitle="Roster & tiers" href="/clients" />
                <NavCard title="Messages" subtitle="Client conversations" href="/messages" />
                <NavCard title="Assignments" subtitle="Assign & review" href="/assignments" />
                <NavCard title="Community" subtitle="Feed & moderation" href="/community" />
                <NavCard title="Check-in Forms" subtitle="Schedules & templates" href="/forms" />
              </View>

              <View style={styles.activityHeaderRow}>
                <SectionLabel>Recent Activity</SectionLabel>
                <Pressable onPress={() => router.push('/activity' as never)}>
                  <ThemedText type="linkPrimary">View all →</ThemedText>
                </Pressable>
              </View>
              {activity.length === 0 ? (
                <ThemedText themeColor="textSecondary" style={styles.allGoodText}>
                  Nothing logged yet.
                </ThemedText>
              ) : (
                <ThemedView type="backgroundElement" style={styles.activityCard}>
                  {activity.map((event, index) => (
                    <ActivityRow key={`${event.kind}-${event.at}-${index}`} event={event} isLast={index === activity.length - 1} />
                  ))}
                </ThemedView>
              )}

              <SectionLabel>Coaching Hub</SectionLabel>
              <View style={styles.navGrid}>
                <NavCard title="Programmes" subtitle="Template library" href="/programmes" />
                <NavCard title="Workouts" subtitle="Workout templates" href="/workouts" />
                <NavCard title="Exercise Library" subtitle="Muscle groups & cues" href="/exercise-library" />
                <NavCard title="Habits" subtitle="Assigned habits" href="/habits" />
                <NavCard title="Recipes" subtitle="Recipe builder" href="/recipes" />
                <NavCard title="Meal Plans" subtitle="Plan templates" href="/meal-plans" />
              </View>
            </>
          )}

          <Pressable style={({ pressed }) => [styles.signOutButton, pressed && styles.pressed]} onPress={signOut}>
            <ThemedText type="smallBold" style={styles.signOutText}>
              Sign out
            </ThemedText>
          </Pressable>
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
    gap: Spacing.three,
    paddingBottom: Spacing.six,
  },
  header: {
    marginBottom: Spacing.one,
  },
  greeting: {
    fontSize: 30,
    lineHeight: 36,
  },
  loader: {
    marginTop: Spacing.five,
  },
  error: {
    color: Accent,
    textAlign: 'center',
    marginTop: Spacing.five,
  },
  statGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  statTileHalf: {
    width: '48%',
  },
  pressed: {
    opacity: 0.85,
  },
  sectionLabel: {
    marginTop: Spacing.two,
  },
  allGoodText: {
    marginTop: -Spacing.one,
  },
  activityHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  attentionCard: {
    borderRadius: Spacing.two,
    ...Glow.oxblood,
  },
  attentionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    borderBottomWidth: 1,
    borderBottomColor: Colors.backgroundSelected,
  },
  rowNoBorder: {
    borderBottomWidth: 0,
  },
  navGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  navCard: {
    width: '48%',
  },
  navCardInner: {
    borderRadius: Spacing.two,
    padding: Spacing.three,
    gap: Spacing.half,
  },
  activityCard: {
    borderRadius: Spacing.two,
  },
  activityRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.two,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    borderBottomWidth: 1,
    borderBottomColor: Colors.backgroundSelected,
  },
  activityDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginTop: 6,
    backgroundColor: Colors.tealBright,
  },
  activityDotWorkout: {
    backgroundColor: Colors.tealDeepLight,
  },
  activityTextGroup: {
    flex: 1,
    gap: Spacing.half,
  },
  signOutButton: {
    borderRadius: Spacing.two,
    paddingVertical: Spacing.three,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: Accent,
    marginTop: Spacing.three,
  },
  signOutText: {
    color: Accent,
  },
});
