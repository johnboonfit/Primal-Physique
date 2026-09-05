import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Linking, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Accent, Colors, Glow, Spacing } from '@/constants/theme';
import { useAuth } from '@/context/auth-context';
import {
  deleteResourceItem,
  listClientResourceLibrary,
  listCoachResourceLibrary,
  type ResourceItem,
  type ResourceSection,
} from '@/lib/resources';

const TYPE_ICON: Record<ResourceItem['type'], string> = { file: '📄', link: '🔗' };

/**
 * Shared by both audiences, same pattern as challenges/index.tsx: a
 * coach sees every item they've created, grouped by folder, with a
 * "+ New" link and Delete on each row; a client sees the same
 * folder-grouped layout but only the items they're actually eligible
 * for (resource_items' own RLS via is_eligible_for_resource_item()
 * already did that filtering — this screen doesn't re-check it), and no
 * Delete action.
 */
export default function ResourceLibraryScreen() {
  const { session, profile } = useAuth();
  const isCoach = profile?.role === 'coach';

  const [sections, setSections] = useState<ResourceSection[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const load = useCallback(() => {
    if (!session) return;
    setLoading(true);
    setError(null);
    const request = isCoach ? listCoachResourceLibrary(session.user.id) : listClientResourceLibrary();
    request
      .then(setSections)
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load the Resource Library.'))
      .finally(() => setLoading(false));
  }, [session, isCoach]);

  useFocusEffect(load);

  const handleOpen = (url: string) => {
    if (!url) return;
    setActionError(null);
    Linking.openURL(url).catch((err) => setActionError(err instanceof Error ? err.message : 'Failed to open that resource.'));
  };

  const handleDelete = async (itemId: string) => {
    setActionError(null);
    setDeletingId(itemId);
    try {
      await deleteResourceItem(itemId);
      load();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to delete that resource.');
    } finally {
      setDeletingId(null);
    }
  };

  const isEmpty = sections.length === 0;

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <Pressable style={styles.backLink} hitSlop={8} onPress={() => router.replace(isCoach ? '/home' : '/client')}>
          <ThemedText type="linkPrimary">‹ Back</ThemedText>
        </Pressable>

        <View style={styles.header}>
          <ThemedText type="title">Resource Library</ThemedText>
          {isCoach && (
            <Pressable style={styles.newButton} onPress={() => router.push('/resources/new')}>
              <ThemedText type="smallBold" style={styles.newButtonText}>
                + New
              </ThemedText>
            </Pressable>
          )}
        </View>

        {loading && <ActivityIndicator style={styles.loader} />}
        {!loading && error && <ThemedText style={styles.error}>{error}</ThemedText>}
        {!loading && actionError && <ThemedText style={styles.error}>{actionError}</ThemedText>}

        {!loading && !error && isEmpty && (
          <ThemedText themeColor="textSecondary" style={styles.empty}>
            {isCoach ? 'Nothing here yet — tap + New to add a document or link.' : 'Nothing shared with you yet — check back soon.'}
          </ThemedText>
        )}

        {!loading && !error && !isEmpty && (
          <ScrollView contentContainerStyle={styles.scrollContent}>
            {sections.map((section) => (
              <View key={section.folder?.id ?? 'uncategorized'} style={styles.section}>
                <ThemedText type="smallBold" themeColor="textSecondary" style={styles.sectionTitle}>
                  {section.folder?.name ?? 'Uncategorized'}
                </ThemedText>
                {section.items.map((item) => (
                  <Pressable key={item.id} onPress={() => handleOpen(item.url)}>
                    <ThemedView type="backgroundElement" style={styles.card}>
                      <ThemedText style={styles.icon}>{TYPE_ICON[item.type]}</ThemedText>
                      <ThemedText style={styles.itemName}>{item.name}</ThemedText>
                      {isCoach && (
                        <ThemedText type="small" themeColor="textSecondary" style={styles.audienceBadge}>
                          {item.openToAll ? 'All' : 'Specific'}
                        </ThemedText>
                      )}
                      {isCoach &&
                        (deletingId === item.id ? (
                          <ActivityIndicator size="small" />
                        ) : (
                          <Pressable
                            onPress={(event) => {
                              event.stopPropagation();
                              handleDelete(item.id);
                            }}
                            hitSlop={8}>
                            <ThemedText type="small" style={styles.deleteText}>
                              Delete
                            </ThemedText>
                          </Pressable>
                        ))}
                    </ThemedView>
                  </Pressable>
                ))}
              </View>
            ))}
          </ScrollView>
        )}
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  safeArea: { flex: 1, paddingHorizontal: Spacing.four, paddingTop: Spacing.two },
  backLink: {
    marginBottom: Spacing.two,
    alignSelf: 'flex-start',
  },
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
    paddingVertical: Spacing.one,
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
    marginBottom: Spacing.two,
  },
  empty: {
    textAlign: 'center',
    marginTop: Spacing.five,
  },
  scrollContent: {
    paddingBottom: Spacing.six,
  },
  section: {
    marginBottom: Spacing.four,
  },
  sectionTitle: {
    marginBottom: Spacing.two,
    textTransform: 'uppercase',
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: Spacing.two,
    padding: Spacing.three,
    gap: Spacing.three,
    marginBottom: Spacing.two,
  },
  icon: {
    fontSize: 20,
  },
  itemName: {
    flex: 1,
  },
  audienceBadge: {
    color: Colors.tealBright,
  },
  deleteText: {
    color: Accent,
  },
});
