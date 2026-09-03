import { router } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Accent, Colors, Glow, Spacing } from '@/constants/theme';
import { useAuth } from '@/context/auth-context';
import { useTheme } from '@/hooks/use-theme';
import { createMealPlanTemplate } from '@/lib/meal-plans';
import { GOAL_TYPES, type GoalType } from '@/lib/programmes';

export default function NewMealPlanScreen() {
  const theme = useTheme();
  const { session } = useAuth();

  const [name, setName] = useState('');
  const [goalType, setGoalType] = useState<GoalType>('cutting');
  const [proteinPercent, setProteinPercent] = useState('40');
  const [carbPercent, setCarbPercent] = useState('35');
  const [fatPercent, setFatPercent] = useState('25');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const parsedProtein = Number(proteinPercent);
  const parsedCarb = Number(carbPercent);
  const parsedFat = Number(fatPercent);
  const percentSum = parsedProtein + parsedCarb + parsedFat;

  const handleSave = async () => {
    setError(null);
    if (!session) return;

    const trimmedName = name.trim();
    if (!trimmedName) {
      setError('Give the template a name.');
      return;
    }

    if (
      !Number.isInteger(parsedProtein) ||
      !Number.isInteger(parsedCarb) ||
      !Number.isInteger(parsedFat) ||
      parsedProtein < 0 ||
      parsedCarb < 0 ||
      parsedFat < 0
    ) {
      setError('Protein, carb, and fat percentages must be whole numbers of 0 or more.');
      return;
    }

    if (percentSum !== 100) {
      setError(`Protein + carb + fat must add up to exactly 100% -- right now it's ${percentSum}%.`);
      return;
    }

    setSaving(true);
    try {
      const templateId = await createMealPlanTemplate(session.user.id, {
        name: trimmedName,
        goalType,
        targetProteinPercent: parsedProtein,
        targetCarbPercent: parsedCarb,
        targetFatPercent: parsedFat,
      });
      router.replace(`/meal-plans/${templateId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong saving the template.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
          <ThemedText type="title" style={styles.title}>
            New meal plan template
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary" style={styles.hint}>
            Add recipes to each meal slot on the next screen -- the baseline calorie total is calculated from what
            you build, not typed in.
          </ThemedText>

          <TextInput
            value={name}
            onChangeText={setName}
            placeholder="Template name (e.g. Cutting Day Plan)"
            placeholderTextColor={theme.textSecondary}
            autoFocus
            style={[styles.input, { color: theme.text, borderColor: theme.backgroundSelected }]}
          />

          <ThemedText type="smallBold" style={styles.sectionLabel}>
            Goal
          </ThemedText>
          <View style={styles.chipRow}>
            {GOAL_TYPES.map(({ key, label }) => {
              const selected = goalType === key;
              return (
                <Pressable
                  key={key}
                  onPress={() => setGoalType(key)}
                  style={[styles.chip, { borderColor: theme.backgroundSelected }, selected && styles.chipSelected]}>
                  <ThemedText type="small" style={selected ? styles.chipTextSelected : undefined}>
                    {label}
                  </ThemedText>
                </Pressable>
              );
            })}
          </View>

          <ThemedText type="smallBold" style={styles.sectionLabel}>
            Target macro split (% of calories, must total 100)
          </ThemedText>
          <View style={styles.row}>
            <View style={styles.rowItem}>
              <ThemedText type="small" themeColor="textSecondary">
                Protein %
              </ThemedText>
              <TextInput
                value={proteinPercent}
                onChangeText={setProteinPercent}
                keyboardType="numeric"
                style={[styles.input, { color: theme.text, borderColor: theme.backgroundSelected }]}
              />
            </View>
            <View style={styles.rowItem}>
              <ThemedText type="small" themeColor="textSecondary">
                Carb %
              </ThemedText>
              <TextInput
                value={carbPercent}
                onChangeText={setCarbPercent}
                keyboardType="numeric"
                style={[styles.input, { color: theme.text, borderColor: theme.backgroundSelected }]}
              />
            </View>
            <View style={styles.rowItem}>
              <ThemedText type="small" themeColor="textSecondary">
                Fat %
              </ThemedText>
              <TextInput
                value={fatPercent}
                onChangeText={setFatPercent}
                keyboardType="numeric"
                style={[styles.input, { color: theme.text, borderColor: theme.backgroundSelected }]}
              />
            </View>
          </View>
          <ThemedText
            type="small"
            themeColor="textSecondary"
            style={percentSum !== 100 ? styles.percentWarning : undefined}>
            Total: {percentSum}%
          </ThemedText>

          {error && <ThemedText style={styles.error}>{error}</ThemedText>}

          <Pressable
            style={({ pressed }) => [styles.primaryButton, pressed && styles.pressed]}
            onPress={handleSave}
            disabled={saving}>
            {saving ? (
              <ActivityIndicator color={Colors.text} />
            ) : (
              <ThemedText type="smallBold" style={styles.primaryButtonText}>
                Create template
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
  scrollContent: {
    padding: Spacing.four,
    gap: Spacing.three,
  },
  title: {
    marginBottom: Spacing.half,
  },
  hint: {
    marginBottom: Spacing.two,
  },
  input: {
    borderWidth: 1,
    borderRadius: Spacing.two,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.three,
    fontSize: 16,
  },
  sectionLabel: {
    marginTop: Spacing.two,
    marginBottom: Spacing.half,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  chip: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
  },
  chipSelected: {
    ...Glow.oxblood,
    backgroundColor: Accent,
    borderColor: Accent,
  },
  chipTextSelected: {
    color: Colors.text,
    fontWeight: '700',
  },
  row: {
    flexDirection: 'row',
    gap: Spacing.three,
  },
  rowItem: {
    flex: 1,
    gap: Spacing.half,
  },
  percentWarning: {
    color: Accent,
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
  cancelButton: {
    alignItems: 'center',
    paddingVertical: Spacing.two,
  },
});
