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
import { archiveHabit, listCoachHabits, type HabitOption } from '@/lib/habits';

export default function HabitsListScreen() {
  const { session } = useAuth();
  const [habits, setHabits] = useState<HabitOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [archiveTarget, setArchiveTarget] = useState<HabitOption | null>(null);
  const [archiving, setArchiving] = useState(false);
  const [archiveError, setArchiveError] = useState<string | null>(null);

  const load = useCallback(() => {
    if (!session) return;
    setLoading(true);
    listCoachHabits(session.user.id)
      .then((data) => setHabits(data))
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load habits.'))
      .finally(() => setLoading(false));
  }, [session]);

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
      await archiveHabit(archiveTarget.id);
      setArchiveTarget(null);
      load();
    } catch (err) {
      setArchiveError(err instanceof Error ? err.message : 'Failed to archive that habit.');
    } finally {
      setArchiving(false);
    }
  };

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <ThemedView style={styles.header}>
          <ThemedText type="title">Habits</ThemedText>
          <Pressable style={styles.newButton} onPress={() => router.push('/habits/new')}>
            <ThemedText type="smallBold" style={styles.newButtonText}>
              + New
            </ThemedText>
          </Pressable>
        </ThemedView>

        {!loading && !error && <HeroStat value={habits.length} label="Habits Created" />}

        {loading && <ActivityIndicator style={styles.loader} />}

        {!loading && error && <ThemedText style={styles.error}>{error}</ThemedText>}

        {archiveError && <ThemedText style={styles.error}>{archiveError}</ThemedText>}

        {!loading && !error && habits.length === 0 && (
          <ThemedText themeColor="textSecondary" style={styles.empty}>
            No habits yet. Tap + New to add one for a client.
          </ThemedText>
        )}

        {!loading && !error && habits.length > 0 && (
          <FlatList
            data={habits}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.listContent}
            renderItem={({ item }) => (
              <ThemedView type="backgroundElement" style={styles.card}>
                <ThemedText type="smallBold">{item.name}</ThemedText>
                <ThemedText type="small" themeColor="textSecondary">
                  {item.clientEmail}
                </ThemedText>
                <View style={styles.cardActions}>
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
        title="Archive this habit?"
        message={
          archiveTarget
            ? `"${archiveTarget.name}" will disappear from ${archiveTarget.clientEmail}'s daily checklist and from this list. Everything they've already logged for it stays exactly as it is.`
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
  },
  archiveText: {
    color: Colors.textSecondary,
  },
  backButton: {
    alignItems: 'center',
    paddingVertical: Spacing.three,
  },
});
