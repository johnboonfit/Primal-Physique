import { Image } from 'expo-image';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ConfirmDialog } from '@/components/confirm-dialog';
import { FeatureLockedCard } from '@/components/feature-locked-card';
import { LeaderboardPanel } from '@/components/leaderboard-panel';
import { ReportPostModal } from '@/components/report-post-modal';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Accent, Colors, Glow, Spacing } from '@/constants/theme';
import { useAuth } from '@/context/auth-context';
import {
  COMMUNITY_TAGS,
  deletePost,
  getCommunityEnabled,
  getOpenReports,
  listCommunityPosts,
  reportPost,
  setCommunityEnabled,
  type CommunityPost,
} from '@/lib/community';
import { isFeatureEnabled } from '@/lib/feature-toggles';

type SubTab = 'posts' | 'leaderboards';

const SUB_TABS: { key: SubTab; label: string }[] = [
  { key: 'posts', label: 'Posts' },
  { key: 'leaderboards', label: 'Leaderboards' },
];

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
  const { session, profile } = useAuth();
  const isCoach = profile?.role === 'coach';

  const [activeTab, setActiveTab] = useState<SubTab>('posts');

  const [posts, setPosts] = useState<CommunityPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [communityEnabled, setCommunityEnabledState] = useState<boolean | null>(null);
  const [togglingEnabled, setTogglingEnabled] = useState(false);
  const [toggleError, setToggleError] = useState<string | null>(null);

  // A coach-controlled per-client override, independent of the app-wide
  // switch above — see feature-toggles.ts. Defaults to true (full
  // access) until loaded, same reasoning as communityEnabled defaulting
  // to null rather than flashing a locked state for a moment first.
  const [myFeatureEnabled, setMyFeatureEnabled] = useState(true);

  const [openReportCount, setOpenReportCount] = useState(0);

  const [deleteTarget, setDeleteTarget] = useState<CommunityPost | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const [reportTarget, setReportTarget] = useState<CommunityPost | null>(null);
  const [reporting, setReporting] = useState(false);
  const [reportError, setReportError] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    Promise.all([
      listCommunityPosts(),
      getCommunityEnabled(),
      profile?.role === 'client' && session ? isFeatureEnabled(session.user.id, 'community') : Promise.resolve(true),
    ])
      .then(([postData, enabled, myFeature]) => {
        setPosts(postData);
        setCommunityEnabledState(enabled);
        setMyFeatureEnabled(myFeature);
      })
      .catch((err) => {
        console.error('Failed to load Community:', err);
        setError(err instanceof Error ? err.message : 'Failed to load Community.');
      })
      .finally(() => setLoading(false));

    // Kept separate from the feed itself on purpose — the open-report
    // badge is a bonus for the coach, not core to the feed loading at
    // all. A failure here should never block a client (or the coach)
    // from seeing posts; it should just leave the badge showing 0.
    if (profile?.role === 'coach') {
      getOpenReports()
        .then((reports) => setOpenReportCount(reports.length))
        .catch((err) => console.error('Failed to load open report count:', err));
    }
  }, [profile, session]);

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

  const handleConfirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleteError(null);
    setDeleting(true);
    try {
      await deletePost(deleteTarget.id);
      setPosts((current) => current.filter((p) => p.id !== deleteTarget.id));
      setDeleteTarget(null);
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : 'Failed to delete that post.');
    } finally {
      setDeleting(false);
    }
  };

  const handleSubmitReport = async (reason: string) => {
    if (!reportTarget || !session) return;
    setReportError(null);
    setReporting(true);
    try {
      await reportPost(reportTarget.id, session.user.id, reason);
      setReportTarget(null);
    } catch (err) {
      setReportError(err instanceof Error ? err.message : 'Failed to submit that report.');
    } finally {
      setReporting(false);
    }
  };

  // A client can still land here (e.g. a link they'd already opened)
  // after their coach switches Community off app-wide — show the same
  // "off" state rather than a feed that's about to disappear from
  // everywhere else. A coach is never blocked by their own switch: they
  // still need to reach this screen to turn it back on.
  const blockedForClient = !isCoach && communityEnabled === false;
  // The coach's per-client toggle — a separate gate from the app-wide
  // switch above, and rendered with the shared locked-card look rather
  // than the plain "off" text blockedForClient uses, so the two are
  // visually distinguishable while testing/verifying either one.
  const toggledOffForClient = !isCoach && !myFeatureEnabled;

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <ThemedView style={styles.header}>
          <ThemedText type="title">Community</ThemedText>
          {activeTab === 'posts' && !blockedForClient && !toggledOffForClient && (
            <Pressable style={styles.newButton} onPress={() => router.push('/community/new')}>
              <ThemedText type="smallBold" style={styles.newButtonText}>
                + New
              </ThemedText>
            </Pressable>
          )}
        </ThemedView>

        <View style={styles.subTabRow}>
          {SUB_TABS.map((tab) => (
            <Pressable key={tab.key} onPress={() => setActiveTab(tab.key)}>
              <View style={[styles.subTab, activeTab === tab.key && styles.subTabActive]}>
                <ThemedText
                  type="smallBold"
                  style={activeTab === tab.key ? styles.subTabActiveText : styles.subTabText}>
                  {tab.label}
                </ThemedText>
              </View>
            </Pressable>
          ))}
        </View>

        {activeTab === 'posts' && (
          <>
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

            {isCoach && (
              <Pressable onPress={() => router.push('/community/moderation')} style={styles.moderationLink}>
                <ThemedText type="smallBold" style={styles.toggleLink}>
                  🚩 Moderation{openReportCount > 0 ? ` (${openReportCount})` : ''}
                </ThemedText>
              </Pressable>
            )}

            {toggleError && <ThemedText style={styles.error}>{toggleError}</ThemedText>}

            {deleteError && <ThemedText style={styles.error}>{deleteError}</ThemedText>}

            {loading && <ActivityIndicator style={styles.loader} />}

            {!loading && error && <ThemedText style={styles.error}>{error}</ThemedText>}

            {!loading && !error && toggledOffForClient && (
              <FeatureLockedCard
                title="Community"
                message="Your coach has turned off Community access for your account."
              />
            )}

            {!loading && !error && !toggledOffForClient && blockedForClient && (
              <ThemedText themeColor="textSecondary" style={styles.empty}>
                Your coach has turned Community off for now.
              </ThemedText>
            )}

            {!loading && !error && !toggledOffForClient && !blockedForClient && posts.length === 0 && (
              <ThemedText themeColor="textSecondary" style={styles.empty}>
                No posts yet. Tap + New to start the conversation.
              </ThemedText>
            )}

            {!loading && !error && !toggledOffForClient && !blockedForClient && posts.length > 0 && (
              <FlatList
                data={posts}
                keyExtractor={(item) => item.id}
                contentContainerStyle={styles.listContent}
                renderItem={({ item }) => {
                  const tag = tagInfo(item.tag);
                  const isOwnPost = item.authorId === session?.user.id;
                  const canDelete = isOwnPost || isCoach;
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
                        <View style={styles.cardActions}>
                          {!isOwnPost && (
                            <Pressable onPress={() => setReportTarget(item)}>
                              <ThemedText type="small" themeColor="textSecondary">
                                Report
                              </ThemedText>
                            </Pressable>
                          )}
                          {canDelete && (
                            <Pressable onPress={() => setDeleteTarget(item)}>
                              <ThemedText type="small" style={styles.deleteText}>
                                Delete
                              </ThemedText>
                            </Pressable>
                          )}
                        </View>
                      </View>
                    </ThemedView>
                  );
                }}
              />
            )}
          </>
        )}

        {activeTab === 'leaderboards' && <LeaderboardPanel />}

        <Pressable style={styles.backButton} onPress={() => router.replace('/home')}>
          <ThemedText type="linkPrimary">Back to home</ThemedText>
        </Pressable>
      </SafeAreaView>

      <ConfirmDialog
        visible={deleteTarget !== null}
        title="Delete this post?"
        message={
          deleteTarget
            ? isCoach && deleteTarget.authorId !== session?.user.id
              ? `${deleteTarget.authorName}'s post will be permanently removed from Community.`
              : 'This will be permanently removed from Community.'
            : ''
        }
        confirmLabel="Delete"
        busy={deleting}
        onConfirm={handleConfirmDelete}
        onCancel={() => {
          setDeleteTarget(null);
          setDeleteError(null);
        }}
      />

      <ReportPostModal
        visible={reportTarget !== null}
        busy={reporting}
        error={reportError}
        onSubmit={handleSubmitReport}
        onCancel={() => {
          setReportTarget(null);
          setReportError(null);
        }}
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
  subTabRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
    marginBottom: Spacing.two,
  },
  subTab: {
    borderRadius: 999,
    paddingVertical: Spacing.one,
    paddingHorizontal: Spacing.three,
    backgroundColor: Colors.backgroundElement,
  },
  subTabActive: {
    backgroundColor: Accent,
  },
  subTabText: {
    color: Colors.textSecondary,
  },
  subTabActiveText: {
    color: Colors.text,
  },
  toggleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.two,
  },
  toggleLink: {
    color: Accent,
  },
  moderationLink: {
    marginBottom: Spacing.three,
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
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: Spacing.half,
  },
  cardActions: {
    flexDirection: 'row',
    gap: Spacing.three,
  },
  deleteText: {
    color: Accent,
  },
  backButton: {
    alignItems: 'center',
    paddingVertical: Spacing.three,
  },
});
