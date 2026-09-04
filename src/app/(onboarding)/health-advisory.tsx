import { Redirect, router } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Accent, Colors, Glow, Spacing } from '@/constants/theme';
import { useAuth } from '@/context/auth-context';
import { useTheme } from '@/hooks/use-theme';
import { acknowledgeHealthAdvisory } from '@/lib/onboarding';

/**
 * Step 4 — only ever reached when getOnboardingStatus() says
 * 'needs_health_review' (a "Yes" on the PARQ, not yet acknowledged).
 * Not a dead end: the account is held here, not blocked — checking the
 * box (with or without a clearance note) does the same thing either way,
 * since the real effect is identical regardless of which one the client
 * picks. No document upload here on purpose — a clearance note is a
 * plain text field, not a new subsystem.
 */
export default function HealthAdvisoryScreen() {
  const theme = useTheme();
  const { session, loadingProfile } = useAuth();

  const [acknowledged, setAcknowledged] = useState(false);
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!loadingProfile && !session) {
    return <Redirect href="/welcome" />;
  }

  const handleContinue = async () => {
    if (!session || !acknowledged) return;
    setError(null);
    setSaving(true);
    try {
      await acknowledgeHealthAdvisory(session.user.id, note);
      router.replace('/client');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong saving that.');
      setSaving(false);
    }
  };

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
          <ThemedView style={styles.card}>
            <ThemedText type="title" style={styles.title}>
              Health Advisory
            </ThemedText>
            <ThemedText themeColor="textSecondary">
              Based on your health screening answers, we recommend consulting a physician before starting a new
              exercise program. This isn&apos;t a block — your coach will factor this in, and you can continue once
              you&apos;ve acknowledged it below.
            </ThemedText>
          </ThemedView>

          <Pressable style={styles.checkboxRow} onPress={() => setAcknowledged((current) => !current)}>
            <View style={[styles.checkbox, acknowledged && styles.checkboxChecked]}>
              {acknowledged && <ThemedText style={styles.checkmark}>✓</ThemedText>}
            </View>
            <ThemedText style={styles.checkboxLabel}>I acknowledge this advisory and choose to proceed.</ThemedText>
          </Pressable>

          <ThemedText type="smallBold" style={styles.noteLabel}>
            Clearance note (optional)
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary" style={styles.noteHint}>
            e.g. "Cleared by Dr. Smith, 12 Jan 2026" — only if you have one. Not required to continue.
          </ThemedText>
          <TextInput
            value={note}
            onChangeText={setNote}
            placeholder="Optional"
            placeholderTextColor={theme.textSecondary}
            multiline
            style={[styles.input, { color: theme.text, borderColor: theme.backgroundSelected }]}
          />

          {error && <ThemedText style={styles.error}>{error}</ThemedText>}

          <Pressable
            style={({ pressed }) => [styles.primaryButton, (!acknowledged || saving) && styles.disabled, pressed && acknowledged && styles.pressed]}
            onPress={handleContinue}
            disabled={!acknowledged || saving}>
            {saving ? (
              <ActivityIndicator color={Colors.text} />
            ) : (
              <ThemedText type="smallBold" style={styles.primaryButtonText}>
                Continue
              </ThemedText>
            )}
          </Pressable>
        </ScrollView>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  safeArea: { flex: 1 },
  scrollContent: {
    padding: Spacing.four,
    gap: Spacing.three,
  },
  card: {
    ...Glow.oxblood,
    borderRadius: Spacing.four,
    padding: Spacing.four,
    gap: Spacing.two,
    backgroundColor: Colors.backgroundElement,
  },
  title: {
    fontSize: 26,
    lineHeight: 32,
  },
  checkboxRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.two,
    marginTop: Spacing.two,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: Spacing.half,
    borderWidth: 1,
    borderColor: Colors.backgroundSelected,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  checkboxChecked: {
    backgroundColor: Accent,
    borderColor: Accent,
  },
  checkmark: {
    color: Colors.text,
    fontSize: 14,
    fontWeight: '700',
  },
  checkboxLabel: {
    flex: 1,
  },
  noteLabel: {
    marginTop: Spacing.one,
  },
  noteHint: {
    marginTop: -Spacing.one,
  },
  input: {
    borderWidth: 1,
    borderRadius: Spacing.two,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.three,
    fontSize: 16,
    minHeight: 80,
    textAlignVertical: 'top',
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
  disabled: {
    opacity: 0.4,
  },
  pressed: {
    opacity: 0.85,
  },
  primaryButtonText: {
    color: Colors.text,
  },
});
