import { Image } from 'expo-image';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Accent, Colors, Glow, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import {
  addProgrammeWeek,
  getProgrammeDetail,
  GOAL_TYPES,
  updateProgrammeName,
  type ProgrammeDetail,
} from '@/lib/programmes';

function goalLabel(goalType: ProgrammeDetail['goalType']) {
  return GOAL_TYPES.find((g) => g.key === goalType)?.label ?? goalType;
}

function dayLabel(day: string) {
  return day.charAt(0).toUpperCase() + day.slice(1);
}

export default function ProgrammeDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const theme = useTheme();

  const [programme, setProgramme] = useState<ProgrammeDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [addingWeek, setAddingWeek] = useState(false);

  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState('');
  const [savingName, setSavingName] = useState(false);

  const load = useCallback(() => {
    if (!id) return;
    setLoading(true);
    getProgrammeDetail(id)
      .then(setProgramme)
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load this programme.'))
      .finally(() => setLoading(false));
  }, [id]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  // Keeps the draft in sync with whatever's actually saved, but only
  // while the coach isn't mid-edit — otherwise a background refetch
  // (e.g. from useFocusEffect) would stomp on text they're still typing.
  useEffect(() => {
    if (programme && !editingName) setNameDraft(programme.name);
  }, [programme, editingName]);

  const handleSaveName = async () => {
    if (!programme) return;
    const trimmed = nameDraft.trim();
    if (!trimmed) return;

    setSavingName(true);
    try {
      await updateProgrammeName(programme.id, trimmed);
      setEditingName(false);
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to rename this programme.');
    } finally {
      setSavingName(false);
    }
  };

  const handleAddWeek = async () => {
    if (!programme) return;
    setAddingWeek(true);
    try {
      const nextWeekNumber = programme.weeks.length + 1;
      await addProgrammeWeek(programme.id, nextWeekNumber);
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add a week.');
    } finally {
      setAddingWeek(false);
    }
  };

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <Pressable onPress={() => router.back()} style={styles.backButton}>
          <ThemedText type="linkPrimary">Back</ThemedText>
        </Pressable>

        {loading && <ActivityIndicator style={styles.loader} />}

        {!loading && error && <ThemedText style={styles.error}>{error}</ThemedText>}

        {!loading && programme && (
          <>
            {programme.coverImageUrl ? (
              <Image source={{ uri: programme.coverImageUrl }} style={styles.coverImage} contentFit="cover" />
            ) : (
              <ThemedView type="backgroundElement" style={[styles.coverImage, styles.coverPlaceholder]}>
                <ThemedText themeColor="textSecondary" type="small">
                  No cover image
                </ThemedText>
              </ThemedView>
            )}

            {editingName ? (
              <View style={styles.renameRow}>
                <TextInput
                  value={nameDraft}
                  onChangeText={setNameDraft}
                  autoFocus
                  style={[styles.renameInput, { color: theme.text, borderColor: theme.backgroundSelected }]}
                />
                <Pressable
                  style={[styles.renameSaveButton, savingName && styles.pressed]}
                  onPress={handleSaveName}
                  disabled={savingName}>
                  {savingName ? (
                    <ActivityIndicator size="small" color={Colors.text} />
                  ) : (
                    <ThemedText type="smallBold" style={styles.renameSaveText}>
                      Save
                    </ThemedText>
                  )}
                </Pressable>
                <Pressable
                  onPress={() => {
                    setEditingName(false);
                    setNameDraft(programme.name);
                  }}>
                  <ThemedText themeColor="textSecondary">Cancel</ThemedText>
                </Pressable>
              </View>
            ) : (
              <Pressable onPress={() => setEditingName(true)}>
                <ThemedText type="title" style={styles.title}>
                  {programme.name}
                </ThemedText>
                <ThemedText type="small" themeColor="textSecondary">
                  Tap to rename
                </ThemedText>
              </Pressable>
            )}
            <ThemedText themeColor="textSecondary" style={styles.meta}>
              {goalLabel(programme.goalType)} · {programme.durationWeeks} week
              {programme.durationWeeks === 1 ? '' : 's'}
              {programme.scheduledDays.length > 0 && ` · ${programme.scheduledDays.map(dayLabel).join('/')}`}
            </ThemedText>

            {programme.description && (
              <ThemedText themeColor="textSecondary" style={styles.description}>
                {programme.description}
              </ThemedText>
            )}

            <View style={styles.sectionHeaderRow}>
              <ThemedText type="smallBold">Weeks</ThemedText>
              <Pressable onPress={handleAddWeek} disabled={addingWeek}>
                {addingWeek ? (
                  <ActivityIndicator size="small" />
                ) : (
                  <ThemedText type="linkPrimary">+ Add week</ThemedText>
                )}
              </Pressable>
            </View>

            <FlatList
              data={programme.weeks}
              keyExtractor={(item) => item.id}
              scrollEnabled={false}
              contentContainerStyle={styles.listContent}
              renderItem={({ item }) => (
                <Pressable onPress={() => router.push(`/programmes/week/${item.id}`)}>
                  <ThemedView type="backgroundElement" style={styles.weekCard}>
                    <ThemedText type="smallBold">Week {item.weekNumber}</ThemedText>
                    <ThemedText type="small" themeColor="textSecondary">
                      {item.workoutCount} session{item.workoutCount === 1 ? '' : 's'}
                    </ThemedText>
                  </ThemedView>
                </Pressable>
              )}
            />
          </>
        )}
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  safeArea: { flex: 1, paddingHorizontal: Spacing.four, paddingTop: Spacing.four },
  backButton: {
    marginBottom: Spacing.two,
  },
  loader: {
    marginTop: Spacing.five,
  },
  error: {
    color: Accent,
    textAlign: 'center',
    marginTop: Spacing.five,
  },
  coverImage: {
    width: '100%',
    height: 160,
    borderRadius: Spacing.two,
    marginBottom: Spacing.three,
  },
  coverPlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: 32,
    lineHeight: 38,
  },
  renameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  renameInput: {
    flex: 1,
    borderWidth: 1,
    borderRadius: Spacing.two,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    fontSize: 20,
  },
  renameSaveButton: {
    ...Glow.oxblood,
    backgroundColor: Accent,
    borderRadius: Spacing.two,
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.three,
  },
  pressed: {
    opacity: 0.85,
  },
  renameSaveText: {
    color: Colors.text,
  },
  meta: {
    marginTop: Spacing.half,
  },
  description: {
    marginTop: Spacing.two,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: Spacing.four,
    marginBottom: Spacing.two,
  },
  listContent: {
    gap: Spacing.two,
    paddingBottom: Spacing.four,
  },
  weekCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderRadius: Spacing.two,
    padding: Spacing.three,
  },
});
