import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Accent, Colors, Glow, Spacing } from '@/constants/theme';
import { listClientOptions, type ClientOption } from '@/lib/assignments';
import { assignMealPlanToClient, getMealPlanTemplateDetail, type MealPlanTemplateDetail } from '@/lib/meal-plans';
import { GOAL_TYPES } from '@/lib/programmes';

function goalLabel(goalType: MealPlanTemplateDetail['goalType']) {
  return GOAL_TYPES.find((g) => g.key === goalType)?.label ?? goalType;
}

export default function AssignMealPlanScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();

  const [template, setTemplate] = useState<MealPlanTemplateDetail | null>(null);
  const [clients, setClients] = useState<ClientOption[]>([]);
  const [loadingOptions, setLoadingOptions] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [clientId, setClientId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;

    Promise.all([getMealPlanTemplateDetail(id), listClientOptions()])
      .then(([templateData, clientOptions]) => {
        if (cancelled) return;
        setTemplate(templateData);
        setClients(clientOptions);
      })
      .catch((err) => {
        if (!cancelled) setLoadError(err instanceof Error ? err.message : 'Failed to load options.');
      })
      .finally(() => {
        if (!cancelled) setLoadingOptions(false);
      });

    return () => {
      cancelled = true;
    };
  }, [id]);

  const handleAssign = async () => {
    setError(null);
    if (!id) return;

    if (!clientId) {
      setError('Pick a client.');
      return;
    }

    setSaving(true);
    try {
      const assignmentId = await assignMealPlanToClient(id, clientId);
      router.replace(`/meal-plans/assigned/${assignmentId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong assigning this template.');
    } finally {
      setSaving(false);
    }
  };

  if (loadingOptions) {
    return (
      <ThemedView style={styles.container}>
        <SafeAreaView style={[styles.safeArea, styles.centered]}>
          <ActivityIndicator />
        </SafeAreaView>
      </ThemedView>
    );
  }

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
          <ThemedText type="title" style={styles.title}>
            Assign meal plan
          </ThemedText>

          {loadError && <ThemedText style={styles.error}>{loadError}</ThemedText>}

          {template && (
            <ThemedView type="backgroundElement" style={styles.templateCard}>
              <ThemedText type="smallBold">{template.name}</ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                {goalLabel(template.goalType)} · {Math.round(template.totalCalories)} kcal baseline
              </ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                Scales automatically to each client's own real calorie target -- not this template's baseline number.
              </ThemedText>
            </ThemedView>
          )}

          {!loadError && clients.length === 0 && (
            <ThemedText themeColor="textSecondary">There are no client accounts yet.</ThemedText>
          )}

          {clients.length > 0 && (
            <>
              <ThemedText type="smallBold" style={styles.sectionLabel}>
                Client
              </ThemedText>
              {clients.map((client) => {
                const selected = client.id === clientId;
                return (
                  <Pressable key={client.id} onPress={() => setClientId(client.id)}>
                    <ThemedView
                      type="backgroundElement"
                      style={[styles.optionRow, selected && styles.optionRowSelected]}>
                      <ThemedText type={selected ? 'smallBold' : 'default'}>{client.email}</ThemedText>
                    </ThemedView>
                  </Pressable>
                );
              })}
            </>
          )}

          {error && <ThemedText style={styles.error}>{error}</ThemedText>}

          <Pressable
            style={({ pressed }) => [styles.primaryButton, pressed && styles.pressed]}
            onPress={handleAssign}
            disabled={saving}>
            {saving ? (
              <ActivityIndicator color={Colors.text} />
            ) : (
              <ThemedText type="smallBold" style={styles.primaryButtonText}>
                Assign meal plan
              </ThemedText>
            )}
          </Pressable>

          <Pressable style={styles.cancelButton} onPress={() => router.back()}>
            <ThemedText themeColor="textSecondary">Cancel</ThemedText>
          </Pressable>
        </ScrollView>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  safeArea: { flex: 1 },
  centered: { alignItems: 'center', justifyContent: 'center' },
  scrollContent: { padding: Spacing.four, gap: Spacing.two },
  title: { marginBottom: Spacing.two },
  templateCard: {
    borderRadius: Spacing.two,
    padding: Spacing.three,
    gap: Spacing.half,
    marginBottom: Spacing.two,
  },
  sectionLabel: { marginTop: Spacing.three },
  optionRow: {
    borderWidth: 1,
    borderColor: 'transparent',
    borderRadius: Spacing.two,
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.three,
    marginTop: Spacing.half,
  },
  optionRowSelected: { borderColor: Accent },
  error: { color: Accent, textAlign: 'center' },
  primaryButton: {
    ...Glow.oxblood,
    backgroundColor: Accent,
    borderRadius: Spacing.two,
    paddingVertical: Spacing.three,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: Spacing.three,
  },
  pressed: { opacity: 0.85 },
  primaryButtonText: { color: Colors.text },
  cancelButton: { alignItems: 'center', paddingVertical: Spacing.two },
});
