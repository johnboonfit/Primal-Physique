import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Accent, Colors, Glow, Spacing } from '@/constants/theme';
import { useAuth } from '@/context/auth-context';
import {
  formatChallengeProgress,
  getChallengeLeaderboard,
  isChallengeLocked,
  subscribeToChallengeProgress,
  type ChallengeProgressEntry,
} from '@/lib/challenge-progress';
import {
  getChallengeDetail,
  getMyChallengeParticipation,
  joinChallenge,
  leaveChallenge,
  type ChallengeDetail,
  type ChallengeType,
} from '@/lib/challenges';

const TYPE_LABEL: Record<ChallengeType, string> = { volume: 'Volume', consistency: 'Consistency' };

function initial(name: string) {
  return name.trim().charAt(0).toUpperCase() || '?';
}

function formatDate(iso: string) {
  return new Date(`${iso}T00:00:00.000Z`).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

/**
 * One challenge's detail + live leaderboard, shared by both audiences —
 * a coach sees it for oversight (they already own it, per
 * owns_challenge()), a client sees it if they can see the challenge
 * exists at all (open to all, or specifically listed — the same
 * is_eligible_for_challenge() check get_challenge_leaderboard() itself
 * re-checks server-side, so this screen never shows anything the
 * database wouldn't actually hand back). A client not yet joined still
 * sees standings and a Join button right here, not just from the list.
 */
export default function ChallengeDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { session, profile } = useAuth();
  const isCoach = profile?.role === 'coach';

  const [challenge, setChallenge] = useState<ChallengeDetail | null>(null);
  const [joined, setJoined] = useState(false);
  const [entries, setEntries] = useState<ChallengeProgressEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [joining, setJoining] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const loadLeaderboard = useCallback(() => {
    if (!id) return;
    getChallengeLeaderboard(id)
      .then(setEntries)
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load the leaderboard.'));
  }, [id]);

  useFocusEffect(
    useCallback(() => {
      if (!id || !session) return;
      let cancelled = false;
      setLoading(true);
      setError(null);

      const requests: Promise<unknown>[] = [
        getChallengeDetail(id).then((detail) => {
          if (!cancelled) setChallenge(detail);
        }),
        getChallengeLeaderboard(id).then((rows) => {
          if (!cancelled) setEntries(rows);
        }),
      ];
      if (!isCoach) {
        requests.push(
          getMyChallengeParticipation(id, session.user.id).then((value) => {
            if (!cancelled) setJoined(value);
          })
        );
      }

      Promise.all(requests)
        .catch((err) => {
          if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load that challenge.');
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });

      const unsubscribe = subscribeToChallengeProgress(loadLeaderboard);

      return () => {
        cancelled = true;
        unsubscribe();
      };
    }, [id, session, isCoach, loadLeaderboard])
  );

  const handleJoin = async () => {
    if (!id || !session) return;
    setActionError(null);
    setJoining(true);
    try {
      await joinChallenge(id, session.user.id);
      setJoined(true);
      loadLeaderboard();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to join that challenge.');
    } finally {
      setJoining(false);
    }
  };

  const handleLeave = async () => {
    if (!id || !session) return;
    setActionError(null);
    setJoining(true);
    try {
      await leaveChallenge(id, session.user.id);
      setJoined(false);
      loadLeaderboard();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to leave that challenge.');
    } finally {
      setJoining(false);
    }
  };

  if (loading) {
    return (
      <ThemedView style={styles.container}>
        <SafeAreaView style={styles.safeArea}>
          <ActivityIndicator style={styles.loader} />
        </SafeAreaView>
      </ThemedView>
    );
  }

  if (error || !challenge) {
    return (
      <ThemedView style={styles.container}>
        <SafeAreaView style={styles.safeArea}>
          <ThemedText style={styles.error}>{error ?? 'That challenge could not be found.'}</ThemedText>
        </SafeAreaView>
      </ThemedView>
    );
  }

  const locked = isChallengeLocked(challenge.endDate);

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} hitSlop={8}>
            <ThemedText type="linkPrimary">‹ Back</ThemedText>
          </Pressable>
        </View>

        <ScrollView contentContainerStyle={styles.scrollContent}>
          <ThemedText type="title" style={styles.name}>
            {challenge.name}
          </ThemedText>
          <View style={styles.metaRow}>
            <ThemedText type="small" style={styles.typeBadge}>
              {TYPE_LABEL[challenge.type]}
            </ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              {formatDate(challenge.startDate)} – {formatDate(challenge.endDate)}
            </ThemedText>
          </View>
          {isCoach && (
            <ThemedText type="small" themeColor="textSecondary" style={styles.audience}>
              {challenge.openToAll ? 'Open to all clients' : 'Specific clients'}
            </ThemedText>
          )}

          {!isCoach && (
            <Pressable
              style={[styles.joinButton, joined && styles.leaveButton]}
              disabled={joining || locked}
              onPress={joined ? handleLeave : handleJoin}>
              {joining ? (
                <ActivityIndicator size="small" color={joined ? Colors.textSecondary : Colors.text} />
              ) : (
                <ThemedText type="smallBold" style={joined ? styles.leaveButtonText : styles.joinButtonText}>
                  {locked ? (joined ? 'Joined' : 'Ended') : joined ? 'Leave' : 'Join'}
                </ThemedText>
              )}
            </Pressable>
          )}
          {actionError && <ThemedText style={styles.error}>{actionError}</ThemedText>}

          <View style={styles.standingsHeader}>
            <ThemedText type="smallBold">{locked ? '🏆 Final Standings' : 'Live Standings'}</ThemedText>
            {!locked && (
              <ThemedText type="small" themeColor="textSecondary">
                Updates live
              </ThemedText>
            )}
          </View>

          {entries.length === 0 && (
            <ThemedText themeColor="textSecondary" style={styles.empty}>
              No one has joined yet.
            </ThemedText>
          )}

          {entries.map((entry, index) => {
            const isSelf = entry.clientId === session?.user.id;
            const isWinner = locked && index === 0;
            return (
              <ThemedView
                key={entry.clientId}
                type="backgroundElement"
                style={[styles.row, isSelf && styles.rowSelf, isWinner && styles.rowWinner]}>
                {isWinner ? (
                  <ThemedText type="smallBold" style={styles.trophy}>
                    🏆
                  </ThemedText>
                ) : (
                  <ThemedText type="smallBold" style={styles.position}>
                    #{index + 1}
                  </ThemedText>
                )}
                <View style={styles.avatar}>
                  <ThemedText type="smallBold" style={styles.avatarText}>
                    {initial(entry.name)}
                  </ThemedText>
                </View>
                <ThemedText type="smallBold" style={styles.name2}>
                  {entry.name}
                  {isSelf ? ' (you)' : ''}
                </ThemedText>
                <ThemedText type="smallBold" style={[styles.progress, isWinner && styles.progressWinner]}>
                  {formatChallengeProgress(challenge.type, entry.progress)}
                </ThemedText>
              </ThemedView>
            );
          })}
        </ScrollView>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  safeArea: { flex: 1, paddingHorizontal: Spacing.four },
  header: {
    paddingTop: Spacing.two,
    paddingBottom: Spacing.two,
  },
  scrollContent: {
    paddingBottom: Spacing.six,
  },
  loader: {
    marginTop: Spacing.six,
  },
  error: {
    color: Accent,
    marginTop: Spacing.two,
  },
  name: {
    marginBottom: Spacing.one,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
  },
  typeBadge: {
    color: Colors.tealBright,
  },
  audience: {
    marginTop: Spacing.half,
  },
  joinButton: {
    marginTop: Spacing.three,
    alignSelf: 'flex-start',
    ...Glow.oxblood,
    backgroundColor: Accent,
    borderRadius: Spacing.two,
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.five,
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
  standingsHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: Spacing.five,
    marginBottom: Spacing.two,
  },
  empty: {
    textAlign: 'center',
    marginTop: Spacing.four,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: Spacing.two,
    padding: Spacing.three,
    gap: Spacing.three,
    marginBottom: Spacing.two,
  },
  rowSelf: {
    borderWidth: 1,
    borderColor: Accent,
  },
  rowWinner: {
    ...Glow.teal,
    borderWidth: 1,
    borderColor: Colors.tealBright,
  },
  trophy: {
    width: 32,
    textAlign: 'center',
  },
  position: {
    width: 32,
    color: Colors.textSecondary,
  },
  avatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: Colors.tealDeep,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    color: Colors.text,
  },
  name2: {
    flex: 1,
  },
  progress: {
    color: Colors.tealBright,
  },
  progressWinner: {
    color: Colors.tealBright,
  },
});
