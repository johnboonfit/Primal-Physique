import { Image } from 'expo-image';
import { router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Accent, Colors, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import {
  getExerciseDetail,
  listExerciseLibrarySummaries,
  MUSCLE_GROUPS,
  type ExerciseDetail,
  type ExerciseSummary,
  type MuscleGroup,
} from '@/lib/exercise-library';

function titleCase(word: string) {
  return word.charAt(0).toUpperCase() + word.slice(1);
}

export default function ExerciseLibraryScreen() {
  const theme = useTheme();

  const [exercises, setExercises] = useState<ExerciseSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [search, setSearch] = useState('');
  const [muscleGroup, setMuscleGroup] = useState<MuscleGroup | 'all'>('all');

  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [details, setDetails] = useState<Record<string, ExerciseDetail>>({});
  const [detailLoadingId, setDetailLoadingId] = useState<string | null>(null);
  const [detailError, setDetailError] = useState<string | null>(null);

  // This is a one-time-imported reference table, not something that
  // changes while browsing it — fetched once on mount rather than
  // refetched every time this screen comes back into focus.
  useEffect(() => {
    let cancelled = false;

    listExerciseLibrarySummaries()
      .then((data) => {
        if (!cancelled) setExercises(data);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load the exercise library.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return exercises.filter((exercise) => {
      if (muscleGroup !== 'all' && exercise.muscleGroup !== muscleGroup) return false;
      if (query && !exercise.name.toLowerCase().includes(query)) return false;
      return true;
    });
  }, [exercises, search, muscleGroup]);

  const handleToggle = async (id: string) => {
    if (expandedId === id) {
      setExpandedId(null);
      return;
    }
    setExpandedId(id);
    if (details[id]) return;

    setDetailError(null);
    setDetailLoadingId(id);
    try {
      const detail = await getExerciseDetail(id);
      setDetails((current) => ({ ...current, [id]: detail }));
    } catch (err) {
      setDetailError(err instanceof Error ? err.message : 'Failed to load this exercise.');
    } finally {
      setDetailLoadingId(null);
    }
  };

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.header}>
          <ThemedText type="title">Exercise Library</ThemedText>
          <Pressable onPress={() => router.replace('/home')}>
            <ThemedText type="linkPrimary">Back</ThemedText>
          </Pressable>
        </View>

        <TextInput
          value={search}
          onChangeText={setSearch}
          placeholder="Search by name"
          placeholderTextColor={theme.textSecondary}
          style={[styles.input, { color: theme.text, borderColor: theme.backgroundSelected }]}
        />

        <View style={styles.chipRow}>
          <Pressable
            onPress={() => setMuscleGroup('all')}
            style={[styles.chip, { borderColor: theme.backgroundSelected }, muscleGroup === 'all' && styles.chipSelected]}>
            <ThemedText type="small" style={muscleGroup === 'all' ? styles.chipTextSelected : undefined}>
              All
            </ThemedText>
          </Pressable>
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

        {!loading && !error && (
          <ThemedText type="small" themeColor="textSecondary" style={styles.countLabel}>
            {filtered.length} of {exercises.length} exercises
          </ThemedText>
        )}

        {loading && <ActivityIndicator style={styles.loader} />}
        {!loading && error && <ThemedText style={styles.error}>{error}</ThemedText>}
        {!loading && !error && filtered.length === 0 && (
          <ThemedText themeColor="textSecondary" style={styles.empty}>
            No exercises match that search.
          </ThemedText>
        )}

        {!loading && !error && filtered.length > 0 && (
          <FlatList
            data={filtered}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.listContent}
            renderItem={({ item }) => {
              const expanded = expandedId === item.id;
              const detail = details[item.id];
              return (
                <Pressable onPress={() => handleToggle(item.id)}>
                  <ThemedView type="backgroundElement" style={styles.card}>
                    <View style={styles.cardHeaderRow}>
                      <ThemedText type="smallBold" style={styles.cardName}>
                        {item.name}
                      </ThemedText>
                      <ThemedText type="small" style={styles.muscleGroupBadge}>
                        {titleCase(item.muscleGroup)}
                      </ThemedText>
                    </View>
                    <ThemedText type="small" themeColor="textSecondary">
                      {item.equipment.map(titleCase).join(', ') || 'No equipment'}
                    </ThemedText>

                    {expanded && (
                      <View style={styles.detailSection}>
                        {detailLoadingId === item.id && <ActivityIndicator style={styles.detailLoader} />}
                        {detailError && detailLoadingId !== item.id && !detail && (
                          <ThemedText style={styles.error}>{detailError}</ThemedText>
                        )}
                        {detail && (
                          <>
                            {detail.imageUrls.length > 0 && (
                              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.imageRow}>
                                {detail.imageUrls.map((url) => (
                                  <Image key={url} source={{ uri: url }} style={styles.exerciseImage} contentFit="cover" />
                                ))}
                              </ScrollView>
                            )}
                            {detail.description && (
                              <ThemedText type="small" themeColor="textSecondary">
                                {detail.description}
                              </ThemedText>
                            )}
                            {detail.instructions.map((step, index) => (
                              <ThemedText key={index} type="small" style={styles.instructionStep}>
                                {index + 1}. {step}
                              </ThemedText>
                            ))}
                            {detail.instructions.length === 0 && (
                              <ThemedText type="small" themeColor="textSecondary">
                                No instructions recorded for this exercise.
                              </ThemedText>
                            )}
                            <ThemedText type="small" themeColor="textSecondary" style={styles.attribution}>
                              {detail.attribution}
                            </ThemedText>
                          </>
                        )}
                      </View>
                    )}
                  </ThemedView>
                </Pressable>
              );
            }}
          />
        )}
      </SafeAreaView>
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
  input: {
    borderWidth: 1,
    borderRadius: Spacing.two,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.three,
    fontSize: 16,
    marginBottom: Spacing.two,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
    marginBottom: Spacing.two,
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
  countLabel: {
    marginBottom: Spacing.two,
  },
  loader: {
    marginTop: Spacing.five,
  },
  error: {
    color: Accent,
    textAlign: 'center',
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
  cardHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: Spacing.two,
  },
  cardName: {
    flex: 1,
  },
  muscleGroupBadge: {
    color: Colors.tealBright,
  },
  detailSection: {
    marginTop: Spacing.two,
    gap: Spacing.two,
    borderTopWidth: 1,
    borderTopColor: Colors.backgroundSelected,
    paddingTop: Spacing.two,
  },
  detailLoader: {
    marginVertical: Spacing.two,
  },
  imageRow: {
    marginBottom: Spacing.two,
  },
  exerciseImage: {
    width: 160,
    height: 160,
    borderRadius: Spacing.two,
    marginRight: Spacing.two,
  },
  instructionStep: {
    lineHeight: 20,
  },
  attribution: {
    fontStyle: 'italic',
    marginTop: Spacing.two,
  },
});
