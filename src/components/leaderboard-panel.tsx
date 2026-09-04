import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';

import { FeatureLockedCard } from '@/components/feature-locked-card';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Accent, Colors, Spacing } from '@/constants/theme';
import { useAuth } from '@/context/auth-context';
import { isFeatureEnabled } from '@/lib/feature-toggles';
import {
  getLifetimeLeaderboard,
  getMyTier,
  getWeeklyLeaderboard,
  tierHasLeaderboardAccess,
  type ClientTier,
  type LeaderboardEntry,
} from '@/lib/leaderboard';

type LeaderboardView = 'weekly' | 'lifetime';

function initial(name: string) {
  return name.trim().charAt(0).toUpperCase() || '?';
}

/** Coach-facing tier-perk description, shown on the upsell state — kept
 * in plain language rather than naming the exact price, since that's
 * the kind of detail that drifts out of sync with real pricing. */
const UPGRADE_MESSAGE = 'Leaderboards is an Accelerator and Precision perk. Ask your coach about upgrading to unlock it.';
const TOGGLED_OFF_MESSAGE = 'Your coach has turned off Leaderboards access for your account.';

/**
 * Position, name, an initials avatar (no real photo-upload avatar
 * feature exists yet — this is a lightweight placeholder, not a
 * finished profile-picture system), and XP. Weekly is the primary view
 * (this current Monday–Sunday week, same boundaries Momentum Score
 * uses); Lifetime is a secondary toggle underneath.
 *
 * A coach always sees the real thing — tiers are a client-only concept.
 * A client's own tier gates this the same way the Announcement
 * restriction and Block gate posting: this component's check is a
 * courtesy (skip a pointless request, show a plain explanation instead
 * of an empty list), the real wall is that get_weekly_xp_leaderboard/
 * get_lifetime_xp_leaderboard are only useful once you're actually
 * looking at them — there's no separate database-level gate on reading
 * a leaderboard, since unlike Community's post/report tables this
 * doesn't expose anything a client couldn't already piece together from
 * Momentum Score and the Clients list being coach-only.
 */
export function LeaderboardPanel() {
  const { session, profile } = useAuth();
  const isCoach = profile?.role === 'coach';

  const [tier, setTier] = useState<ClientTier | null>(null);
  const [tierLoading, setTierLoading] = useState(!isCoach);
  const [tierError, setTierError] = useState<string | null>(null);

  // A coach-controlled override, independent of tier — see
  // feature-toggles.ts. Defaults to true (full access) while still
  // loading rather than flashing the locked state for a moment first.
  const [featureEnabled, setFeatureEnabled] = useState(true);

  const [view, setView] = useState<LeaderboardView>('weekly');
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const hasAccess = isCoach || (tier !== null && tierHasLeaderboardAccess(tier) && featureEnabled);

  useFocusEffect(
    useCallback(() => {
      if (isCoach || !session) return;
      let cancelled = false;

      setTierLoading(true);
      Promise.all([getMyTier(session.user.id), isFeatureEnabled(session.user.id, 'leaderboard')])
        .then(([tierValue, enabled]) => {
          if (cancelled) return;
          setTier(tierValue);
          setFeatureEnabled(enabled);
        })
        .catch((err) => {
          if (!cancelled) setTierError(err instanceof Error ? err.message : 'Failed to check your membership tier.');
        })
        .finally(() => {
          if (!cancelled) setTierLoading(false);
        });

      return () => {
        cancelled = true;
      };
    }, [isCoach, session])
  );

  const loadEntries = useCallback(() => {
    setLoading(true);
    setError(null);
    const fetcher = view === 'weekly' ? getWeeklyLeaderboard : getLifetimeLeaderboard;
    fetcher()
      .then(setEntries)
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load the leaderboard.'))
      .finally(() => setLoading(false));
  }, [view]);

  useFocusEffect(
    useCallback(() => {
      if (!hasAccess) return;
      loadEntries();
    }, [hasAccess, loadEntries])
  );

  if (!isCoach && tierLoading) {
    return <ActivityIndicator style={styles.loader} />;
  }

  if (!isCoach && tierError) {
    return <ThemedText style={styles.error}>{tierError}</ThemedText>;
  }

  if (!hasAccess) {
    // Tier and the coach's per-client toggle are independent gates —
    // whichever one is actually the reason gets named, so a client whose
    // tier qualifies but whose toggle is off isn't told to upgrade for
    // something upgrading wouldn't fix.
    const tierQualifies = tier !== null && tierHasLeaderboardAccess(tier);
    const message = tierQualifies ? TOGGLED_OFF_MESSAGE : UPGRADE_MESSAGE;
    return <FeatureLockedCard title="Leaderboards" message={message} />;
  }

  return (
    <View style={styles.container}>
      <View style={styles.viewToggleRow}>
        <Pressable onPress={() => setView('weekly')}>
          <ThemedText type={view === 'weekly' ? 'smallBold' : 'small'} themeColor={view === 'weekly' ? 'text' : 'textSecondary'}>
            This week
          </ThemedText>
        </Pressable>
        <Pressable onPress={() => setView('lifetime')}>
          <ThemedText
            type={view === 'lifetime' ? 'smallBold' : 'small'}
            themeColor={view === 'lifetime' ? 'text' : 'textSecondary'}>
            Lifetime
          </ThemedText>
        </Pressable>
      </View>

      {loading && <ActivityIndicator style={styles.loader} />}

      {!loading && error && <ThemedText style={styles.error}>{error}</ThemedText>}

      {!loading && !error && entries.length === 0 && (
        <ThemedText themeColor="textSecondary" style={styles.empty}>
          No XP logged {view === 'weekly' ? 'yet this week' : 'yet'}.
        </ThemedText>
      )}

      {!loading &&
        !error &&
        entries.map((entry, index) => {
          const isSelf = entry.clientId === session?.user.id;
          return (
            <ThemedView
              key={entry.clientId}
              type="backgroundElement"
              style={[styles.row, isSelf && styles.rowSelf]}>
              <ThemedText type="smallBold" style={styles.position}>
                #{index + 1}
              </ThemedText>
              <View style={styles.avatar}>
                <ThemedText type="smallBold" style={styles.avatarText}>
                  {initial(entry.name)}
                </ThemedText>
              </View>
              <ThemedText type="smallBold" style={styles.name}>
                {entry.name}
                {isSelf ? ' (you)' : ''}
              </ThemedText>
              <ThemedText type="smallBold" style={styles.xp}>
                {entry.xp} XP
              </ThemedText>
            </ThemedView>
          );
        })}
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
    marginTop: Spacing.two,
  },
  empty: {
    textAlign: 'center',
    marginTop: Spacing.five,
  },
  viewToggleRow: {
    flexDirection: 'row',
    gap: Spacing.four,
    marginBottom: Spacing.one,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: Spacing.two,
    padding: Spacing.three,
    gap: Spacing.three,
  },
  rowSelf: {
    borderWidth: 1,
    borderColor: Accent,
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
  name: {
    flex: 1,
  },
  xp: {
    color: Colors.tealBright,
  },
});
