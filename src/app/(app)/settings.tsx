import Constants from 'expo-constants';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Switch, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as WebBrowser from 'expo-web-browser';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Accent, Colors, Glow, Spacing } from '@/constants/theme';
import { useAuth } from '@/context/auth-context';
import { useTheme } from '@/hooks/use-theme';
import { CLIENT_TIERS, getMyTier, type ClientTier } from '@/lib/leaderboard';
import { PLAN_UPGRADE_OPTIONS, startPlanUpgrade } from '@/lib/plan-upgrades';
import {
  requestEmailChange,
  setNotificationPreference,
  updateProfileDetails,
  type NotificationPreferenceKey,
} from '@/lib/settings';
import { getWearableConnections, type WearableConnection } from '@/lib/wearables';

/** Preference storage only -- see notification-preferences.sql. No real
 * delivery reads these yet (Phase 14); each switch just needs to save
 * the right value, immediately, same as every other simple on/off
 * preference in this app (e.g. Community's own hide toggle) rather
 * than waiting on the Profile settings card's Save button. */
/** Read straight from the running build's own config -- app.json's
 * `expo.version` field -- rather than a second hardcoded string that
 * would inevitably drift out of sync with it. `expoConfig` is Expo's
 * current recommended field for this (the older `manifest`/
 * `expoManifest` shape is deprecated); it's undefined only in a raw
 * bare-workflow context this app doesn't use, hence the fallback. */
const APP_VERSION = Constants.expoConfig?.version ?? 'Unknown';

const NOTIFICATION_TOGGLES: { key: NotificationPreferenceKey; label: string; description: string }[] = [
  { key: 'push_notifications_enabled', label: 'Push notifications', description: 'Allow this device to receive push notifications.' },
  { key: 'workout_reminders_enabled', label: 'Workout reminders', description: 'Reminders for your scheduled workouts.' },
  { key: 'habit_reminders_enabled', label: 'Habit reminders', description: 'Reminders to complete your daily habits.' },
  { key: 'community_updates_enabled', label: 'Community updates', description: 'New posts and activity in Community.' },
];

/** Two-letter initials for the Hero card's avatar circle -- first
 * letter of the first two words of whatever name is available, or the
 * first two characters of the email if there's no name at all. No real
 * profile-picture upload exists yet anywhere in the app, so this is the
 * only avatar there is right now (same placeholder-initials approach
 * leaderboard-panel.tsx already uses, just two letters instead of one
 * for this larger, more prominent card). */
const PROVIDER_LABEL: Record<WearableConnection['provider'], string> = {
  apple_health: 'Apple Health',
  google_health: 'Google Health',
};

function formatRelativeTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(diffMs / 60000);
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

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
  const { session, profile, signOut } = useAuth();
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

  const [notifPrefs, setNotifPrefs] = useState<Record<NotificationPreferenceKey, boolean>>({
    push_notifications_enabled: true,
    workout_reminders_enabled: true,
    habit_reminders_enabled: true,
    community_updates_enabled: true,
  });
  const [notifError, setNotifError] = useState<string | null>(null);

  const [wearableConnections, setWearableConnections] = useState<WearableConnection[]>([]);

  const [upgradeMenuOpen, setUpgradeMenuOpen] = useState(false);
  const [upgradingTier, setUpgradingTier] = useState<ClientTier | null>(null);
  const [upgradeError, setUpgradeError] = useState<string | null>(null);
  const [upgradeNotice, setUpgradeNotice] = useState<string | null>(null);

  useEffect(() => {
    if (!profile || formInitialized) return;
    setFullName(profile.full_name ?? '');
    setPhoneNumber(profile.phone_number ?? '');
    setEmail(profile.email ?? '');
    setNotifPrefs({
      push_notifications_enabled: profile.push_notifications_enabled,
      workout_reminders_enabled: profile.workout_reminders_enabled,
      habit_reminders_enabled: profile.habit_reminders_enabled,
      community_updates_enabled: profile.community_updates_enabled,
    });
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

  useEffect(() => {
    if (!session) return;
    getWearableConnections(session.user.id)
      .then(setWearableConnections)
      .catch((err) => console.error('Failed to load wearable connections:', err));
  }, [session]);

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

  /** Optimistic flip, immediate save, revert on failure -- same shape
   * client/index.tsx's handleToggleCommunityHidden already uses for a
   * single on/off preference. */
  const handleToggleNotification = async (key: NotificationPreferenceKey, next: boolean) => {
    if (!session) return;
    setNotifError(null);
    setNotifPrefs((current) => ({ ...current, [key]: next }));
    try {
      await setNotificationPreference(session.user.id, key, next);
    } catch (err) {
      setNotifPrefs((current) => ({ ...current, [key]: !next }));
      setNotifError(err instanceof Error ? err.message : 'Something went wrong saving that.');
    }
  };

  const handleSelectUpgrade = async (tier: ClientTier) => {
    if (!session) return;
    setUpgradeError(null);
    setUpgradeNotice(null);
    setUpgradingTier(tier);
    try {
      const url = await startPlanUpgrade(session.user.id, tier);
      // Opens Stripe's own hosted checkout as an in-app browser, closing
      // itself the moment it navigates to either success_url or
      // cancel_url (see create-checkout-session.ts) -- the redirect
      // itself is just this app's own primalphysique:// scheme, so
      // there's nothing real for it to land on the web.
      const result = await WebBrowser.openAuthSessionAsync(url, 'primalphysique://settings');
      setUpgradeMenuOpen(false);
      if (result.type === 'success') {
        setUpgradeNotice(
          "Payment received — your plan updates automatically once Stripe confirms it, usually within a few seconds. Pull down to refresh if it doesn't show right away."
        );
      }
    } catch (err) {
      setUpgradeError(err instanceof Error ? err.message : 'Something went wrong starting that upgrade.');
    } finally {
      setUpgradingTier(null);
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

          {!isCoach && (
            <>
              <Pressable
                style={({ pressed }) => [styles.upgradeButton, Glow.oxblood, pressed && styles.pressed]}
                onPress={() => setUpgradeMenuOpen(true)}>
                <ThemedText type="smallBold" style={styles.upgradeButtonText}>
                  ⭐ Upgrade Plan
                </ThemedText>
              </Pressable>
              {upgradeNotice && <ThemedText style={styles.success}>{upgradeNotice}</ThemedText>}
            </>
          )}

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

          <ThemedText type="smallBold" style={styles.sectionLabel}>
            Notifications
          </ThemedText>

          <ThemedView type="backgroundElement" style={[styles.card, styles.notificationsCard]}>
            {NOTIFICATION_TOGGLES.map((toggle, index) => (
              <View
                key={toggle.key}
                style={[styles.toggleRow, index === NOTIFICATION_TOGGLES.length - 1 && styles.toggleRowLast]}>
                <View style={styles.toggleInfo}>
                  <ThemedText type="smallBold">{toggle.label}</ThemedText>
                  <ThemedText type="small" themeColor="textSecondary">
                    {toggle.description}
                  </ThemedText>
                </View>
                <Switch
                  value={notifPrefs[toggle.key]}
                  onValueChange={(next) => handleToggleNotification(toggle.key, next)}
                  trackColor={{ false: Colors.backgroundSelected, true: Accent }}
                  thumbColor={Colors.text}
                  // react-native-web only honors thumbColor for the OFF
                  // state -- the ON-state thumb is a separate, web-only
                  // prop (activeThumbColor) that otherwise silently
                  // defaults to react-native-web's own teal (#009688),
                  // which would violate this app's "oxblood is the only
                  // active-state accent" color rule.
                  {...{ activeThumbColor: Colors.text }}
                />
              </View>
            ))}
            {notifError && <ThemedText style={styles.error}>{notifError}</ThemedText>}
          </ThemedView>

          <ThemedText type="smallBold" style={styles.sectionLabel}>
            Wearable
          </ThemedText>

          <ThemedView type="backgroundElement" style={[styles.card, styles.wearableCard]}>
            <View style={styles.wearableRow}>
              <ThemedText type="small" themeColor="textSecondary">
                Status
              </ThemedText>
              <ThemedText type="smallBold" themeColor="textSecondary">
                {wearableConnections.length > 0
                  ? wearableConnections.map((c) => PROVIDER_LABEL[c.provider]).join(', ')
                  : 'Not connected'}
              </ThemedText>
            </View>
            <View style={styles.wearableRow}>
              <ThemedText type="small" themeColor="textSecondary">
                Last synced
              </ThemedText>
              <ThemedText type="smallBold" themeColor="textSecondary">
                {wearableConnections[0]?.lastSyncedAt ? formatRelativeTime(wearableConnections[0].lastSyncedAt) : 'Never'}
              </ThemedText>
            </View>
            <Pressable style={styles.disabledButton} disabled accessibilityState={{ disabled: true }}>
              <ThemedText type="smallBold" themeColor="textSecondary">
                Force Sync
              </ThemedText>
            </Pressable>
            <ThemedText type="small" themeColor="textSecondary" style={styles.wearableHint}>
              Wearable integration is coming soon — connecting a device and syncing data will work here once it's
              built.
            </ThemedText>
          </ThemedView>

          <ThemedView type="backgroundElement" style={[styles.card, styles.signOutCard]}>
            <Pressable style={({ pressed }) => [styles.signOutButton, pressed && styles.pressed]} onPress={signOut}>
              <ThemedText type="smallBold" style={styles.signOutText}>
                Sign out
              </ThemedText>
            </Pressable>
          </ThemedView>

          <ThemedView type="backgroundElement" style={[styles.card, styles.versionCard]}>
            <ThemedText type="small" themeColor="textSecondary">
              App Version
            </ThemedText>
            <ThemedText type="smallBold" themeColor="textSecondary">
              {APP_VERSION}
            </ThemedText>
          </ThemedView>
        </ScrollView>
      </SafeAreaView>

      <Modal
        visible={upgradeMenuOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setUpgradeMenuOpen(false)}>
        <View style={styles.modalOverlay}>
          <ThemedView type="backgroundElement" style={styles.modalCard}>
            <ThemedText type="smallBold" style={styles.modalTitle}>
              Choose a plan
            </ThemedText>
            <ThemedText type="small" themeColor="textSecondary" style={styles.modalSubtitle}>
              You'll pay securely through Stripe — your plan updates automatically once payment is confirmed.
            </ThemedText>

            {PLAN_UPGRADE_OPTIONS.map((option) => (
              <Pressable
                key={option.tier}
                style={({ pressed }) => [styles.planOption, pressed && styles.pressed]}
                onPress={() => handleSelectUpgrade(option.tier)}
                disabled={upgradingTier !== null}>
                {upgradingTier === option.tier ? (
                  <ActivityIndicator color={Colors.text} />
                ) : (
                  <ThemedText type="smallBold" style={styles.planOptionText}>
                    {option.label}
                  </ThemedText>
                )}
              </Pressable>
            ))}

            {upgradeError && <ThemedText style={styles.error}>{upgradeError}</ThemedText>}

            <Pressable style={styles.cancelButton} onPress={() => setUpgradeMenuOpen(false)} disabled={upgradingTier !== null}>
              <ThemedText themeColor="textSecondary">Cancel</ThemedText>
            </Pressable>
          </ThemedView>
        </View>
      </Modal>
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
  upgradeButton: {
    backgroundColor: Accent,
    borderRadius: Spacing.three,
    paddingVertical: Spacing.three,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: Spacing.three,
  },
  upgradeButtonText: {
    color: Colors.text,
    fontSize: 16,
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
  notificationsCard: {
    padding: 0,
    paddingHorizontal: Spacing.four,
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.three,
    paddingVertical: Spacing.three,
    borderBottomWidth: 1,
    borderBottomColor: Colors.backgroundSelected,
  },
  toggleRowLast: {
    borderBottomWidth: 0,
  },
  toggleInfo: {
    flex: 1,
    gap: Spacing.half,
  },
  wearableCard: {
    gap: Spacing.two,
  },
  wearableRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  disabledButton: {
    borderWidth: 1,
    borderColor: Colors.backgroundSelected,
    borderRadius: Spacing.two,
    paddingVertical: Spacing.three,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: Spacing.one,
    opacity: 0.5,
  },
  wearableHint: {
    marginTop: -Spacing.one,
  },
  signOutCard: {
    padding: 0,
  },
  versionCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  signOutButton: {
    borderRadius: Spacing.three,
    paddingVertical: Spacing.three,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: Accent,
  },
  signOutText: {
    color: Accent,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: Spacing.four,
  },
  modalCard: {
    width: '100%',
    maxWidth: 400,
    borderRadius: Spacing.four,
    padding: Spacing.four,
    gap: Spacing.two,
  },
  modalTitle: {
    marginBottom: Spacing.half,
  },
  modalSubtitle: {
    marginBottom: Spacing.one,
  },
  planOption: {
    borderWidth: 1,
    borderColor: Accent,
    borderRadius: Spacing.two,
    paddingVertical: Spacing.three,
    alignItems: 'center',
    justifyContent: 'center',
  },
  planOptionText: {
    color: Accent,
  },
  cancelButton: {
    alignItems: 'center',
    paddingVertical: Spacing.two,
    marginTop: Spacing.one,
  },
});
