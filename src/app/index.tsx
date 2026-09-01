import { Redirect } from 'expo-router';
import { ActivityIndicator } from 'react-native';

import { ThemedView } from '@/components/themed-view';
import { useAuth } from '@/context/auth-context';

/**
 * The very first screen the app opens to. It doesn't show anything itself —
 * it just checks whether we already have a logged-in session and sends the
 * user to the right place: the home screen if so, the login screen if not.
 */
export default function Index() {
  const { session, initializing } = useAuth();

  if (initializing) {
    return (
      <ThemedView style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator />
      </ThemedView>
    );
  }

  return <Redirect href={session ? '/home' : '/login'} />;
}
