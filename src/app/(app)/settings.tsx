import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Accent, Colors, Glow, Spacing } from '@/constants/theme';
import { useAuth } from '@/context/auth-context';
import { useTheme } from '@/hooks/use-theme';
import { CLIENT_TIERS, getMyTier } from '@/lib/leaderboard';
import { requestEmailChange, updateProfileDetails } from '@/lib/settings';

/** Two-letter initials for the Hero card's avatar circle -- first
 * letter of the first two words of whatever name is available, or the
 * first two characters of the email if there's no name at all. No real
 * profile-picture upload exists yet anywhere in the app, so this is the
 * only avatar there is right now (same placeholder-initials approach
 * leaderboard-panel.tsx already uses, just two letters instead of one
 * for this larger, more prominent card). */
function initials(fullName: string | null, email: string): string {
  const source = (fullName ?? '').trim();
  if (source) {
    const parts = source.split(/\s+/).filter(Boolean);
    if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
    return source.slice(0, 2).toUpperCase();
  }
  return (email.trim().slice(0, 2) || '?').toUpperCase();
}

export default function SettingsScreen() {
  const theme = useTheme();
  const { session, profile } = useAuth();
  const isCoach = profile?.role === 'coach';

  const [planLabel, setPlanLabel] = useState<string | null>(null);

  const [fullName, setFullName] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [email, setEmail] = useState('');
  const [formInitialized, setFormInitialized] = useState(false);

  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [savedNotice, setSavedNotice] = useState(false);
  const [emailChangeNotice, setEmailChangeNotice] = useState<string | null>(null);

  useEffect(() => {
    if (!profile || formInitialized) return;
    setFullName(profile.full_name ?? '');
    setPhoneNumber(profile.phone_number ?? '');
    setEmail(profile.email ?? '');
    setFormInitialized(true);
  }, [profile, formInitialized]);

  useEffect(() => {
    if (!session) return;
    if (isCoach) {
      setPlanLabel('Coach');
      return;
    }
    getMyTier(session.user.id)
      .then((tier) => setPlanLabel(CLIENT_TIERS.find((t) => t.key === tier)?.label ?? 'Base'))
      .catch(() => setPlanLabel(null));
  }, [session, isCoach]);

  const handleSave = async () => {
    if (!session || !profile) return;
    setSaveError(null);
    setSavedNotice(false);
    setEmailChangeNotice(null);

    if (!fullName.trim()) {
      setSaveError('Enter your name.');
      return;
    }

    setSaving(true);
    try {
      await updateProfileDetails(session.user.id, fullName, phoneNumber);

      const trimmedEmail = email.trim();
      if (trimmedEmail && trimmedEmail !== profile.email) {
        await requestEmailChange(trimmedEmail);
        setEmailChangeNotice(
          `Check ${trimmedEmail} to confirm this change — your login email stays ${profile.email} until you do.`
        );
        setEmail(profile.email); // don't show the new address as already active — it isn't yet
      } else {
        setSavedNotice(true);
      }
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Something went wrong saving your details.');
    } finally {
      setSaving(false);
    }
  };

  if (!profile) {
    return (
      <ThemedView style={styles.container}>
        <SafeAreaView style={styles.safeArea}>
          <ActivityIndicator style={styles.loader} />
        </SafeAreaView>
      </ThemedView>
    );
  }

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
          <Pressable onPress={() => router.back()} style={styles.backButton}>
            <ThemedText type="linkPrimary">Back</ThemedText>
          </Pressable>

          <ThemedText type="title" style={styles.title}>
            Settings
          </ThemedText>

          <ThemedView type="backgroundElement" style={[styles.card, styles.heroCard, Glow.teal]}>
            <View style={styles.avatar}>
              <ThemedText type="title" style={styles.avatarText}>
                {initials(profile.full_name, profile.email)}
              </ThemedText>
            </View>
            <View style={styles.heroInfo}>
              <ThemedText type="smallBold" numberOfLines={1}>
                {profile.email}
              </ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                {planLabel ?? '—'} plan
              </ThemedText>
            </View>
          </ThemedView>

          <ThemedText type="smallBold" style={styles.sectionLabel}>
            Profile settings
          </ThemedText>

          <ThemedView type="backgroundElement" style={[styles.card, styles.formCard]}>
            <View style={styles.field}>
              <ThemedText type="small" themeColor="textSecondary">
                Name
              </ThemedText>
              <TextInput
                value={fullName}
                onChangeText={setFullName}
                placeholder="Your name"
                placeholderTextColor={theme.textSecondary}
                autoComplete="name"
                style={[styles.input, { color: theme.text, borderColor: theme.backgroundSelected }]}
              />
            </View>

            <View style={styles.field}>
              <ThemedText type="small" themeColor="textSecondary">
                Email
              </ThemedText>
              <TextInput
                value={email}
                onChangeText={setEmail}
                placeholder="you@example.com"
                placeholderTextColor={theme.textSecondary}
                autoCapitalize="none"
                autoComplete="email"
                keyboardType="email-address"
                style={[styles.input, { color: theme.text, borderColor: theme.backgroundSelected }]}
              />
            </View>

            <View style={styles.field}>
              <ThemedText type="small" themeColor="textSecondary">
                Phone number
              </ThemedText>
              <TextInput
                value={phoneNumber}
                onChangeText={setPhoneNumber}
                placeholder="Optional"
                placeholderTextColor={theme.textSecondary}
                autoComplete="tel"
                keyboardType="phone-pad"
                style={[styles.input, { color: theme.text, borderColor: theme.backgroundSelected }]}
              />
            </View>

            {saveError && <ThemedText style={styles.error}>{saveError}</ThemedText>}
            {savedNotice && <ThemedText style={styles.success}>Saved.</ThemedText>}
            {emailChangeNotice && <ThemedText style={styles.success}>{emailChangeNotice}</ThemedText>}

            <Pressable
              style={({ pressed }) => [styles.primaryButton, pressed && styles.pressed]}
              onPress={handleSave}
              disabled={saving}>
              {saving ? (
                <ActivityIndicator color={Colors.text} />
              ) : (
                <ThemedText type="smallBold" style={styles.primaryButtonText}>
                  Save
                </ThemedText>
              )}
            </Pressable>
          </ThemedView>
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
    gap: Spacing.two,
    paddingBottom: Spacing.six,
  },
  backButton: {
    marginBottom: Spacing.two,
  },
  title: {
    marginBottom: Spacing.two,
  },
  card: {
    borderRadius: Spacing.three,
    padding: Spacing.four,
  },
  heroCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
  },
  avatar: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: Colors.tealDeep,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    fontSize: 22,
    lineHeight: 26,
  },
  heroInfo: {
    flex: 1,
    gap: Spacing.half,
  },
  sectionLabel: {
    marginTop: Spacing.three,
  },
  formCard: {
    gap: Spacing.three,
  },
  field: {
    gap: Spacing.one,
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
  success: {
    color: Colors.tealBright,
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
  loader: {
    marginTop: Spacing.six,
  },
});
