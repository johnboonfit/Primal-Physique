import { Image } from 'expo-image';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Accent, Colors, Glow, Spacing } from '@/constants/theme';
import { useAuth } from '@/context/auth-context';
import {
  COMMUNITY_TAGS,
  getCommunityEnabled,
  listCommunityPosts,
  setCommunityEnabled,
  type CommunityPost,
} from '@/lib/community';

function tagInfo(tag: CommunityPost['tag']) {
  return COMMUNITY_TAGS.find((t) => t.key === tag) ?? COMMUNITY_TAGS[1];
}

function formatPostTime(iso: string) {
  const diffMs = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(diffMs / 60000);
  if (minutes < 60) return `${Math.max(minutes, 0)}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return iso.slice(0, 10);
}

export default function CommunityFeedScreen() {
  const { profile } = useAuth();
  const isCoach = profile?.role === 'coach';

  const [posts, setPosts] = useState<CommunityPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [communityEnabled, setCommunityEnabledState] = useState<boolean | null>(null);
  const [togglingEnabled, setTogglingEnabled] = useState(false);
  const [toggleError, setToggleError] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    Promise.all([listCommunityPosts(), getCommunityEnabled()])
      .then(([postData, enabled]) => {
        setPosts(postData);
        setCommunityEnabledState(enabled);
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load Community.'))
      .finally(() => setLoading(false));
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const handleToggleEnabled = async () => {
    if (communityEnabled === null) return;
    setToggleError(null);
    setTogglingEnabled(true);
    try {
      const next = !communityEnabled;
      await setCommunityEnabled(next);
      setCommunityEnabledState(next);
    } catch (err) {
      setToggleError(err instanceof Error ? err.message : 'Failed to update that setting.');
    } finally {
      setTogglingEnabled(false);
    }
  };

  // A client can still land here (e.g. a link they'd already opened)
  // after their coach switches Community off app-wide — show the same
  // "off" state rather than a feed that's about to disappear from
  // everywhere else. A coach is never blocked by their own switch: they
  // still need to reach this screen to turn it back on.
  const blockedForClient = !isCoach && communityEnabled === false;

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <ThemedView style={styles.header}>
          <ThemedText type="title">Community</ThemedText>
          {!blockedForClient && (
            <Pressable style={styles.newButton} onPress={() => router.push('/community/new')}>
              <ThemedText type="smallBold" style={styles.newButtonText}>
                + New
              </ThemedText>
            </Pressable>
          )}
        </ThemedView>

        {isCoach && communityEnabled !== null && (
          <View style={styles.toggleRow}>
            <ThemedText type="small" themeColor="textSecondary">
              Community is {communityEnabled ? 'on' : 'off'} for clients
            </ThemedText>
            <Pressable onPress={handleToggleEnabled} disabled={togglingEnabled}>
              {togglingEnabled ? (
                <ActivityIndicator size="small" />
              ) : (
                <ThemedText type="smallBold" style={styles.toggleLink}>
                  {communityEnabled ? 'Turn off' : 'Turn on'}
                </ThemedText>
              )}
            </Pressable>
          </View>
        )}

        {toggleError && <ThemedText style={styles.error}>{toggleError}</ThemedText>}

        {loading && <ActivityIndicator style={styles.loader} />}

        {!loading && error && <ThemedText style={styles.error}>{error}</ThemedText>}

        {!loading && !error && blockedForClient && (
          <ThemedText themeColor="textSecondary" style={styles.empty}>
            Your coach has turned Community off for now.
          </ThemedText>
        )}

        {!loading && !error && !blockedForClient && posts.length === 0 && (
          <ThemedText themeColor="textSecondary" style={styles.empty}>
            No posts yet. Tap + New to start the conversation.
          </ThemedText>
        )}

        {!loading && !error && !blockedForClient && posts.length > 0 && (
          <FlatList
            data={posts}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.listContent}
            renderItem={({ item }) => {
              const tag = tagInfo(item.tag);
              return (
                <ThemedView type="backgroundElement" style={[styles.card, tag.key === 'announcement' && styles.announcementCard]}>
                  <View style={styles.cardHeader}>
                    <ThemedText type="small" style={styles.tagLabel}>
                      {tag.emoji} {tag.label}
                    </ThemedText>
                    <ThemedText type="small" themeColor="textSecondary">
                      {formatPostTime(item.createdAt)}
                    </ThemedText>
                  </View>
                  <ThemedText type="smallBold">{item.authorName}</ThemedText>
                  <ThemedText>{item.body}</ThemedText>
                  {item.imageUrl && <Image source={{ uri: item.imageUrl }} style={styles.postImage} contentFit="cover" />}
                  <View style={styles.cardFooter}>
                    <ThemedText type="small" themeColor="textSecondary">
                      {item.reactionCount} reactions · {item.commentCount} comments
                    </ThemedText>
                  </View>
                </ThemedView>
              );
            }}
          />
        )}

        <Pressable style={styles.backButton} onPress={() => router.replace('/home')}>
          <ThemedText type="linkPrimary">Back to home</ThemedText>
        </Pressable>
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
    marginBottom: Spacing.two,
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
  toggleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.three,
  },
  toggleLink: {
    color: Accent,
  },
  loader: {
    marginTop: Spacing.five,
  },
  error: {
    color: Accent,
    textAlign: 'center',
    marginTop: Spacing.two,
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
  announcementCard: {
    borderLeftWidth: 3,
    borderLeftColor: Accent,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  tagLabel: {
    color: Colors.tealBright,
  },
  postImage: {
    width: '100%',
    aspectRatio: 4 / 3,
    borderRadius: Spacing.two,
    marginTop: Spacing.half,
  },
  cardFooter: {
    marginTop: Spacing.half,
  },
  backButton: {
    alignItems: 'center',
    paddingVertical: Spacing.three,
  },
});
