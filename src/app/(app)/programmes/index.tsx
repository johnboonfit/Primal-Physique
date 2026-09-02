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
import { archiveProgramme, duplicateProgramme, GOAL_TYPES, listProgrammes, type ProgrammeSummary } from '@/lib/programmes';

function goalLabel(goalType: ProgrammeSummary['goalType']) {
  return GOAL_TYPES.find((g) => g.key === goalType)?.label ?? goalType;
}

export default function ProgrammesListScreen() {
  const { session } = useAuth();
  const [programmes, setProgrammes] = useState<ProgrammeSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [duplicatingId, setDuplicatingId] = useState<string | null>(null);
  const [duplicateError, setDuplicateError] = useState<string | null>(null);

  const [archiveTarget, setArchiveTarget] = useState<ProgrammeSummary | null>(null);
  const [archiving, setArchiving] = useState(false);
  const [archiveError, setArchiveError] = useState<string | null>(null);

  const load = useCallback(() => {
    if (!session) return;
    setLoading(true);
    listProgrammes(session.user.id)
      .then((data) => setProgrammes(data))
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load programmes.'))
      .finally(() => setLoading(false));
  }, [session]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  // Every template stays exactly as it was — this creates a brand new,
  // fully independent set of rows and lands the coach on the copy so
  // they can rename it right away.
  const handleDuplicate = async (programmeId: string) => {
    if (!session) return;
    setDuplicateError(null);
    setDuplicatingId(programmeId);
    try {
      const newId = await duplicateProgramme(session.user.id, programmeId);
      router.push(`/programmes/${newId}`);
    } catch (err) {
      setDuplicateError(err instanceof Error ? err.message : 'Failed to duplicate that template.');
    } finally {
      setDuplicatingId(null);
    }
  };

  const handleConfirmArchive = async () => {
    if (!archiveTarget) return;
    setArchiveError(null);
    setArchiving(true);
    try {
      await archiveProgramme(archiveTarget.id);
      setArchiveTarget(null);
      load();
    } catch (err) {
      setArchiveError(err instanceof Error ? err.message : 'Failed to archive that template.');
    } finally {
      setArchiving(false);
    }
  };

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <ThemedView style={styles.header}>
          <ThemedText type="title">Template Library</ThemedText>
          <Pressable style={styles.newButton} onPress={() => router.push('/programmes/new')}>
            <ThemedText type="smallBold" style={styles.newButtonText}>
              + New
            </ThemedText>
          </Pressable>
        </ThemedView>
        <ThemedText themeColor="textSecondary" type="small" style={styles.subtitle}>
          Every programme you've built, ready to duplicate — none are tied to a client yet.
        </ThemedText>

        {!loading && !error && <HeroStat value={programmes.length} label="Templates Built" />}

        {loading && <ActivityIndicator style={styles.loader} />}

        {!loading && error && <ThemedText style={styles.error}>{error}</ThemedText>}

        {duplicateError && <ThemedText style={styles.error}>{duplicateError}</ThemedText>}

        {archiveError && <ThemedText style={styles.error}>{archiveError}</ThemedText>}

        {!loading && !error && programmes.length === 0 && (
          <ThemedText themeColor="textSecondary" style={styles.empty}>
            No templates yet. Tap + New to build your first multi-week programme.
          </ThemedText>
        )}

        {!loading && !error && programmes.length > 0 && (
          <FlatList
            data={programmes}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.listContent}
            renderItem={({ item }) => (
              <ThemedView type="backgroundElement" style={styles.card}>
                <Pressable onPress={() => router.push(`/programmes/${item.id}`)}>
                  <ThemedText type="smallBold">{item.name}</ThemedText>
                  <ThemedText type="small" themeColor="textSecondary">
                    {goalLabel(item.goalType)} · {item.durationWeeks}-week programme · {item.weekCount} week
                    {item.weekCount === 1 ? '' : 's'} built
                  </ThemedText>
                </Pressable>
                <View style={styles.cardActions}>
                  <Pressable onPress={() => router.push(`/programmes/assign/${item.id}`)}>
                    <ThemedText type="linkPrimary">Assign</ThemedText>
                  </Pressable>
                  <Pressable onPress={() => handleDuplicate(item.id)} disabled={duplicatingId === item.id}>
                    {duplicatingId === item.id ? (
                      <ActivityIndicator size="small" />
                    ) : (
                      <ThemedText type="linkPrimary">Duplicate</ThemedText>
                    )}
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
        title="Archive this template?"
        message={
          archiveTarget
            ? `"${archiveTarget.name}" will disappear from the Template Library and from the assign-a-programme picker. Any client already assigned this programme has their own independent copy, and it's untouched either way.`
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
  subtitle: {
    marginBottom: Spacing.three,
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
    gap: Spacing.two,
  },
  cardActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: Spacing.three,
  },
  archiveText: {
    color: Colors.textSecondary,
  },
  backButton: {
    alignItems: 'center',
    paddingVertical: Spacing.three,
  },
});
