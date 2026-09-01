import { Link, router } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, TextInput } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Accent, Colors, Glow, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { supabase } from '@/lib/supabase';

export default function SignUpScreen() {
  const theme = useTheme();
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmationSent, setConfirmationSent] = useState(false);

  const handleSignUp = async () => {
    setError(null);
    if (!fullName.trim()) {
      setError('Enter your name.');
      return;
    }
    if (!email || !password) {
      setError('Enter an email and password.');
      return;
    }
    if (password.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }
    setLoading(true);
    // Every signup becomes a client — there's no role choice here anymore.
    // Coach accounts are granted by hand in Supabase, not chosen at signup.
    const { data, error: signUpError } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: { data: { full_name: fullName.trim() } },
    });
    setLoading(false);

    if (signUpError) {
      setError(signUpError.message);
      return;
    }

    if (!data.session) {
      // Supabase has "Confirm email" turned on for this project, so the
      // account exists but can't log in until the link in that email is clicked.
      setConfirmationSent(true);
      return;
    }

    router.replace('/home');
  };

  if (confirmationSent) {
    return (
      <ThemedView style={styles.container}>
        <SafeAreaView style={styles.safeArea}>
          <ThemedText type="title" style={styles.title}>
            Check your email
          </ThemedText>
          <ThemedText themeColor="textSecondary" style={styles.subtitle}>
            We sent a confirmation link to {email}. Click it, then come back and log in.
          </ThemedText>
          <Pressable style={styles.linkButton} onPress={() => router.replace('/login')}>
            <ThemedText type="linkPrimary">Back to login</ThemedText>
          </Pressable>
        </SafeAreaView>
      </ThemedView>
    );
  }

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <ThemedText type="title" style={styles.title}>
          Create account
        </ThemedText>

        <TextInput
          value={fullName}
          onChangeText={setFullName}
          placeholder="Full name"
          placeholderTextColor={theme.textSecondary}
          autoComplete="name"
          style={[styles.input, { color: theme.text, borderColor: theme.backgroundSelected }]}
        />

        <TextInput
          value={email}
          onChangeText={setEmail}
          placeholder="Email"
          placeholderTextColor={theme.textSecondary}
          autoCapitalize="none"
          autoComplete="email"
          keyboardType="email-address"
          style={[styles.input, { color: theme.text, borderColor: theme.backgroundSelected }]}
        />
        <TextInput
          value={password}
          onChangeText={setPassword}
          placeholder="Password (min 6 characters)"
          placeholderTextColor={theme.textSecondary}
          secureTextEntry
          autoComplete="password-new"
          style={[styles.input, { color: theme.text, borderColor: theme.backgroundSelected }]}
        />

        {error && <ThemedText style={styles.error}>{error}</ThemedText>}

        <Pressable
          style={({ pressed }) => [styles.primaryButton, pressed && styles.pressed]}
          onPress={handleSignUp}
          disabled={loading}>
          {loading ? (
            <ActivityIndicator color={Colors.text} />
          ) : (
            <ThemedText type="smallBold" style={styles.primaryButtonText}>
              Create account
            </ThemedText>
          )}
        </Pressable>

        <Link href="/login" style={styles.linkButton}>
          <ThemedText type="linkPrimary">Already have an account? Log in</ThemedText>
        </Link>
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
    gap: Spacing.three,
  },
  title: {
    textAlign: 'center',
  },
  subtitle: {
    textAlign: 'center',
    marginBottom: Spacing.three,
  },
  input: {
    borderWidth: 1,
    borderRadius: Spacing.two,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.three,
    fontSize: 16,
  },
  error: {
    color: Accent,
    textAlign: 'center',
  },
  primaryButton: {
    ...Glow.oxblood,
    backgroundColor: Accent,
    borderRadius: Spacing.two,
    paddingVertical: Spacing.three,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: {
    opacity: 0.85,
  },
  primaryButtonText: {
    color: Colors.text,
  },
  linkButton: {
    alignSelf: 'center',
    marginTop: Spacing.two,
  },
});
