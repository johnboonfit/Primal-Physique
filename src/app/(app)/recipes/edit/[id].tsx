import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Accent, Colors, Glow, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { getRecipeDetail, RECIPE_TAGS, updateRecipeDetails } from '@/lib/recipes';

export default function EditRecipeScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const theme = useTheme();

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [name, setName] = useState('');
  const [instructions, setInstructions] = useState('');
  const [prepMinutes, setPrepMinutes] = useState('0');
  const [cookMinutes, setCookMinutes] = useState('0');
  const [servings, setServings] = useState('1');
  const [tags, setTags] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    getRecipeDetail(id)
      .then((recipe) => {
        setName(recipe.name);
        setInstructions(recipe.instructions);
        setPrepMinutes(String(recipe.prepMinutes));
        setCookMinutes(String(recipe.cookMinutes));
        setServings(String(recipe.servings));
        setTags(new Set(recipe.tags));
      })
      .catch((err) => setLoadError(err instanceof Error ? err.message : 'Failed to load this recipe.'))
      .finally(() => setLoading(false));
  }, [id]);

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
    if (!id) return;

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
      await updateRecipeDetails(id, {
        name: trimmedName,
        instructions: instructions.trim(),
        prepMinutes: parsedPrep,
        cookMinutes: parsedCook,
        servings: parsedServings,
        tags: Array.from(tags),
      });
      router.replace(`/recipes/${id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong saving the recipe.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        {loading && <ActivityIndicator style={styles.loader} />}
        {!loading && loadError && <ThemedText style={styles.error}>{loadError}</ThemedText>}

        {!loading && !loadError && (
          <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
            <ThemedText type="title" style={styles.title}>
              Edit recipe
            </ThemedText>

            <ThemedText type="smallBold" style={styles.sectionLabel}>
              Note: changing servings recalculates macros per serving immediately -- it doesn't touch any ingredient.
            </ThemedText>

            <TextInput
              value={name}
              onChangeText={setName}
              placeholder="Recipe name"
              placeholderTextColor={theme.textSecondary}
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
                  Save changes
                </ThemedText>
              )}
            </Pressable>

            <Pressable style={styles.cancelButton} onPress={() => router.back()}>
              <ThemedText themeColor="textSecondary">Cancel</ThemedText>
            </Pressable>
          </ScrollView>
        )}
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  safeArea: { flex: 1 },
  loader: {
    marginTop: Spacing.five,
  },
  scrollContent: {
    padding: Spacing.four,
    gap: Spacing.three,
  },
  title: {
    marginBottom: Spacing.half,
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
