import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Accent, Colors, Glow, Spacing } from '@/constants/theme';
import { useAuth } from '@/context/auth-context';
import { useTheme } from '@/hooks/use-theme';
import {
  createCustomExercise,
  EXERCISE_CATEGORIES,
  EXERCISE_EQUIPMENT,
  getExerciseDetail,
  MUSCLE_GROUPS,
  updateCustomExercise,
  type MuscleGroup,
} from '@/lib/exercise-library';

function titleCase(word: string) {
  return word.charAt(0).toUpperCase() + word.slice(1);
}

function toList(value: string): string[] {
  return value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function toLines(value: string): string[] {
  return value
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
}

/** Loose sanity check, not real URL validation -- just enough to catch
 * "forgot the https://" before it gets saved and never opens. */
function looksLikeUrl(value: string): boolean {
  return /^https?:\/\/.+/i.test(value.trim());
}

type CustomExerciseFormProps = { exerciseId?: string };

/**
 * The coach's custom-exercise builder -- shared by /exercise-library/new
 * (a blank form) and /exercise-library/edit/[id] (the same form, preloaded
 * from an existing custom exercise). Same create/edit split as
 * WorkoutForm: which mode this runs in is decided entirely by whether
 * `exerciseId` was passed in.
 */
export function CustomExerciseForm({ exerciseId }: CustomExerciseFormProps) {
  const theme = useTheme();
  const { session } = useAuth();
  const isEditing = Boolean(exerciseId);

  const [name, setName] = useState('');
  const [category, setCategory] = useState<string>(EXERCISE_CATEGORIES[0]);
  const [muscleGroup, setMuscleGroup] = useState<MuscleGroup | null>(null);
  const [equipment, setEquipment] = useState<Set<string>>(new Set());
  const [primaryMuscles, setPrimaryMuscles] = useState('');
  const [secondaryMuscles, setSecondaryMuscles] = useState('');
  const [description, setDescription] = useState('');
  const [instructions, setInstructions] = useState('');
  const [videoUrl, setVideoUrl] = useState('');

  const [loadingExisting, setLoadingExisting] = useState(isEditing);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!exerciseId) return;
    let cancelled = false;
    getExerciseDetail(exerciseId)
      .then((detail) => {
        if (cancelled) return;
        setName(detail.name);
        setCategory(detail.category);
        setMuscleGroup(detail.muscleGroup as MuscleGroup);
        setEquipment(new Set(detail.equipment));
        setPrimaryMuscles(detail.primaryMuscles.join(', '));
        setSecondaryMuscles(detail.secondaryMuscles.join(', '));
        setDescription(detail.description ?? '');
        setInstructions(detail.instructions.join('\n'));
        setVideoUrl(detail.videoUrl ?? '');
      })
      .catch((err) => {
        if (!cancelled) setLoadError(err instanceof Error ? err.message : 'Failed to load this exercise.');
      })
      .finally(() => {
        if (!cancelled) setLoadingExisting(false);
      });
    return () => {
      cancelled = true;
    };
  }, [exerciseId]);

  const toggleEquipment = (key: string) => {
    setEquipment((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const canSubmit = !saving && name.trim().length > 0 && muscleGroup !== null;

  const handleSave = async () => {
    if (!session || !canSubmit || !muscleGroup) return;

    const trimmedVideoUrl = videoUrl.trim();
    if (trimmedVideoUrl && !looksLikeUrl(trimmedVideoUrl)) {
      setError('That video link doesn\'t look like a valid URL -- it should start with https://');
      return;
    }

    setError(null);
    setSaving(true);
    try {
      const draft = {
        name: name.trim(),
        category,
        muscleGroup,
        primaryMuscles: toList(primaryMuscles),
        secondaryMuscles: toList(secondaryMuscles),
        equipment: Array.from(equipment),
        instructions: toLines(instructions),
        description: description.trim() || null,
        videoUrl: trimmedVideoUrl || null,
      };

      if (exerciseId) {
        await updateCustomExercise(exerciseId, draft);
      } else {
        await createCustomExercise(session.user.id, draft);
      }
      router.back();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong saving that exercise.');
    } finally {
      setSaving(false);
    }
  };

  if (loadingExisting) {
    return (
      <ThemedView style={styles.container}>
        <SafeAreaView style={styles.safeArea}>
          <ActivityIndicator style={styles.loader} />
        </SafeAreaView>
      </ThemedView>
    );
  }

  if (loadError) {
    return (
      <ThemedView style={styles.container}>
        <SafeAreaView style={styles.safeArea}>
          <Pressable onPress={() => router.back()} style={styles.cancelButton}>
            <ThemedText type="linkPrimary">Back</ThemedText>
          </Pressable>
          <ThemedText style={styles.error}>{loadError}</ThemedText>
        </SafeAreaView>
      </ThemedView>
    );
  }

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} hitSlop={8}>
            <ThemedText type="linkPrimary">Cancel</ThemedText>
          </Pressable>
          <ThemedText type="smallBold">{isEditing ? 'Edit Exercise' : 'New Exercise'}</ThemedText>
          <View style={{ width: 50 }} />
        </View>

        <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
          <ThemedText type="smallBold" style={styles.fieldLabel}>
            Name
          </ThemedText>
          <TextInput
            value={name}
            onChangeText={setName}
            placeholder="e.g. Landmine Press"
            placeholderTextColor={theme.textSecondary}
            style={[styles.input, { color: theme.text, borderColor: theme.backgroundSelected }]}
          />

          <ThemedText type="smallBold" style={styles.fieldLabel}>
            Category
          </ThemedText>
          <View style={styles.chipRow}>
            {EXERCISE_CATEGORIES.map((key) => {
              const selected = category === key;
              return (
                <Pressable
                  key={key}
                  onPress={() => setCategory(key)}
                  style={[styles.chip, { borderColor: theme.backgroundSelected }, selected && styles.chipSelected]}>
                  <ThemedText type="small" style={selected ? styles.chipTextSelected : undefined}>
                    {titleCase(key)}
                  </ThemedText>
                </Pressable>
              );
            })}
          </View>

          <ThemedText type="smallBold" style={styles.fieldLabel}>
            Muscle Group
          </ThemedText>
          <View style={styles.chipRow}>
            {MUSCLE_GROUPS.map(({ key, label }) => {
              const selected = muscleGroup === key;
              return (
                <Pressable
                  key={key}
                  onPress={() => setMuscleGroup(key)}
                  style={[styles.chip, { borderColor: theme.backgroundSelected }, selected && styles.chipSelected]}>
                  <ThemedText type="small" style={selected ? styles.chipTextSelected : undefined}>
                    {label}
                  </ThemedText>
                </Pressable>
              );
            })}
          </View>

          <ThemedText type="smallBold" style={styles.fieldLabel}>
            Equipment (optional)
          </ThemedText>
          <View style={styles.chipRow}>
            {EXERCISE_EQUIPMENT.map((key) => {
              const selected = equipment.has(key);
              return (
                <Pressable
                  key={key}
                  onPress={() => toggleEquipment(key)}
                  style={[styles.chip, { borderColor: theme.backgroundSelected }, selected && styles.chipSelected]}>
                  <ThemedText type="small" style={selected ? styles.chipTextSelected : undefined}>
                    {titleCase(key)}
                  </ThemedText>
                </Pressable>
              );
            })}
          </View>

          <ThemedText type="smallBold" style={styles.fieldLabel}>
            Primary Muscles (optional, comma-separated)
          </ThemedText>
          <TextInput
            value={primaryMuscles}
            onChangeText={setPrimaryMuscles}
            placeholder="e.g. chest, shoulders"
            placeholderTextColor={theme.textSecondary}
            style={[styles.input, { color: theme.text, borderColor: theme.backgroundSelected }]}
          />

          <ThemedText type="smallBold" style={styles.fieldLabel}>
            Secondary Muscles (optional, comma-separated)
          </ThemedText>
          <TextInput
            value={secondaryMuscles}
            onChangeText={setSecondaryMuscles}
            placeholder="e.g. triceps"
            placeholderTextColor={theme.textSecondary}
            style={[styles.input, { color: theme.text, borderColor: theme.backgroundSelected }]}
          />

          <ThemedText type="smallBold" style={styles.fieldLabel}>
            Description (optional)
          </ThemedText>
          <TextInput
            value={description}
            onChangeText={setDescription}
            placeholder="A one-line summary of the movement"
            placeholderTextColor={theme.textSecondary}
            multiline
            style={[styles.input, styles.multilineInput, { color: theme.text, borderColor: theme.backgroundSelected }]}
          />

          <ThemedText type="smallBold" style={styles.fieldLabel}>
            Instructions (optional, one step per line)
          </ThemedText>
          <TextInput
            value={instructions}
            onChangeText={setInstructions}
            placeholder={'Set up in a staggered stance...\nPress the bar up and across...'}
            placeholderTextColor={theme.textSecondary}
            multiline
            style={[styles.input, styles.multilineInput, { color: theme.text, borderColor: theme.backgroundSelected }]}
          />

          <ThemedText type="smallBold" style={styles.fieldLabel}>
            YouTube Video Link (optional)
          </ThemedText>
          <TextInput
            value={videoUrl}
            onChangeText={setVideoUrl}
            placeholder="https://www.youtube.com/watch?v=..."
            autoCapitalize="none"
            keyboardType="url"
            placeholderTextColor={theme.textSecondary}
            style={[styles.input, { color: theme.text, borderColor: theme.backgroundSelected }]}
          />

          {error && <ThemedText style={styles.error}>{error}</ThemedText>}
        </ScrollView>

        <View style={styles.footer}>
          <Pressable style={styles.footerCancelButton} onPress={() => router.back()}>
            <ThemedText type="smallBold">Cancel</ThemedText>
          </Pressable>
          <Pressable
            style={[styles.submitButton, !canSubmit && styles.submitButtonDisabled]}
            onPress={handleSave}
            disabled={!canSubmit}>
            {saving ? (
              <ActivityIndicator size="small" color={Colors.text} />
            ) : (
              <ThemedText type="smallBold" style={{ color: Colors.text }}>
                {isEditing ? 'Save Changes' : 'Add to Library'}
              </ThemedText>
            )}
          </Pressable>
        </View>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  safeArea: { flex: 1 },
  loader: { marginTop: Spacing.five },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.two,
    paddingBottom: Spacing.three,
    borderBottomWidth: 1,
    borderBottomColor: Colors.backgroundSelected,
  },
  scrollContent: {
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.three,
    paddingBottom: Spacing.six,
  },
  fieldLabel: {
    marginTop: Spacing.three,
    marginBottom: Spacing.one,
  },
  input: {
    borderWidth: 1,
    borderRadius: Spacing.two,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    fontSize: 16,
  },
  multilineInput: {
    minHeight: 80,
    textAlignVertical: 'top',
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
    backgroundColor: Accent,
    borderColor: Accent,
  },
  chipTextSelected: {
    color: Colors.text,
    fontWeight: '700',
  },
  error: {
    color: Accent,
    marginTop: Spacing.three,
  },
  footer: {
    flexDirection: 'row',
    gap: Spacing.three,
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.three,
    borderTopWidth: 1,
    borderTopColor: Colors.backgroundSelected,
  },
  cancelButton: {
    alignItems: 'center',
    paddingVertical: Spacing.two,
  },
  footerCancelButton: {
    flex: 1,
    borderWidth: 1,
    borderColor: Colors.backgroundSelected,
    borderRadius: Spacing.two,
    paddingVertical: Spacing.three,
    alignItems: 'center',
  },
  submitButton: {
    flex: 1,
    ...Glow.oxblood,
    backgroundColor: Accent,
    borderRadius: Spacing.two,
    paddingVertical: Spacing.three,
    alignItems: 'center',
  },
  submitButtonDisabled: {
    opacity: 0.5,
  },
});
