import { Pressable, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Accent, Spacing } from '@/constants/theme';
import { useAuth } from '@/context/auth-context';

export default function HomeScreen() {
  const { session, profile, loadingProfile, signOut } = useAuth();

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <ThemedView type="backgroundElement" style={styles.card}>
          <ThemedText type="title" style={styles.title}>
            Primal Physique
          </ThemedText>

          {loadingProfile && <ThemedText themeColor="textSecondary">Loading your profile...</ThemedText>}

          {!loadingProfile && profile && (
            <ThemedText type="subtitle" style={styles.roleText}>
              You&apos;re logged in as{' '}
              <ThemedText type="subtitle" style={styles.roleHighlight}>
                {profile.role === 'coach' ? 'Coach' : 'Client'}
              </ThemedText>
            </ThemedText>
          )}

          {!loadingProfile && !profile && (
            <ThemedText themeColor="textSecondary" style={styles.roleText}>
              We couldn&apos;t find a profile for this account. Check the profiles table in Supabase.
            </ThemedText>
          )}

          <ThemedText themeColor="textSecondary" type="small">
            {session?.user.email}
          </ThemedText>
        </ThemedView>

        <Pressable style={({ pressed }) => [styles.signOutButton, pressed && styles.pressed]} onPress={signOut}>
          <ThemedText type="smallBold" style={styles.signOutText}>
            Sign out
          </ThemedText>
        </Pressable>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: Spacing.four,
    gap: Spacing.four,
  },
  card: {
    borderRadius: Spacing.four,
    paddingVertical: Spacing.five,
    paddingHorizontal: Spacing.four,
    alignItems: 'center',
    gap: Spacing.three,
  },
  title: {
    textAlign: 'center',
  },
  roleText: {
    textAlign: 'center',
  },
  roleHighlight: {
    color: Accent,
  },
  signOutButton: {
    borderRadius: Spacing.two,
    paddingVertical: Spacing.three,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: Accent,
  },
  pressed: {
    opacity: 0.85,
  },
  signOutText: {
    color: Accent,
  },
});
