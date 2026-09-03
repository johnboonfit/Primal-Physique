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
import { deleteMealPlanTemplate, listMealPlanTemplates, type MealPlanTemplateSummary } from '@/lib/meal-plans';
import { GOAL_TYPES } from '@/lib/programmes';

function goalLabel(goalType: MealPlanTemplateSummary['goalType']) {
  return GOAL_TYPES.find((g) => g.key === goalType)?.label ?? goalType;
}

export default function MealPlansListScreen() {
  const { session } = useAuth();
  const [templates, setTemplates] = useState<MealPlanTemplateSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [deleteTarget, setDeleteTarget] = useState<MealPlanTemplateSummary | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const load = useCallback(() => {
    if (!session) return;
    setLoading(true);
    listMealPlanTemplates(session.user.id)
      .then(setTemplates)
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load meal plan templates.'))
      .finally(() => setLoading(false));
  }, [session]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const handleConfirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleteError(null);
    setDeleting(true);
    try {
      await deleteMealPlanTemplate(deleteTarget.id);
      setDeleteTarget(null);
      load();
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : 'Failed to delete that template.');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <ThemedView style={styles.header}>
          <ThemedText type="title">Meal Plan Templates</ThemedText>
          <Pressable style={styles.newButton} onPress={() => router.push('/meal-plans/new')}>
            <ThemedText type="smallBold" style={styles.newButtonText}>
              + New
            </ThemedText>
          </Pressable>
        </ThemedView>
        <ThemedText themeColor="textSecondary" type="small" style={styles.subtitle}>
          A day of eating built from Recipe Builder recipes -- assign one to a client and it scales to their real
          calorie target automatically.
        </ThemedText>

        {!loading && !error && <HeroStat value={templates.length} label="Templates Built" />}

        {loading && <ActivityIndicator style={styles.loader} />}
        {!loading && error && <ThemedText style={styles.error}>{error}</ThemedText>}
        {deleteError && <ThemedText style={styles.error}>{deleteError}</ThemedText>}

        {!loading && !error && templates.length === 0 && (
          <ThemedText themeColor="textSecondary" style={styles.empty}>
            No meal plan templates yet. Tap + New to build your first one.
          </ThemedText>
        )}

        {!loading && !error && templates.length > 0 && (
          <FlatList
            data={templates}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.listContent}
            renderItem={({ item }) => (
              <ThemedView type="backgroundElement" style={styles.card}>
                <Pressable onPress={() => router.push(`/meal-plans/${item.id}`)}>
                  <ThemedText type="smallBold">{item.name}</ThemedText>
                  <ThemedText type="small" themeColor="textSecondary">
                    {goalLabel(item.goalType)} · {item.itemCount} recipe{item.itemCount === 1 ? '' : 's'}
                  </ThemedText>
                  <ThemedText type="small" themeColor="textSecondary">
                    {item.itemCount === 0 ? '--' : Math.round(item.totalCalories)} kcal baseline ·{' '}
                    {item.actualProteinPercent}/{item.actualCarbPercent}/{item.actualFatPercent} actual (target{' '}
                    {item.targetProteinPercent}/{item.targetCarbPercent}/{item.targetFatPercent})
                  </ThemedText>
                </Pressable>
                <View style={styles.cardActions}>
                  <Pressable onPress={() => router.push(`/meal-plans/assign/${item.id}`)}>
                    <ThemedText type="linkPrimary">Assign</ThemedText>
                  </Pressable>
                  <Pressable onPress={() => setDeleteTarget(item)}>
                    <ThemedText type="small" style={styles.deleteText}>
                      Delete
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
        visible={deleteTarget !== null}
        title="Delete this template?"
        message={
          deleteTarget
            ? `"${deleteTarget.name}" will be removed. Any client already assigned it keeps nothing frozen -- their assignment record would be deleted along with it.`
            : ''
        }
        confirmLabel="Delete"
        busy={deleting}
        onConfirm={handleConfirmDelete}
        onCancel={() => setDeleteTarget(null)}
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
  deleteText: {
    color: Colors.textSecondary,
  },
  backButton: {
    alignItems: 'center',
    paddingVertical: Spacing.three,
  },
});
