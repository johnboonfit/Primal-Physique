import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, TextInput } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Accent, Colors, Glow, Spacing } from '@/constants/theme';
import { useAuth } from '@/context/auth-context';
import { useTheme } from '@/hooks/use-theme';
import {
  createAssignment,
  listClientOptions,
  listCoachWorkoutOptions,
  type ClientOption,
  type WorkoutOption,
} from '@/lib/assignments';

function todayISODate() {
  return new Date().toISOString().slice(0, 10);
}

export default function NewAssignmentScreen() {
  const theme = useTheme();
  const { session } = useAuth();

  const [workouts, setWorkouts] = useState<WorkoutOption[]>([]);
  const [clients, setClients] = useState<ClientOption[]>([]);
  const [loadingOptions, setLoadingOptions] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [workoutId, setWorkoutId] = useState<string | null>(null);
  const [clientId, setClientId] = useState<string | null>(null);
  const [assignedDate, setAssignedDate] = useState(todayISODate());

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!session) return;
    let cancelled = false;

    Promise.all([listCoachWorkoutOptions(session.user.id), listClientOptions()])
      .then(([workoutOptions, clientOptions]) => {
        if (cancelled) return;
        setWorkouts(workoutOptions);
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
  }, [session]);

  const handleSave = async () => {
    setError(null);
    if (!session) return;

    if (!workoutId) {
      setError('Pick a workout.');
      return;
    }
    if (!clientId) {
      setError('Pick a client.');
      return;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(assignedDate)) {
      setError('Enter the date as YYYY-MM-DD.');
      return;
    }

    setSaving(true);
    try {
      await createAssignment(session.user.id, workoutId, clientId, assignedDate);
      router.replace('/assignments');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong saving the assignment.');
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
            New assignment
          </ThemedText>

          {loadError && <ThemedText style={styles.error}>{loadError}</ThemedText>}

          {!loadError && workouts.length === 0 && (
            <ThemedText themeColor="textSecondary">
              You don&apos;t have any workouts yet. Create one first from My Workouts.
            </ThemedText>
          )}

          {!loadError && clients.length === 0 && (
            <ThemedText themeColor="textSecondary">There are no client accounts yet.</ThemedText>
          )}

          {workouts.length > 0 && (
            <>
              <ThemedText type="smallBold" style={styles.sectionLabel}>
                Workout
              </ThemedText>
              {workouts.map((workout) => {
                const selected = workout.id === workoutId;
                return (
                  <Pressable key={workout.id} onPress={() => setWorkoutId(workout.id)}>
                    <ThemedView
                      type="backgroundElement"
                      style={[styles.optionRow, selected && styles.optionRowSelected]}>
                      <ThemedText type={selected ? 'smallBold' : 'default'}>{workout.name}</ThemedText>
                    </ThemedView>
                  </Pressable>
                );
              })}
            </>
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

          <ThemedText type="smallBold" style={styles.sectionLabel}>
            Date
          </ThemedText>
          <TextInput
            value={assignedDate}
            onChangeText={setAssignedDate}
            placeholder="YYYY-MM-DD"
            placeholderTextColor={theme.textSecondary}
            style={[styles.input, { color: theme.text, borderColor: theme.backgroundSelected }]}
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
                Save assignment
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
  scrollContent: {
    padding: Spacing.four,
    gap: Spacing.two,
  },
  title: {
    marginBottom: Spacing.two,
  },
  sectionLabel: {
    marginTop: Spacing.three,
  },
  optionRow: {
    borderWidth: 1,
    borderColor: 'transparent',
    borderRadius: Spacing.two,
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.three,
    marginTop: Spacing.half,
  },
  optionRowSelected: {
    borderColor: Accent,
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
  primaryButton: {
    ...Glow.oxblood,
    backgroundColor: Accent,
    borderRadius: Spacing.two,
    paddingVertical: Spacing.three,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: Spacing.three,
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
