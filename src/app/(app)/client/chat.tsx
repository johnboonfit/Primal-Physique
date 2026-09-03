import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ChatThread } from '@/components/chat-thread';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Accent, Spacing } from '@/constants/theme';
import { useAuth } from '@/context/auth-context';
import { getAnyCoach, getOrCreateConversation } from '@/lib/chat';

export default function ChatScreen() {
  const { session } = useAuth();

  const [conversationId, setConversationId] = useState<string | null>(null);
  const [coach, setCoach] = useState<{ id: string; name: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!session) return;
    Promise.all([getOrCreateConversation(session.user.id), getAnyCoach()])
      .then(([convoId, coachProfile]) => {
        setConversationId(convoId);
        setCoach(coachProfile);
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to open your conversation.'))
      .finally(() => setLoading(false));
  }, [session]);

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <ThemedText type="title" style={styles.title}>
          Chat
        </ThemedText>

        {loading && <ActivityIndicator style={styles.loader} />}

        {!loading && error && <ThemedText style={styles.error}>{error}</ThemedText>}

        {!loading && !error && (!conversationId || !coach) && (
          <ThemedText themeColor="textSecondary" style={styles.empty}>
            No coach account exists yet to message.
          </ThemedText>
        )}

        {!loading && !error && conversationId && coach && (
          <ChatThread conversationId={conversationId} otherPartyId={coach.id} otherPartyName={`Coach: ${coach.name}`} />
        )}
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  safeArea: { flex: 1, paddingHorizontal: Spacing.four, paddingTop: Spacing.four },
  title: {
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
  empty: {
    textAlign: 'center',
    marginTop: Spacing.five,
  },
});
