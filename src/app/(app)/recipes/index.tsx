import { Image } from 'expo-image';
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
import { deleteRecipe, listRecipes, type RecipeSummary } from '@/lib/recipes';

export default function RecipesListScreen() {
  const { session } = useAuth();
  const [recipes, setRecipes] = useState<RecipeSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [deleteTarget, setDeleteTarget] = useState<RecipeSummary | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const load = useCallback(() => {
    if (!session) return;
    setLoading(true);
    listRecipes(session.user.id)
      .then(setRecipes)
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load your recipes.'))
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
      await deleteRecipe(deleteTarget.id, deleteTarget.photoStoragePath);
      setDeleteTarget(null);
      load();
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : 'Failed to delete that recipe.');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <ThemedView style={styles.header}>
          <ThemedText type="title">Recipe Builder</ThemedText>
          <Pressable style={styles.newButton} onPress={() => router.push('/recipes/new')}>
            <ThemedText type="smallBold" style={styles.newButtonText}>
              + New
            </ThemedText>
          </Pressable>
        </ThemedView>
        <ThemedText themeColor="textSecondary" type="small" style={styles.subtitle}>
          Reusable recipes built from real ingredient data -- macros per serving are always calculated from the
          ingredients, never typed in by hand.
        </ThemedText>

        {!loading && !error && <HeroStat value={recipes.length} label="Recipes Built" />}

        {loading && <ActivityIndicator style={styles.loader} />}

        {!loading && error && <ThemedText style={styles.error}>{error}</ThemedText>}

        {deleteError && <ThemedText style={styles.error}>{deleteError}</ThemedText>}

        {!loading && !error && recipes.length === 0 && (
          <ThemedText themeColor="textSecondary" style={styles.empty}>
            No recipes yet. Tap + New to build your first one.
          </ThemedText>
        )}

        {!loading && !error && recipes.length > 0 && (
          <FlatList
            data={recipes}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.listContent}
            renderItem={({ item }) => (
              <ThemedView type="backgroundElement" style={styles.card}>
                <Pressable onPress={() => router.push(`/recipes/${item.id}`)} style={styles.cardTouchable}>
                  {item.photoUrl ? (
                    <Image source={{ uri: item.photoUrl }} style={styles.thumb} contentFit="cover" />
                  ) : (
                    <View style={[styles.thumb, styles.thumbPlaceholder]}>
                      <ThemedText type="small" themeColor="textSecondary">
                        No photo
                      </ThemedText>
                    </View>
                  )}
                  <View style={styles.cardInfo}>
                    <ThemedText type="smallBold">{item.name}</ThemedText>
                    <ThemedText type="small" themeColor="textSecondary">
                      {item.servings} serving{item.servings === 1 ? '' : 's'} · {item.ingredientCount} ingredient
                      {item.ingredientCount === 1 ? '' : 's'}
                    </ThemedText>
                    <ThemedText type="small" themeColor="textSecondary">
                      {item.ingredientCount === 0 ? '--' : Math.round(item.caloriesPerServing)} cal/serving
                    </ThemedText>
                    {item.tags.length > 0 && (
                      <ThemedText type="small" themeColor="textSecondary">
                        {item.tags.join(' · ')}
                      </ThemedText>
                    )}
                  </View>
                </Pressable>
                <Pressable onPress={() => setDeleteTarget(item)} style={styles.deleteButton}>
                  <ThemedText type="small" style={styles.deleteText}>
                    Delete
                  </ThemedText>
                </Pressable>
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
        title="Delete this recipe?"
        message={deleteTarget ? `"${deleteTarget.name}" and its ingredient list will be permanently removed.` : ''}
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
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: Spacing.two,
    padding: Spacing.three,
    gap: Spacing.two,
  },
  cardTouchable: {
    flex: 1,
    flexDirection: 'row',
    gap: Spacing.three,
    alignItems: 'center',
  },
  thumb: {
    width: 56,
    height: 56,
    borderRadius: Spacing.one,
    backgroundColor: Colors.backgroundSelected,
  },
  thumbPlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardInfo: {
    flex: 1,
    gap: Spacing.half,
  },
  deleteButton: {
    paddingHorizontal: Spacing.two,
  },
  deleteText: {
    color: Colors.textSecondary,
  },
  backButton: {
    alignItems: 'center',
    paddingVertical: Spacing.three,
  },
});
