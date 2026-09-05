import { Ionicons } from '@expo/vector-icons';
import { Redirect, router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Accent, Colors, Spacing } from '@/constants/theme';
import { useAuth } from '@/context/auth-context';
import { useTheme } from '@/hooks/use-theme';
import { isOnline, listCoachConversations, type CoachInboxEntry } from '@/lib/chat';

function initial(name: string) {
  return name.trim().charAt(0).toUpperCase() || '?';
}

function formatPreviewTime(iso: string) {
  const date = new Date(iso);
  const now = new Date();
  const sameDay = date.toDateString() === now.toDateString();
  return sameDay ? date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : date.toLocaleDateString();
}

/** Coach-only, same inline-guard shape as community/moderation.tsx —
 * this folder has no _layout.tsx of its own. */
export default function MessagesInboxScreen() {
  const theme = useTheme();
  const { profile, loadingProfile } = useAuth();

  const [entries, setEntries] = useState<CoachInboxEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      listCoachConversations()
        .then(setEntries)
        .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load conversations.'))
        .finally(() => setLoading(false));
    }, [])
  );

  if (loadingProfile && !profile) return null;
  if (profile?.role !== 'coach') return <Redirect href="/home" />;

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.titleRow}>
          <ThemedText type="title">Messages</ThemedText>
          <View style={styles.titleActions}>
            <Pressable onPress={() => router.push('/messages/bulk-send')} hitSlop={8} accessibilityLabel="Send Bulk Message">
              <Ionicons name="megaphone-outline" size={22} color={theme.textSecondary} />
            </Pressable>
            <Pressable onPress={() => router.push('/messages/scheduled')} hitSlop={8} accessibilityLabel="Scheduled Messages">
              <Ionicons name="calendar-outline" size={22} color={theme.textSecondary} />
            </Pressable>
          </View>
        </View>

        {loading && <ActivityIndicator style={styles.loader} />}

        {!loading && error && <ThemedText style={styles.error}>{error}</ThemedText>}

        {!loading && !error && entries.length === 0 && (
          <ThemedText themeColor="textSecondary" style={styles.empty}>
            No clients yet.
          </ThemedText>
        )}

        {!loading && !error && entries.length > 0 && (
          <FlatList
            data={entries}
            keyExtractor={(item) => item.clientId}
            contentContainerStyle={styles.listContent}
            renderItem={({ item }) => (
              <Pressable onPress={() => router.push(`/messages/${item.clientId}`)}>
                <ThemedView type="backgroundElement" style={styles.card}>
                  <View style={styles.avatar}>
                    <ThemedText type="smallBold" style={{ color: Colors.text }}>
                      {initial(item.name)}
                    </ThemedText>
                    {isOnline(item.lastSeenAt) && <View style={styles.onlineDot} />}
                  </View>
                  <View style={styles.cardInfo}>
                    <ThemedText type="smallBold">{item.name}</ThemedText>
                    <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
                      {item.lastMessagePreview ?? 'No messages yet'}
                    </ThemedText>
                  </View>
                  {item.lastMessageAt && (
                    <ThemedText type="small" themeColor="textSecondary">
                      {formatPreviewTime(item.lastMessageAt)}
                    </ThemedText>
                  )}
                </ThemedView>
              </Pressable>
            )}
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
  titleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.three,
  },
  titleActions: {
    flexDirection: 'row',
    gap: Spacing.three,
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
    gap: Spacing.three,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.tealDeep,
    alignItems: 'center',
    justifyContent: 'center',
  },
  onlineDot: {
    position: 'absolute',
    bottom: -1,
    right: -1,
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: Colors.tealBright,
    borderWidth: 2,
    borderColor: Colors.background,
  },
  cardInfo: {
    flex: 1,
    gap: Spacing.half,
  },
  backButton: {
    alignItems: 'center',
    paddingVertical: Spacing.three,
  },
});
