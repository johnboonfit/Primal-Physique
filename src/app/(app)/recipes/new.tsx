import { router } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Accent, Colors, Glow, Spacing } from '@/constants/theme';
import { useAuth } from '@/context/auth-context';
import { useTheme } from '@/hooks/use-theme';
import { createRecipe, RECIPE_TAGS } from '@/lib/recipes';

export default function NewRecipeScreen() {
  const theme = useTheme();
  const { session } = useAuth();

  const [name, setName] = useState('');
  const [instructions, setInstructions] = useState('');
  const [prepMinutes, setPrepMinutes] = useState('10');
  const [cookMinutes, setCookMinutes] = useState('20');
  const [servings, setServings] = useState('4');
  const [tags, setTags] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const toggleTag = (tag: string) => {
    setTags((current) => {
      const next = new Set(current);
      if (next.has(tag)) {
        next.delete(tag);
      } else {
        next.add(tag);
      }
      return next;
    });
  };

  const handleSave = async () => {
    setError(null);
    if (!session) return;

    const trimmedName = name.trim();
    if (!trimmedName) {
      setError('Give the recipe a name.');
      return;
    }

    const parsedServings = Number(servings);
    if (!servings.trim() || !Number.isInteger(parsedServings) || parsedServings < 1) {
      setError('Servings must be a whole number of 1 or more -- macros per serving divide by this number.');
      return;
    }

    const parsedPrep = Number(prepMinutes) || 0;
    const parsedCook = Number(cookMinutes) || 0;
    if (parsedPrep < 0 || parsedCook < 0) {
      setError('Prep and cook time can’t be negative.');
      return;
    }

    setSaving(true);
    try {
      const recipeId = await createRecipe(session.user.id, {
        name: trimmedName,
        instructions: instructions.trim(),
        prepMinutes: parsedPrep,
        cookMinutes: parsedCook,
        servings: parsedServings,
        tags: Array.from(tags),
      });
      router.replace(`/recipes/${recipeId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong saving the recipe.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
          <ThemedText type="title" style={styles.title}>
            New recipe
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary" style={styles.hint}>
            Add ingredients and a photo on the next screen -- macros per serving get calculated automatically once
            ingredients are added.
          </ThemedText>

          <TextInput
            value={name}
            onChangeText={setName}
            placeholder="Recipe name (e.g. Chicken & Rice Bowl)"
            placeholderTextColor={theme.textSecondary}
            autoFocus
            style={[styles.input, { color: theme.text, borderColor: theme.backgroundSelected }]}
          />

          <View style={styles.row}>
            <View style={styles.rowItem}>
              <ThemedText type="smallBold" style={styles.sectionLabel}>
                Prep (minutes)
              </ThemedText>
              <TextInput
                value={prepMinutes}
                onChangeText={setPrepMinutes}
                keyboardType="numeric"
                placeholderTextColor={theme.textSecondary}
                style={[styles.input, { color: theme.text, borderColor: theme.backgroundSelected }]}
              />
            </View>
            <View style={styles.rowItem}>
              <ThemedText type="smallBold" style={styles.sectionLabel}>
                Cook (minutes)
              </ThemedText>
              <TextInput
                value={cookMinutes}
                onChangeText={setCookMinutes}
                keyboardType="numeric"
                placeholderTextColor={theme.textSecondary}
                style={[styles.input, { color: theme.text, borderColor: theme.backgroundSelected }]}
              />
            </View>
          </View>

          <ThemedText type="smallBold" style={styles.sectionLabel}>
            Servings
          </ThemedText>
          <TextInput
            value={servings}
            onChangeText={setServings}
            keyboardType="numeric"
            placeholderTextColor={theme.textSecondary}
            style={[styles.input, styles.servingsInput, { color: theme.text, borderColor: theme.backgroundSelected }]}
          />

          <ThemedText type="smallBold" style={styles.sectionLabel}>
            Tags
          </ThemedText>
          <View style={styles.chipRow}>
            {RECIPE_TAGS.map((tag) => {
              const selected = tags.has(tag);
              return (
                <Pressable
                  key={tag}
                  onPress={() => toggleTag(tag)}
                  style={[styles.chip, { borderColor: theme.backgroundSelected }, selected && styles.chipSelected]}>
                  <ThemedText type="small" style={selected ? styles.chipTextSelected : undefined}>
                    {tag}
                  </ThemedText>
                </Pressable>
              );
            })}
          </View>

          <ThemedText type="smallBold" style={styles.sectionLabel}>
            Instructions
          </ThemedText>
          <TextInput
            value={instructions}
            onChangeText={setInstructions}
            placeholder="Step by step..."
            placeholderTextColor={theme.textSecondary}
            multiline
            numberOfLines={6}
            style={[styles.input, styles.multilineInput, { color: theme.text, borderColor: theme.backgroundSelected }]}
          />

          {error && <ThemedText style={styles.error}>{error}</ThemedText>}

          <Pressable
            style={({ pressed }) => [styles.primaryButton, pressed && styles.pressed]}
            onPress={handleSave}
            disabled={saving}>
            {saving ? (
              <ActivityIndicator color={Colors.text} />
            ) : (
              <ThemedText type="smallBold" style={styles.primaryButtonText}>
                Create recipe
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
  multilineInput: {
    minHeight: 120,
    textAlignVertical: 'top',
  },
  row: {
    flexDirection: 'row',
    gap: Spacing.three,
  },
  rowItem: {
    flex: 1,
  },
  servingsInput: {
    maxWidth: 160,
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
