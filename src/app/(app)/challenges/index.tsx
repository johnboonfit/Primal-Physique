import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Accent, Colors, Glow, Spacing } from '@/constants/theme';
import { useAuth } from '@/context/auth-context';
import {
  joinChallenge,
  leaveChallenge,
  listClientChallenges,
  listCoachChallenges,
  type ChallengeType,
  type ClientChallenge,
  type CoachChallenge,
} from '@/lib/challenges';

const TYPE_LABEL: Record<ChallengeType, string> = { volume: 'Volume', consistency: 'Consistency' };

function formatDate(iso: string) {
  return new Date(`${iso}T00:00:00.000Z`).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function isUpcoming(startDate: string) {
  return startDate > new Date().toISOString().slice(0, 10);
}

/**
 * Shared by both audiences, same as community/index.tsx: a coach sees
 * every challenge they've created with a participant count and a "+
 * New" link into challenges/new.tsx; a client sees active/upcoming
 * challenges they're eligible for (open-to-all ones, plus anything
 * they're specifically listed for — enforced by challenges.sql's own
 * RLS, not just this screen's query) with a genuine Join/Leave button,
 * never auto-enrolled.
 */
export default function ChallengesScreen() {
  const { session, profile } = useAuth();
  const isCoach = profile?.role === 'coach';

  const [coachChallenges, setCoachChallenges] = useState<CoachChallenge[]>([]);
  const [clientChallenges, setClientChallenges] = useState<ClientChallenge[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [joiningId, setJoiningId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const load = useCallback(() => {
    if (!session) return;
    setLoading(true);
    setError(null);
    const request = isCoach
      ? listCoachChallenges(session.user.id).then(setCoachChallenges)
      : listClientChallenges(session.user.id).then(setClientChallenges);
    request
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load challenges.'))
      .finally(() => setLoading(false));
  }, [session, isCoach]);

  useFocusEffect(load);

  const handleJoin = async (challengeId: string) => {
    if (!session) return;
    setActionError(null);
    setJoiningId(challengeId);
    try {
      await joinChallenge(challengeId, session.user.id);
      setClientChallenges((current) => current.map((c) => (c.id === challengeId ? { ...c, joined: true } : c)));
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to join that challenge.');
    } finally {
      setJoiningId(null);
    }
  };

  const handleLeave = async (challengeId: string) => {
    if (!session) return;
    setActionError(null);
    setJoiningId(challengeId);
    try {
      await leaveChallenge(challengeId, session.user.id);
      setClientChallenges((current) => current.map((c) => (c.id === challengeId ? { ...c, joined: false } : c)));
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to leave that challenge.');
    } finally {
      setJoiningId(null);
    }
  };

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.header}>
          <ThemedText type="title">Challenges</ThemedText>
          {isCoach && (
            <Pressable style={styles.newButton} onPress={() => router.push('/challenges/new')}>
              <ThemedText type="smallBold" style={styles.newButtonText}>
                + New
              </ThemedText>
            </Pressable>
          )}
        </View>

        {loading && <ActivityIndicator style={styles.loader} />}
        {!loading && error && <ThemedText style={styles.error}>{error}</ThemedText>}
        {!loading && actionError && <ThemedText style={styles.error}>{actionError}</ThemedText>}

        {!loading && !error && isCoach && coachChallenges.length === 0 && (
          <ThemedText themeColor="textSecondary" style={styles.empty}>
            No challenges yet — tap + New to create one.
          </ThemedText>
        )}
        {!loading && !error && !isCoach && clientChallenges.length === 0 && (
          <ThemedText themeColor="textSecondary" style={styles.empty}>
            Nothing open to join right now — check back soon.
          </ThemedText>
        )}

        {!loading && !error && (
          <ScrollView contentContainerStyle={styles.list}>
            {isCoach &&
              coachChallenges.map((challenge) => (
                <ThemedView key={challenge.id} type="backgroundElement" style={styles.card}>
                  <View style={styles.cardHeaderRow}>
                    <ThemedText type="smallBold" style={styles.cardName}>
                      {challenge.name}
                    </ThemedText>
                    <ThemedText type="small" style={styles.typeBadge}>
                      {TYPE_LABEL[challenge.type]}
                    </ThemedText>
                  </View>
                  <ThemedText type="small" themeColor="textSecondary">
                    {formatDate(challenge.startDate)} – {formatDate(challenge.endDate)} ·{' '}
                    {challenge.openToAll ? 'All clients' : 'Specific clients'}
                  </ThemedText>
                  <ThemedText type="small" themeColor="textSecondary">
                    {challenge.participantCount} joined
                  </ThemedText>
                </ThemedView>
              ))}

            {!isCoach &&
              clientChallenges.map((challenge) => (
                <ThemedView key={challenge.id} type="backgroundElement" style={styles.card}>
                  <View style={styles.cardHeaderRow}>
                    <ThemedText type="smallBold" style={styles.cardName}>
                      {challenge.name}
                    </ThemedText>
                    <ThemedText type="small" style={styles.typeBadge}>
                      {TYPE_LABEL[challenge.type]}
                    </ThemedText>
                  </View>
                  <ThemedText type="small" themeColor="textSecondary">
                    {isUpcoming(challenge.startDate) ? 'Starts' : 'Ends'}{' '}
                    {formatDate(isUpcoming(challenge.startDate) ? challenge.startDate : challenge.endDate)}
                  </ThemedText>
                  <Pressable
                    style={[styles.joinButton, challenge.joined && styles.leaveButton]}
                    disabled={joiningId === challenge.id}
                    onPress={() => (challenge.joined ? handleLeave(challenge.id) : handleJoin(challenge.id))}>
                    {joiningId === challenge.id ? (
                      <ActivityIndicator size="small" color={challenge.joined ? Colors.textSecondary : Colors.text} />
                    ) : (
                      <ThemedText type="smallBold" style={challenge.joined ? styles.leaveButtonText : styles.joinButtonText}>
                        {challenge.joined ? 'Leave' : 'Join'}
                      </ThemedText>
                    )}
                  </Pressable>
                </ThemedView>
              ))}
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
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.three,
  },
  newButton: {
    ...Glow.oxblood,
    backgroundColor: Accent,
    borderRadius: Spacing.two,
    paddingVertical: Spacing.one,
    paddingHorizontal: Spacing.three,
  },
  newButtonText: {
    color: Colors.text,
  },
  loader: {
    marginTop: Spacing.five,
  },
  error: {
    color: Accent,
    textAlign: 'center',
    marginBottom: Spacing.two,
  },
  empty: {
    textAlign: 'center',
    marginTop: Spacing.five,
  },
  list: {
    gap: Spacing.two,
    paddingBottom: Spacing.four,
  },
  card: {
    borderRadius: Spacing.two,
    padding: Spacing.three,
    gap: Spacing.half,
  },
  cardHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: Spacing.two,
  },
  cardName: {
    flex: 1,
  },
  typeBadge: {
    color: Colors.tealBright,
  },
  joinButton: {
    marginTop: Spacing.two,
    alignSelf: 'flex-start',
    ...Glow.oxblood,
    backgroundColor: Accent,
    borderRadius: Spacing.two,
    paddingVertical: Spacing.one,
    paddingHorizontal: Spacing.four,
  },
  joinButtonText: {
    color: Colors.text,
  },
  leaveButton: {
    backgroundColor: Colors.backgroundSelected,
  },
  leaveButtonText: {
    color: Colors.textSecondary,
  },
});
