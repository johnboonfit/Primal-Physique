import { Redirect, router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ConfirmDialog } from '@/components/confirm-dialog';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Accent, Colors, Spacing } from '@/constants/theme';
import { useAuth } from '@/context/auth-context';
import {
  blockClient,
  deletePost,
  dismissReport,
  getOpenReports,
  listBlockedClients,
  unblockClient,
  type BlockedClient,
  type ModerationReport,
} from '@/lib/community';

function formatDate(iso: string) {
  return iso.slice(0, 10);
}

/**
 * Coach-only. No _layout.tsx guard for this folder (community/index.tsx
 * and new.tsx are deliberately open to both roles), so this checks
 * inline instead — same shape home.tsx already uses to redirect a
 * client away from the coach's own home screen.
 */
export default function CommunityModerationScreen() {
  const { profile, loadingProfile } = useAuth();

  const [reports, setReports] = useState<ModerationReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [blocked, setBlocked] = useState<BlockedClient[]>([]);
  const [blockedLoading, setBlockedLoading] = useState(true);
  const [blockedError, setBlockedError] = useState<string | null>(null);

  const [dismissingId, setDismissingId] = useState<string | null>(null);
  const [unblockingId, setUnblockingId] = useState<string | null>(null);

  const [deleteTarget, setDeleteTarget] = useState<ModerationReport | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const [blockTarget, setBlockTarget] = useState<ModerationReport | null>(null);
  const [blocking, setBlocking] = useState(false);
  const [blockError, setBlockError] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    getOpenReports()
      .then(setReports)
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load reports.'))
      .finally(() => setLoading(false));

    setBlockedLoading(true);
    listBlockedClients()
      .then(setBlocked)
      .catch((err) => setBlockedError(err instanceof Error ? err.message : 'Failed to load blocked clients.'))
      .finally(() => setBlockedLoading(false));
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  if (loadingProfile && !profile) return null;
  if (profile?.role !== 'coach') return <Redirect href="/home" />;

  const handleDismiss = async (reportId: string) => {
    setDismissingId(reportId);
    try {
      await dismissReport(reportId);
      setReports((current) => current.filter((r) => r.id !== reportId));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to dismiss that report.');
    } finally {
      setDismissingId(null);
    }
  };

  const handleConfirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleteError(null);
    setDeleting(true);
    try {
      await deletePost(deleteTarget.postId);
      // Cascade-deletes any other open reports pointing at this same
      // post server-side too — mirror that locally rather than leaving
      // a stale report for a post that no longer exists.
      setReports((current) => current.filter((r) => r.postId !== deleteTarget.postId));
      setDeleteTarget(null);
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : 'Failed to delete that post.');
    } finally {
      setDeleting(false);
    }
  };

  const handleConfirmBlock = async () => {
    if (!blockTarget) return;
    setBlockError(null);
    setBlocking(true);
    try {
      await blockClient(blockTarget.postAuthorId);
      setBlockTarget(null);
      load();
    } catch (err) {
      setBlockError(err instanceof Error ? err.message : 'Failed to block that client.');
    } finally {
      setBlocking(false);
    }
  };

  const handleUnblock = async (clientId: string) => {
    setUnblockingId(clientId);
    try {
      await unblockClient(clientId);
      setBlocked((current) => current.filter((b) => b.clientId !== clientId));
    } catch (err) {
      setBlockedError(err instanceof Error ? err.message : 'Failed to unblock that client.');
    } finally {
      setUnblockingId(null);
    }
  };

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <ScrollView contentContainerStyle={styles.scrollContent}>
          <ThemedText type="title" style={styles.title}>
            Moderation
          </ThemedText>

          <ThemedText type="smallBold" style={styles.sectionLabel}>
            Open reports
          </ThemedText>

          {loading && <ActivityIndicator style={styles.loader} />}

          {!loading && error && <ThemedText style={styles.error}>{error}</ThemedText>}

          {!loading && !error && reports.length === 0 && (
            <ThemedText themeColor="textSecondary">Nothing reported right now.</ThemedText>
          )}

          {!loading &&
            !error &&
            reports.map((report) => (
              <ThemedView key={report.id} type="backgroundElement" style={styles.card}>
                <View style={styles.cardHeader}>
                  <ThemedText type="smallBold">{report.postAuthorName}</ThemedText>
                  <ThemedText type="small" themeColor="textSecondary">
                    {formatDate(report.createdAt)}
                  </ThemedText>
                </View>
                <ThemedText type="small" themeColor="textSecondary">
                  {report.postBody}
                </ThemedText>
                <ThemedText type="small" themeColor="textSecondary" style={styles.reportMeta}>
                  Reported by {report.reporterName}
                  {report.reason ? `: "${report.reason}"` : ' (no reason given)'}
                </ThemedText>
                <View style={styles.cardActions}>
                  <Pressable onPress={() => handleDismiss(report.id)} disabled={dismissingId === report.id}>
                    {dismissingId === report.id ? (
                      <ActivityIndicator size="small" />
                    ) : (
                      <ThemedText type="small" themeColor="textSecondary">
                        Dismiss
                      </ThemedText>
                    )}
                  </Pressable>
                  <Pressable onPress={() => setDeleteTarget(report)}>
                    <ThemedText type="small" style={styles.deleteText}>
                      Delete post
                    </ThemedText>
                  </Pressable>
                  <Pressable onPress={() => setBlockTarget(report)}>
                    <ThemedText type="small" style={styles.deleteText}>
                      Block author
                    </ThemedText>
                  </Pressable>
                </View>
              </ThemedView>
            ))}

          <ThemedText type="smallBold" style={styles.sectionLabel}>
            Blocked clients
          </ThemedText>

          {blockedLoading && <ActivityIndicator style={styles.loader} />}

          {!blockedLoading && blockedError && <ThemedText style={styles.error}>{blockedError}</ThemedText>}

          {!blockedLoading && !blockedError && blocked.length === 0 && (
            <ThemedText themeColor="textSecondary">No one is currently blocked from posting.</ThemedText>
          )}

          {!blockedLoading &&
            !blockedError &&
            blocked.map((client) => (
              <ThemedView key={client.clientId} type="backgroundElement" style={styles.blockedRow}>
                <View>
                  <ThemedText type="smallBold">{client.name}</ThemedText>
                  <ThemedText type="small" themeColor="textSecondary">
                    Blocked {formatDate(client.blockedAt)}
                  </ThemedText>
                </View>
                <Pressable onPress={() => handleUnblock(client.clientId)} disabled={unblockingId === client.clientId}>
                  {unblockingId === client.clientId ? (
                    <ActivityIndicator size="small" />
                  ) : (
                    <ThemedText type="smallBold" style={styles.toggleLink}>
                      Unblock
                    </ThemedText>
                  )}
                </Pressable>
              </ThemedView>
            ))}

          <Pressable style={styles.backButton} onPress={() => router.back()}>
            <ThemedText type="linkPrimary">Back to Community</ThemedText>
          </Pressable>
        </ScrollView>
      </SafeAreaView>

      <ConfirmDialog
        visible={deleteTarget !== null}
        title="Delete this post?"
        message={
          deleteTarget
            ? `${deleteTarget.postAuthorName}'s post will be permanently removed from Community. Any other open reports on it are resolved automatically.`
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

      <ConfirmDialog
        visible={blockTarget !== null}
        title="Block this client?"
        message={
          blockTarget
            ? `${blockTarget.postAuthorName} will no longer be able to post to Community. Everything they've already posted stays exactly as it is. This doesn't resolve the current report — dismiss or delete it separately if you're done with it.`
            : ''
        }
        confirmLabel="Block"
        busy={blocking}
        onConfirm={handleConfirmBlock}
        onCancel={() => {
          setBlockTarget(null);
          setBlockError(null);
        }}
      />

      {(deleteError || blockError) && (
        <ThemedText style={styles.floatingError}>{deleteError || blockError}</ThemedText>
      )}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  safeArea: { flex: 1, paddingHorizontal: Spacing.four, paddingTop: Spacing.four },
  scrollContent: {
    gap: Spacing.two,
    paddingBottom: Spacing.four,
  },
  title: {
    marginBottom: Spacing.two,
  },
  sectionLabel: {
    marginTop: Spacing.three,
  },
  loader: {
    marginTop: Spacing.two,
  },
  error: {
    color: Accent,
  },
  floatingError: {
    color: Accent,
    textAlign: 'center',
    paddingBottom: Spacing.two,
  },
  card: {
    borderRadius: Spacing.two,
    padding: Spacing.three,
    gap: Spacing.half,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  reportMeta: {
    fontStyle: 'italic',
  },
  cardActions: {
    flexDirection: 'row',
    gap: Spacing.three,
    marginTop: Spacing.half,
  },
  deleteText: {
    color: Accent,
  },
  toggleLink: {
    color: Accent,
  },
  blockedRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderRadius: Spacing.two,
    padding: Spacing.three,
  },
  backButton: {
    alignItems: 'center',
    paddingVertical: Spacing.three,
    marginTop: Spacing.two,
  },
});
