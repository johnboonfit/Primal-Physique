import { Redirect, router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ConfirmDialog } from '@/components/confirm-dialog';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Accent, Colors, Spacing } from '@/constants/theme';
import { useAuth } from '@/context/auth-context';
import { cancelBulkMessageSeries, listScheduledBulkMessageSeries, type BulkMessageSeries } from '@/lib/bulk-messages';

const CADENCE_LABEL: Record<BulkMessageSeries['repeatCadence'], string> = {
  none: 'One-time',
  daily: 'Repeats daily',
  weekly: 'Repeats weekly',
  monthly: 'Repeats monthly',
};

/** "In 9 hours" / "In 3 days" / "Sending soon" for anything already
 * due — a scheduled series only actually fires on the next pg_cron
 * tick (up to 15 minutes later, see bulk-messages.sql), so a moment
 * right at or just past next_run_at isn't a bug, just the dispatcher
 * not having ticked yet. */
function formatCountdown(nextRunAt: string): string {
  const diffMs = new Date(nextRunAt).getTime() - Date.now();
  if (diffMs <= 0) return 'Sending soon';

  const minutes = Math.round(diffMs / 60000);
  if (minutes < 60) return `In ${minutes} minute${minutes === 1 ? '' : 's'}`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `In ${hours} hour${hours === 1 ? '' : 's'}`;
  const days = Math.round(hours / 24);
  return `In ${days} day${days === 1 ? '' : 's'}`;
}

function formatScheduledFor(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

/** Coach-only, same inline-guard shape as messages/index.tsx. */
export default function ScheduledMessagesScreen() {
  const { profile, loadingProfile } = useAuth();

  const [series, setSeries] = useState<BulkMessageSeries[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pendingCancel, setPendingCancel] = useState<BulkMessageSeries | null>(null);
  const [cancelling, setCancelling] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    listScheduledBulkMessageSeries()
      .then(setSeries)
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load scheduled messages.'))
      .finally(() => setLoading(false));
  }, []);

  useFocusEffect(load);

  if (loadingProfile && !profile) return null;
  if (profile?.role !== 'coach') return <Redirect href="/home" />;

  const handleConfirmCancel = async () => {
    if (!pendingCancel) return;
    setCancelling(true);
    try {
      await cancelBulkMessageSeries(pendingCancel.id);
      setPendingCancel(null);
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to cancel that series.');
    } finally {
      setCancelling(false);
    }
  };

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} hitSlop={8}>
            <ThemedText type="linkPrimary">Back</ThemedText>
          </Pressable>
          <ThemedText type="smallBold">Scheduled Messages</ThemedText>
          <View style={{ width: 40 }} />
        </View>

        {loading && <ActivityIndicator style={styles.loader} />}

        {!loading && error && <ThemedText style={styles.error}>{error}</ThemedText>}

        {!loading && !error && series.length === 0 && (
          <ThemedText themeColor="textSecondary" style={styles.empty}>
            Nothing scheduled — send a bulk message and choose Schedule to see it here.
          </ThemedText>
        )}

        {!loading && !error && series.length > 0 && (
          <FlatList
            data={series}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.listContent}
            renderItem={({ item }) => (
              <ThemedView type="backgroundElement" style={styles.card}>
                <View style={styles.cardHeader}>
                  <ThemedText type="smallBold" numberOfLines={1} style={styles.cardTitle}>
                    {item.label}
                  </ThemedText>
                  <Pressable onPress={() => setPendingCancel(item)}>
                    <ThemedText type="small" style={styles.cancelLink}>
                      Cancel Series
                    </ThemedText>
                  </Pressable>
                </View>

                {item.nextRunAt && (
                  <ThemedText type="small" style={styles.countdown}>
                    ⏰ {formatCountdown(item.nextRunAt)}
                  </ThemedText>
                )}
                <ThemedText type="small" themeColor="textSecondary">
                  🔁 {CADENCE_LABEL[item.repeatCadence]} · {item.timesFired} sent
                </ThemedText>

                <ThemedText style={styles.body}>{item.body}</ThemedText>
                {item.attachmentFileName && (
                  <ThemedText type="small" themeColor="textSecondary">
                    📎 {item.attachmentFileName}
                  </ThemedText>
                )}

                <ThemedText type="small" themeColor="textSecondary" style={styles.recipients}>
                  👥 {item.recipientCount} recipient{item.recipientCount === 1 ? '' : 's'}
                </ThemedText>

                {item.nextRunAt && (
                  <View style={styles.scheduledForRow}>
                    <ThemedText type="small" themeColor="textSecondary">
                      Scheduled for:
                    </ThemedText>
                    <ThemedText type="smallBold">{formatScheduledFor(item.nextRunAt)}</ThemedText>
                  </View>
                )}
              </ThemedView>
            )}
          />
        )}

        <ConfirmDialog
          visible={pendingCancel !== null}
          title="Cancel this series?"
          message="This stops every future send for this series. Anything already sent stays in each client's chat."
          confirmLabel="Cancel Series"
          busy={cancelling}
          onConfirm={handleConfirmCancel}
          onCancel={() => setPendingCancel(null)}
        />
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  safeArea: { flex: 1, paddingHorizontal: Spacing.four, paddingTop: Spacing.two },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingBottom: Spacing.three,
    borderBottomWidth: 1,
    borderBottomColor: Colors.backgroundSelected,
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
    gap: Spacing.three,
    paddingBottom: Spacing.four,
  },
  card: {
    borderRadius: Spacing.two,
    padding: Spacing.three,
    gap: Spacing.one,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  cardTitle: {
    flex: 1,
    marginRight: Spacing.two,
  },
  cancelLink: {
    color: Accent,
  },
  countdown: {
    color: Accent,
  },
  body: {
    marginTop: Spacing.one,
  },
  recipients: {
    marginTop: Spacing.one,
  },
  scheduledForRow: {
    marginTop: Spacing.two,
    paddingTop: Spacing.two,
    borderTopWidth: 1,
    borderTopColor: Colors.background,
    gap: Spacing.half,
  },
});
