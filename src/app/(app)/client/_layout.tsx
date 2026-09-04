import { Ionicons } from '@expo/vector-icons';
import { Redirect, Tabs } from 'expo-router';
import { useEffect, useState } from 'react';
import type { ColorValue } from 'react-native';

import { Accent, Colors } from '@/constants/theme';
import { useAuth } from '@/context/auth-context';
import { getOnboardingStatus, type OnboardingStatus } from '@/lib/onboarding';

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

  // Belt-and-suspenders with index.tsx's own check — a deep link or a
  // stale bookmark could otherwise land a not-yet-onboarded client
  // straight here, skipping the gate entirely.
  useEffect(() => {
    if (!session || profile?.role !== 'client') return;
    let cancelled = false;
    getOnboardingStatus(session.user.id)
      .then((status) => {
        if (!cancelled) setOnboardingStatus(status);
      })
      .finally(() => {
        if (!cancelled) setCheckingOnboarding(false);
      });
    return () => {
      cancelled = true;
    };
  }, [session, profile?.role]);

  // Only block on a profile we don't have yet — not on a later re-fetch
  // (e.g. after a token refresh on app resume) of a profile we already
  // have. Unmounting <Tabs> here on every re-fetch was exactly what reset
  // the active tab back to Home every time the app came back from the
  // background.
  if (loadingProfile && !profile) return null;
  if (profile?.role !== 'client') return <Redirect href="/home" />;
  if (checkingOnboarding || onboardingStatus === null) return null;
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
      <Tabs.Screen name="chat" options={{ title: 'Chat', tabBarIcon: tabIcon('chatbubble-ellipses', 'chatbubble-ellipses-outline') }} />
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
