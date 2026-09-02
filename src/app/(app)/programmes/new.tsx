import { router } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Accent, Colors, Glow, Spacing } from '@/constants/theme';
import { useAuth } from '@/context/auth-context';
import { useTheme } from '@/hooks/use-theme';
import {
  createProgramme,
  GOAL_TYPES,
  SCHEDULED_DAYS,
  type GoalType,
  type ScheduledDay,
} from '@/lib/programmes';

export default function NewProgrammeScreen() {
  const theme = useTheme();
  const { session } = useAuth();

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [coverImageUrl, setCoverImageUrl] = useState('');
  const [goalType, setGoalType] = useState<GoalType>('cutting');
  const [durationWeeks, setDurationWeeks] = useState('8');
  const [scheduledDays, setScheduledDays] = useState<Set<ScheduledDay>>(new Set());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const toggleDay = (day: ScheduledDay) => {
    setScheduledDays((current) => {
      const next = new Set(current);
      if (next.has(day)) {
        next.delete(day);
      } else {
        next.add(day);
      }
      return next;
    });
  };

  const handleSave = async () => {
    setError(null);
    if (!session) return;

    const trimmedName = name.trim();
    if (!trimmedName) {
      setError('Give the programme a name.');
      return;
    }

    const parsedWeeks = Number(durationWeeks);
    if (!durationWeeks.trim() || !Number.isInteger(parsedWeeks) || parsedWeeks < 1 || parsedWeeks > 52) {
      setError('Duration must be a whole number of weeks, 1–52.');
      return;
    }

    setSaving(true);
    try {
      const programmeId = await createProgramme(session.user.id, {
        name: trimmedName,
        description: description.trim(),
        coverImageUrl: coverImageUrl.trim(),
        goalType,
        durationWeeks: parsedWeeks,
        scheduledDays: Array.from(scheduledDays),
      });
      router.replace(`/programmes/${programmeId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong saving the programme.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
          <ThemedText type="title" style={styles.title}>
            New programme
          </ThemedText>

          <TextInput
            value={name}
            onChangeText={setName}
            placeholder="Programme name (e.g. 12-Week Cut)"
            placeholderTextColor={theme.textSecondary}
            style={[styles.input, { color: theme.text, borderColor: theme.backgroundSelected }]}
          />

          <TextInput
            value={description}
            onChangeText={setDescription}
            placeholder="Description (optional)"
            placeholderTextColor={theme.textSecondary}
            multiline
            numberOfLines={3}
            style={[styles.input, styles.multilineInput, { color: theme.text, borderColor: theme.backgroundSelected }]}
          />

          <TextInput
            value={coverImageUrl}
            onChangeText={setCoverImageUrl}
            placeholder="Cover image URL (optional)"
            placeholderTextColor={theme.textSecondary}
            autoCapitalize="none"
            autoCorrect={false}
            style={[styles.input, { color: theme.text, borderColor: theme.backgroundSelected }]}
          />

          <ThemedText type="smallBold" style={styles.sectionLabel}>
            Goal type
          </ThemedText>
          <View style={styles.chipRow}>
            {GOAL_TYPES.map(({ key, label }) => {
              const selected = goalType === key;
              return (
                <Pressable
                  key={key}
                  onPress={() => setGoalType(key)}
                  style={[
                    styles.chip,
                    { borderColor: theme.backgroundSelected },
                    selected && styles.chipSelected,
                  ]}>
                  <ThemedText type="small" style={selected ? styles.chipTextSelected : undefined}>
                    {label}
                  </ThemedText>
                </Pressable>
              );
            })}
          </View>

          <TextInput
            value={durationWeeks}
            onChangeText={setDurationWeeks}
            placeholder="Duration in weeks"
            placeholderTextColor={theme.textSecondary}
            keyboardType="numeric"
            style={[styles.input, styles.durationInput, { color: theme.text, borderColor: theme.backgroundSelected }]}
          />

          <ThemedText type="smallBold" style={styles.sectionLabel}>
            Scheduled training days (optional)
          </ThemedText>
          <View style={styles.chipRow}>
            {SCHEDULED_DAYS.map(({ key, label }) => {
              const selected = scheduledDays.has(key);
              return (
                <Pressable
                  key={key}
                  onPress={() => toggleDay(key)}
                  style={[
                    styles.chip,
                    { borderColor: theme.backgroundSelected },
                    selected && styles.chipSelected,
                  ]}>
                  <ThemedText type="small" style={selected ? styles.chipTextSelected : undefined}>
                    {label}
                  </ThemedText>
                </Pressable>
              );
            })}
          </View>

          {error && <ThemedText style={styles.error}>{error}</ThemedText>}

          <Pressable
            style={({ pressed }) => [styles.primaryButton, pressed && styles.pressed]}
            onPress={handleSave}
            disabled={saving}>
            {saving ? (
              <ActivityIndicator color={Colors.text} />
            ) : (
              <ThemedText type="smallBold" style={styles.primaryButtonText}>
                Create programme
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
    minHeight: 80,
    textAlignVertical: 'top',
  },
  durationInput: {
    maxWidth: 160,
  },
  sectionLabel: {
    marginTop: Spacing.two,
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
