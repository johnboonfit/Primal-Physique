import { Ionicons } from '@expo/vector-icons';
import { Redirect, Tabs } from 'expo-router';
import { useEffect, useState } from 'react';
import { StyleSheet } from 'react-native';
import type { ColorValue } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Accent, Colors, Spacing } from '@/constants/theme';
import { useAuth } from '@/context/auth-context';
import { getOrCreateConversation, getUnreadMessageCount, subscribeToConversation } from '@/lib/chat';
import { isFeatureEnabled } from '@/lib/feature-toggles';
import { ensureClientProvisioned, getOnboardingStatus, type OnboardingStatus } from '@/lib/onboarding';

const ONBOARDING_ROUTES: Record<Exclude<OnboardingStatus, 'complete'>, string> = {
  needs_parq: '/parq',
  needs_health_review: '/health-advisory',
};

type IconName = keyof typeof Ionicons.glyphMap;

/** Filled glyph when active, outline otherwise — the standard iOS/modern
 * tab-bar convention. Color comes from tabBarActiveTintColor/
 * tabBarInactiveTintColor below, same as the text label, so icon and
 * label always agree on active state. */
function tabIcon(active: IconName, inactive: IconName) {
  return ({ color, focused }: { color: ColorValue; focused: boolean }) => (
    <Ionicons name={focused ? active : inactive} size={22} color={color as string} />
  );
}

/**
 * The client's 5-tab home. Coach-proofed the same way /workouts and
 * /assignments are proofed against clients — a coach account landing
 * here (e.g. by typing the URL) gets sent back to their own home instead.
 */
export default function ClientTabsLayout() {
  const { session, profile, loadingProfile } = useAuth();

  const [onboardingStatus, setOnboardingStatus] = useState<OnboardingStatus | null>(null);
  const [checkingOnboarding, setCheckingOnboarding] = useState(true);
  const [onboardingCheckError, setOnboardingCheckError] = useState<string | null>(null);

  const [unreadMessageCount, setUnreadMessageCount] = useState(0);

  // Belt-and-suspenders with index.tsx's own check — a deep link or a
  // stale bookmark could otherwise land a not-yet-onboarded client
  // straight here, skipping the gate entirely.
  useEffect(() => {
    if (!session || profile?.role !== 'client') return;
    let cancelled = false;
    setOnboardingCheckError(null);
    getOnboardingStatus(session.user.id)
      .then((status) => {
        if (!cancelled) setOnboardingStatus(status);
        // Safety net, not the primary path (parq.tsx/health-advisory.tsx
        // already call this the instant onboarding actually finishes) —
        // covers a client who finished onboarding but whose provisioning
        // call never got to run (e.g. a dropped connection). A no-op
        // every time after the first, so it's harmless to call on every
        // mount of this layout for a fully-onboarded client, forever.
        if (status === 'complete') {
          ensureClientProvisioned().catch((err) => console.error('Failed to provision client account:', err));
        }
      })
      .catch((err) => {
        // Without this, a failed check left onboardingStatus stuck at
        // null forever — checkingOnboarding still flips false below, so
        // the render guard below would show a permanently blank screen,
        // with no error and no way for the client to recover.
        if (!cancelled) setOnboardingCheckError(err instanceof Error ? err.message : 'Failed to check your account status.');
      })
      .finally(() => {
        if (!cancelled) setCheckingOnboarding(false);
      });
    return () => {
      cancelled = true;
    };
  }, [session, profile?.role]);

  // Chat tab badge — lives here (not chat.tsx) specifically so it stays
  // live while the client is anywhere in the tab bar, not just while
  // Chat itself is open. Reuses the exact same realtime channel
  // ChatThread subscribes to (messages + conversation_reads changes for
  // this conversation) — multiple independent subscriptions to the same
  // topic are a normal, supported pattern, and this is what makes the
  // badge clear itself the instant ChatThread's own markConversationRead
  // call lands, without this effect needing to know that happened.
  useEffect(() => {
    if (!session || profile?.role !== 'client' || onboardingStatus !== 'complete') {
      setUnreadMessageCount(0);
      return;
    }
    let cancelled = false;
    let unsubscribe: (() => void) | null = null;

    isFeatureEnabled(session.user.id, 'chat')
      .then((enabled) => {
        if (cancelled || !enabled) return;
        return getOrCreateConversation(session.user.id).then((conversationId) => {
          if (cancelled) return;
          const refresh = () => {
            getUnreadMessageCount(conversationId, session.user.id)
              .then((count) => {
                if (!cancelled) setUnreadMessageCount(count);
              })
              .catch((err) => console.error('Failed to check unread messages:', err));
          };
          refresh();
          unsubscribe = subscribeToConversation(conversationId, refresh);
        });
      })
      .catch((err) => console.error('Failed to set up the unread-messages badge:', err));

    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, [session, profile?.role, onboardingStatus]);

  // Only block on a profile we don't have yet — not on a later re-fetch
  // (e.g. after a token refresh on app resume) of a profile we already
  // have. Unmounting <Tabs> here on every re-fetch was exactly what reset
  // the active tab back to Home every time the app came back from the
  // background.
  if (loadingProfile && !profile) return null;
  if (profile?.role !== 'client') return <Redirect href="/home" />;
  if (checkingOnboarding) return null;
  if (onboardingCheckError) {
    return (
      <ThemedView style={styles.errorContainer}>
        <ThemedText style={styles.errorText}>{onboardingCheckError}</ThemedText>
      </ThemedView>
    );
  }
  if (onboardingStatus === null) return null;
  if (onboardingStatus !== 'complete') return <Redirect href={ONBOARDING_ROUTES[onboardingStatus] as never} />;

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: Accent,
        tabBarInactiveTintColor: Colors.textSecondary,
        // A subtle oxblood-tinted pill behind the active tab — the closest
        // equivalent to an "active state glow" the tab bar component allows.
        // "22" is a hex alpha suffix (~13% opacity) on the brand oxblood.
        tabBarActiveBackgroundColor: `${Colors.oxblood}22`,
        tabBarStyle: { backgroundColor: Colors.background, borderTopColor: Colors.backgroundElement },
        tabBarItemStyle: { borderRadius: 12, marginHorizontal: 4, marginVertical: 4 },
      }}>
      <Tabs.Screen name="index" options={{ title: 'Home', tabBarIcon: tabIcon('home', 'home-outline') }} />
      <Tabs.Screen name="training" options={{ title: 'Training', tabBarIcon: tabIcon('barbell', 'barbell-outline') }} />
      <Tabs.Screen name="nutrition" options={{ title: 'Nutrition', tabBarIcon: tabIcon('nutrition', 'nutrition-outline') }} />
      <Tabs.Screen name="progress" options={{ title: 'Progress', tabBarIcon: tabIcon('trending-up', 'trending-up-outline') }} />
      <Tabs.Screen
        name="chat"
        options={{
          title: 'Chat',
          tabBarIcon: tabIcon('chatbubble-ellipses', 'chatbubble-ellipses-outline'),
          tabBarBadge: unreadMessageCount > 0 ? unreadMessageCount : undefined,
          tabBarBadgeStyle: { backgroundColor: Accent, color: Colors.text },
        }}
      />
      {/* Calendar is fully built (Phase 7's Week/Month view) — it just isn't
       * a tab anymore. `href: null` is the documented Expo Router way to
       * keep a screen registered and routable (Training's "View Calendar"
       * link still opens it) while hiding its tab bar button entirely.
       * Removing this <Tabs.Screen> outright would NOT do the same thing:
       * calendar.tsx would still auto-join the tab bar as an unstyled 6th
       * tab, since Tabs includes every file in this directory regardless
       * of whether it's declared here. */}
      <Tabs.Screen name="calendar" options={{ href: null }} />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  errorContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.four,
  },
  errorText: {
    color: Accent,
    textAlign: 'center',
  },
});
