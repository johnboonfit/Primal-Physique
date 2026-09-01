import { Redirect, Tabs } from 'expo-router';

import { Accent, Colors } from '@/constants/theme';
import { useAuth } from '@/context/auth-context';

/**
 * The client's 5-tab home. Coach-proofed the same way /workouts and
 * /assignments are proofed against clients — a coach account landing
 * here (e.g. by typing the URL) gets sent back to their own home instead.
 */
export default function ClientTabsLayout() {
  const { profile, loadingProfile } = useAuth();

  if (loadingProfile) return null;
  if (profile?.role !== 'client') return <Redirect href="/home" />;

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
      <Tabs.Screen name="index" options={{ title: 'Home' }} />
      <Tabs.Screen name="training" options={{ title: 'Training' }} />
      <Tabs.Screen name="nutrition" options={{ title: 'Nutrition' }} />
      <Tabs.Screen name="progress" options={{ title: 'Progress' }} />
      <Tabs.Screen name="calendar" options={{ title: 'Calendar' }} />
    </Tabs>
  );
}
