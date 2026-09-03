import { Redirect, router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ChatThread } from '@/components/chat-thread';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Accent, Spacing } from '@/constants/theme';
import { useAuth } from '@/context/auth-context';
import { getClient } from '@/lib/clients';
import { getOrCreateConversation } from '@/lib/chat';

export default function ClientMessageThreadScreen() {
  const { profile, loadingProfile } = useAuth();
  const { clientId } = useLocalSearchParams<{ clientId: string }>();

  const [conversationId, setConversationId] = useState<string | null>(null);
  const [clientName, setClientName] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!clientId) return;
    Promise.all([getOrCreateConversation(clientId), getClient(clientId)])
      .then(([convoId, client]) => {
        setConversationId(convoId);
        setClientName(client.fullName || client.email.split('@')[0]);
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to open this conversation.'))
      .finally(() => setLoading(false));
  }, [clientId]);

  if (loadingProfile && !profile) return null;
  if (profile?.role !== 'coach') return <Redirect href="/home" />;

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        {loading && <ActivityIndicator style={styles.loader} />}

        {!loading && error && <ThemedText style={styles.error}>{error}</ThemedText>}

        {!loading && !error && conversationId && clientName && (
          <ChatThread conversationId={conversationId} otherPartyId={clientId} otherPartyName={clientName} />
        )}

        <Pressable style={styles.backButton} onPress={() => router.replace('/messages')}>
          <ThemedText type="linkPrimary">Back to Messages</ThemedText>
        </Pressable>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  safeArea: { flex: 1, paddingHorizontal: Spacing.four, paddingTop: Spacing.four },
  loader: {
    marginTop: Spacing.five,
  },
  error: {
    color: Accent,
    textAlign: 'center',
    marginTop: Spacing.five,
  },
  backButton: {
    alignItems: 'center',
    paddingVertical: Spacing.three,
  },
});
