import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Accent, Colors, Spacing } from '@/constants/theme';
import { getComplianceScore } from '@/lib/compliance';
import { listClients, type ClientSummary } from '@/lib/clients';

function complianceColor(score: number) {
  if (score >= 80) return Colors.tealBright;
  if (score < 50) return Accent;
  return Colors.textSecondary;
}

export default function ClientsListScreen() {
  const [clients, setClients] = useState<ClientSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [complianceByClient, setComplianceByClient] = useState<Record<string, number>>({});

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;

      setLoading(true);
      listClients()
        .then((data) => {
          if (cancelled) return;
          setClients(data);
          // Runs after the list itself is already showing — one coach,
          // a handful of clients, so a per-client fetch here is cheap,
          // same scale assumption Momentum Score already makes. A
          // failure on any one client's score never blocks the rest of
          // the list from loading or showing theirs.
          Promise.all(
            data.map((client) =>
              getComplianceScore(client.id)
                .then((result) => [client.id, result.score] as const)
                .catch((err) => {
                  console.error(`Failed to calculate compliance for client ${client.id}:`, err);
                  return [client.id, null] as const;
                })
            )
          ).then((results) => {
            if (cancelled) return;
            const next: Record<string, number> = {};
            results.forEach(([id, score]) => {
              if (score !== null) next[id] = score;
            });
            setComplianceByClient(next);
          });
        })
        .catch((err) => {
          if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load clients.');
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });

      return () => {
        cancelled = true;
      };
    }, [])
  );

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <ThemedText type="title" style={styles.title}>
          Clients
        </ThemedText>

        {loading && <ActivityIndicator style={styles.loader} />}

        {!loading && error && <ThemedText style={styles.error}>{error}</ThemedText>}

        {!loading && !error && clients.length === 0 && (
          <ThemedText themeColor="textSecondary" style={styles.empty}>
            No clients yet — they show up here as soon as they sign up.
          </ThemedText>
        )}

        {!loading && !error && clients.length > 0 && (
          <FlatList
            data={clients}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.listContent}
            renderItem={({ item }) => {
              const score = complianceByClient[item.id];
              return (
                <Pressable onPress={() => router.push(`/clients/${item.id}`)}>
                  <ThemedView type="backgroundElement" style={styles.card}>
                    <View style={styles.cardInfo}>
                      <ThemedText type="smallBold">{item.fullName || item.email}</ThemedText>
                      {item.fullName && (
                        <ThemedText type="small" themeColor="textSecondary">
                          {item.email}
                        </ThemedText>
                      )}
                    </View>
                    {score !== undefined && (
                      <ThemedText type="smallBold" style={{ color: complianceColor(score) }}>
                        {score}%
                      </ThemedText>
                    )}
                  </ThemedView>
                </Pressable>
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
  title: {
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
    justifyContent: 'space-between',
    alignItems: 'center',
    borderRadius: Spacing.two,
    padding: Spacing.three,
    gap: Spacing.two,
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
