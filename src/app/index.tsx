import { Redirect } from 'expo-router';
import { ActivityIndicator } from 'react-native';

import { ThemedView } from '@/components/themed-view';
import { useAuth } from '@/context/auth-context';

/**
 * The very first screen the app opens to. It doesn't show anything itself —
 * it just checks whether we already have a logged-in session (and, if so,
 * which role that account is) and sends the user to the right place:
 * the coach's home, the client's tabs, or the login screen.
 */
export default function Index() {
  const { session, initializing, profile, loadingProfile } = useAuth();

  if (initializing || (session && loadingProfile)) {
    return (
      <ThemedView style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator />
      </ThemedView>
    );
  }

  if (!session) {
    return <Redirect href="/login" />;
  }

  return <Redirect href={profile?.role === 'client' ? '/client' : '/home'} />;
}
