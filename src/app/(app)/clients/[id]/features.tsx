import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ConfirmDialog } from '@/components/confirm-dialog';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Accent, Colors, Spacing } from '@/constants/theme';
import { getErrorMessage } from '@/lib/errors';
import {
  applyPresetToClient,
  getClientFeatureToggles,
  listPresets,
  setClientFeatureToggle,
  type FeatureToggle,
  type TogglePreset,
} from '@/lib/feature-toggles';

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
  const [presets, setPresets] = useState<TogglePreset[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  const [presetTarget, setPresetTarget] = useState<TogglePreset | null>(null);
  const [applyingPreset, setApplyingPreset] = useState(false);
  const [presetError, setPresetError] = useState<string | null>(null);

  const load = useCallback(() => {
    if (!id) return;
    setLoading(true);
    setError(null);
    Promise.all([getClientFeatureToggles(id), listPresets()])
      .then(([featureData, presetData]) => {
        setFeatures(featureData);
        setPresets(presetData);
      })
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

  const handleConfirmApplyPreset = async () => {
    if (!id || !presetTarget) return;
    setPresetError(null);
    setApplyingPreset(true);
    try {
      await applyPresetToClient(id, presetTarget.key);
      setPresetTarget(null);
      load();
    } catch (err) {
      setPresetError(getErrorMessage(err, 'Failed to apply that preset.'));
    } finally {
      setApplyingPreset(false);
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
            {presets.length > 0 && (
              <>
                <ThemedText type="smallBold" style={styles.sectionLabel}>
                  Apply a preset
                </ThemedText>
                <ThemedText type="small" themeColor="textSecondary" style={styles.presetHint}>
                  Sets all 9 features at once to that plan's defaults — every toggle stays individually adjustable afterward.
                </ThemedText>
                {presetError && <ThemedText style={styles.error}>{presetError}</ThemedText>}
                <View style={styles.presetRow}>
                  {presets.map((preset) => (
                    <Pressable key={preset.key} style={styles.presetButton} onPress={() => setPresetTarget(preset)}>
                      <ThemedText type="smallBold" style={styles.presetButtonText}>
                        {preset.label}
                      </ThemedText>
                    </Pressable>
                  ))}
                </View>
              </>
            )}

            <ThemedText type="smallBold" style={styles.sectionLabel}>
              Individual features
            </ThemedText>

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

        <ConfirmDialog
          visible={presetTarget !== null}
          title={`Apply ${presetTarget?.label ?? ''}?`}
          message="This overwrites all 9 feature toggles for this client with that plan's defaults, including any individual changes already made. Each one can still be adjusted afterward."
          confirmLabel="Apply preset"
          busy={applyingPreset}
          onConfirm={handleConfirmApplyPreset}
          onCancel={() => setPresetTarget(null)}
        />
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
  sectionLabel: {
    marginTop: Spacing.two,
    marginBottom: Spacing.one,
  },
  presetHint: {
    marginBottom: Spacing.two,
  },
  presetRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
    marginBottom: Spacing.two,
  },
  presetButton: {
    borderWidth: 1,
    borderColor: Colors.tealBright,
    borderRadius: Spacing.two,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
  },
  presetButtonText: {
    color: Colors.tealBright,
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
