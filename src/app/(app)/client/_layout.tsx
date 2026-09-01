import { Redirect, Tabs } from 'expo-router';
import { useColorScheme } from 'react-native';

import { Accent, Colors } from '@/constants/theme';
import { useAuth } from '@/context/auth-context';

/**
 * The client's 5-tab home. Coach-proofed the same way /workouts and
 * /assignments are proofed against clients — a coach account landing
 * here (e.g. by typing the URL) gets sent back to their own home instead.
 */
export default function ClientTabsLayout() {
  const { profile, loadingProfile } = useAuth();
  const scheme = useColorScheme();
  const colors = Colors[scheme === 'dark' ? 'dark' : 'light'];

  if (loadingProfile) return null;
  if (profile?.role !== 'client') return <Redirect href="/home" />;

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: Accent,
        tabBarInactiveTintColor: colors.textSecondary,
        tabBarStyle: { backgroundColor: colors.background },
      }}>
      <Tabs.Screen name="index" options={{ title: 'Home' }} />
      <Tabs.Screen name="training" options={{ title: 'Training' }} />
      <Tabs.Screen name="nutrition" options={{ title: 'Nutrition' }} />
      <Tabs.Screen name="progress" options={{ title: 'Progress' }} />
      <Tabs.Screen name="calendar" options={{ title: 'Calendar' }} />
    </Tabs>
  );
}
