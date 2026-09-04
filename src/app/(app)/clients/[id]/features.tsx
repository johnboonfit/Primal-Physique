import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Accent, Colors, Spacing } from '@/constants/theme';
import { getClientFeatureToggles, setClientFeatureToggle, type FeatureToggle } from '@/lib/feature-toggles';
import { getErrorMessage } from '@/lib/errors';

/**
 * Coach-only per-client feature access. Every key from feature_key
 * appears here whether or not a real gate reads it yet (see
 * feature-toggles.ts's "Wired" comments) — toggling one of the other 5
 * simply does nothing yet, same as it would for any feature nobody's
 * built a check for.
 */
export default function ClientFeaturesScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();

  const [features, setFeatures] = useState<FeatureToggle[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  const load = useCallback(() => {
    if (!id) return;
    setLoading(true);
    setError(null);
    getClientFeatureToggles(id)
      .then(setFeatures)
      .catch((err) => setError(getErrorMessage(err, 'Failed to load feature access.')))
      .finally(() => setLoading(false));
  }, [id]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const handleToggle = async (feature: FeatureToggle) => {
    if (!id) return;
    setSaveError(null);
    setSavingKey(feature.key);
    const next = !feature.enabled;
    // Optimistic, reverted on failure -- same pattern as the client's own
    // Community-hidden toggle on client/index.tsx.
    setFeatures((current) => current.map((f) => (f.key === feature.key ? { ...f, enabled: next } : f)));
    try {
      await setClientFeatureToggle(id, feature.key, next);
    } catch (err) {
      setSaveError(getErrorMessage(err, 'Failed to save that.'));
      setFeatures((current) => current.map((f) => (f.key === feature.key ? { ...f, enabled: !next } : f)));
    } finally {
      setSavingKey(null);
    }
  };

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <Pressable onPress={() => router.back()} style={styles.backButton}>
          <ThemedText type="linkPrimary">Back</ThemedText>
        </Pressable>

        <ThemedText type="title" style={styles.title}>
          Feature Access
        </ThemedText>
        <ThemedText themeColor="textSecondary" style={styles.subtitle}>
          Turn a feature off to gate it behind an upsell prompt for this client only — everyone else is unaffected.
        </ThemedText>

        {loading && <ActivityIndicator style={styles.loader} />}
        {!loading && error && <ThemedText style={styles.error}>{error}</ThemedText>}

        {!loading && !error && (
          <ScrollView contentContainerStyle={styles.scrollContent}>
            {saveError && <ThemedText style={styles.error}>{saveError}</ThemedText>}

            <ThemedView type="backgroundElement" style={styles.card}>
              {features.map((feature, index) => (
                <View key={feature.key} style={[styles.row, index === features.length - 1 && styles.rowNoBorder]}>
                  <ThemedText type="small">{feature.label}</ThemedText>
                  <Pressable onPress={() => handleToggle(feature)} disabled={savingKey === feature.key} hitSlop={8}>
                    {savingKey === feature.key ? (
                      <ActivityIndicator size="small" />
                    ) : (
                      <ThemedText type="smallBold" style={feature.enabled ? styles.onText : styles.offText}>
                        {feature.enabled ? 'On' : 'Off'}
                      </ThemedText>
                    )}
                  </Pressable>
                </View>
              ))}
            </ThemedView>
          </ScrollView>
        )}
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  safeArea: { flex: 1, paddingHorizontal: Spacing.four, paddingTop: Spacing.four },
  backButton: {
    marginBottom: Spacing.two,
  },
  title: {
    fontSize: 26,
    lineHeight: 32,
  },
  subtitle: {
    marginTop: Spacing.one,
    marginBottom: Spacing.three,
  },
  loader: {
    marginTop: Spacing.five,
  },
  error: {
    color: Accent,
    marginBottom: Spacing.two,
  },
  scrollContent: {
    paddingBottom: Spacing.six,
  },
  card: {
    borderRadius: Spacing.two,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.three,
    borderBottomWidth: 1,
    borderBottomColor: Colors.backgroundSelected,
  },
  rowNoBorder: {
    borderBottomWidth: 0,
  },
  onText: {
    color: Colors.tealBright,
  },
  offText: {
    color: Accent,
  },
});
