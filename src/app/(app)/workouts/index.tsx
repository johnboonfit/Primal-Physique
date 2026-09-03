import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ConfirmDialog } from '@/components/confirm-dialog';
import { HeroStat } from '@/components/hero-stat';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Accent, Colors, Glow, Spacing } from '@/constants/theme';
import { useAuth } from '@/context/auth-context';
import { archiveWorkout, listWorkouts, type WorkoutSummary } from '@/lib/workouts';

export default function WorkoutsListScreen() {
  const { session } = useAuth();
  const [workouts, setWorkouts] = useState<WorkoutSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [archiveTarget, setArchiveTarget] = useState<WorkoutSummary | null>(null);
  const [archiving, setArchiving] = useState(false);
  const [archiveError, setArchiveError] = useState<string | null>(null);

  const load = useCallback(() => {
    if (!session) return;
    setLoading(true);
    listWorkouts(session.user.id)
      .then((data) => setWorkouts(data))
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load workouts.'))
      .finally(() => setLoading(false));
  }, [session]);

  // Refetch every time this screen comes into focus (not just on first
  // mount), so a workout you just saved shows up immediately when you
  // navigate back to this list.
  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const handleConfirmArchive = async () => {
    if (!archiveTarget) return;
    setArchiveError(null);
    setArchiving(true);
    try {
      await archiveWorkout(archiveTarget.id);
      setArchiveTarget(null);
      load();
    } catch (err) {
      setArchiveError(err instanceof Error ? err.message : 'Failed to archive that workout.');
    } finally {
      setArchiving(false);
    }
  };

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <ThemedView style={styles.header}>
          <ThemedText type="title">My Workouts</ThemedText>
          <Pressable style={styles.newButton} onPress={() => router.push('/workouts/new')}>
            <ThemedText type="smallBold" style={styles.newButtonText}>
              + New
            </ThemedText>
          </Pressable>
        </ThemedView>

        {!loading && !error && <HeroStat value={workouts.length} label="Workouts Created" />}

        {loading && <ActivityIndicator style={styles.loader} />}

        {!loading && error && <ThemedText style={styles.error}>{error}</ThemedText>}

        {archiveError && <ThemedText style={styles.error}>{archiveError}</ThemedText>}

        {!loading && !error && workouts.length === 0 && (
          <ThemedText themeColor="textSecondary" style={styles.empty}>
            No workouts yet. Tap + New to create your first one.
          </ThemedText>
        )}

        {!loading && !error && workouts.length > 0 && (
          <FlatList
            data={workouts}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.listContent}
            renderItem={({ item }) => (
              <ThemedView type="backgroundElement" style={styles.card}>
                <ThemedText type="smallBold">{item.name}</ThemedText>
                <ThemedText type="small" themeColor="textSecondary">
                  {item.exerciseCount} exercise{item.exerciseCount === 1 ? '' : 's'}
                </ThemedText>
                <View style={styles.cardActions}>
                  <Pressable onPress={() => router.push(`/workouts/${item.id}`)}>
                    <ThemedText type="small" style={styles.editText}>
                      Edit
                    </ThemedText>
                  </Pressable>
                  <Pressable onPress={() => setArchiveTarget(item)}>
                    <ThemedText type="small" style={styles.archiveText}>
                      Archive
                    </ThemedText>
                  </Pressable>
                </View>
              </ThemedView>
            )}
          />
        )}

        <Pressable style={styles.backButton} onPress={() => router.replace('/home')}>
          <ThemedText type="linkPrimary">Back to home</ThemedText>
        </Pressable>
      </SafeAreaView>

      <ConfirmDialog
        visible={archiveTarget !== null}
        title="Archive this workout?"
        message={
          archiveTarget
            ? `"${archiveTarget.name}" will disappear from My Workouts and from the workout picker when assigning something new. Every existing assignment and logged set for it stays exactly as it is.`
            : ''
        }
        confirmLabel="Archive"
        busy={archiving}
        onConfirm={handleConfirmArchive}
        onCancel={() => setArchiveTarget(null)}
      />
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  safeArea: { flex: 1, paddingHorizontal: Spacing.four, paddingTop: Spacing.four },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.three,
  },
  newButton: {
    ...Glow.oxblood,
    backgroundColor: Accent,
    borderRadius: Spacing.two,
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.three,
  },
  newButtonText: {
    color: Colors.text,
  },
  loader: {
    marginTop: Spacing.five,
  },
  error: {
    color: Accent,
    textAlign: 'center',
    marginTop: Spacing.five,
  },
  empty: {
    textAlign: 'center',
    marginTop: Spacing.five,
  },
  listContent: {
    gap: Spacing.two,
    paddingBottom: Spacing.four,
  },
  card: {
    borderRadius: Spacing.two,
    padding: Spacing.three,
    gap: Spacing.half,
  },
  cardActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: Spacing.three,
  },
  editText: {
    color: Accent,
  },
  archiveText: {
    color: Colors.textSecondary,
  },
  backButton: {
    alignItems: 'center',
    paddingVertical: Spacing.three,
  },
});
