import { Image } from 'expo-image';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Accent, Spacing } from '@/constants/theme';
import {
  addProgrammeWeek,
  getProgrammeDetail,
  GOAL_TYPES,
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

  const [programme, setProgramme] = useState<ProgrammeDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [addingWeek, setAddingWeek] = useState(false);

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

            <ThemedText type="title" style={styles.title}>
              {programme.name}
            </ThemedText>
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
