import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Accent, Colors, Spacing } from '@/constants/theme';
import { complianceColor, getComplianceScore } from '@/lib/compliance';
import { listClients, setClientStatus, type ClientSummary } from '@/lib/clients';
import { getErrorMessage } from '@/lib/errors';
import { CLIENT_TIERS, listClientTiers, setClientTier, type ClientTier } from '@/lib/leaderboard';

export default function ClientsListScreen() {
  const [clients, setClients] = useState<ClientSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [complianceByClient, setComplianceByClient] = useState<Record<string, number>>({});
  const [tiersByClient, setTiersByClient] = useState<Record<string, ClientTier>>({});
  const [savingTierId, setSavingTierId] = useState<string | null>(null);
  const [tierError, setTierError] = useState<string | null>(null);
  const [savingStatusId, setSavingStatusId] = useState<string | null>(null);
  const [statusError, setStatusError] = useState<string | null>(null);

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

          listClientTiers()
            .then((map) => {
              if (!cancelled) setTiersByClient(map);
            })
            .catch((err) => console.error('Failed to load client tiers:', err));
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

  const handleSetTier = async (clientId: string, tier: ClientTier) => {
    setTierError(null);
    setSavingTierId(clientId);
    try {
      await setClientTier(clientId, tier);
      setTiersByClient((current) => ({ ...current, [clientId]: tier }));
    } catch (err) {
      setTierError(err instanceof Error ? err.message : "Failed to update that client's tier.");
    } finally {
      setSavingTierId(null);
    }
  };

  // Fully reversible either direction -- pausing and reactivating are
  // the exact same one-column write, just with the other value.
  const handleToggleStatus = async (clientId: string, currentStatus: ClientSummary['status']) => {
    setStatusError(null);
    setSavingStatusId(clientId);
    const nextStatus = currentStatus === 'active' ? 'paused' : 'active';
    try {
      await setClientStatus(clientId, nextStatus);
      setClients((current) => current.map((client) => (client.id === clientId ? { ...client, status: nextStatus } : client)));
    } catch (err) {
      setStatusError(getErrorMessage(err, "Failed to update that client's status."));
    } finally {
      setSavingStatusId(null);
    }
  };

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <ThemedText type="title" style={styles.title}>
          Clients
        </ThemedText>

        {loading && <ActivityIndicator style={styles.loader} />}

        {!loading && error && <ThemedText style={styles.error}>{error}</ThemedText>}

        {tierError && <ThemedText style={styles.error}>{tierError}</ThemedText>}

        {statusError && <ThemedText style={styles.error}>{statusError}</ThemedText>}

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
              const tier = tiersByClient[item.id] ?? 'club';
              return (
                <ThemedView type="backgroundElement" style={styles.card}>
                  <Pressable style={styles.cardTouchable} onPress={() => router.push(`/clients/${item.id}`)}>
                    <View style={styles.cardInfo}>
                      <View style={styles.nameRow}>
                        <ThemedText type="smallBold" style={item.status === 'paused' ? styles.pausedText : undefined}>
                          {item.fullName || item.email}
                        </ThemedText>
                        {item.status === 'paused' && (
                          <View style={styles.pausedBadge}>
                            <ThemedText type="small" style={styles.pausedBadgeText}>
                              Paused
                            </ThemedText>
                          </View>
                        )}
                      </View>
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
                  </Pressable>
                  <View style={styles.tierRow}>
                    <ThemedText type="small" themeColor="textSecondary">
                      Tier:
                    </ThemedText>
                    {CLIENT_TIERS.map((option) => {
                      const selected = option.key === tier;
                      return (
                        <Pressable
                          key={option.key}
                          onPress={() => handleSetTier(item.id, option.key)}
                          disabled={savingTierId === item.id}>
                          <ThemedText type={selected ? 'smallBold' : 'small'} style={selected ? styles.tierActive : styles.tierInactive}>
                            {option.label}
                          </ThemedText>
                        </Pressable>
                      );
                    })}
                  </View>
                  <Pressable
                    style={styles.statusRow}
                    onPress={() => handleToggleStatus(item.id, item.status)}
                    disabled={savingStatusId === item.id}>
                    {savingStatusId === item.id ? (
                      <ActivityIndicator size="small" />
                    ) : (
                      <ThemedText type="small" style={item.status === 'active' ? styles.pauseAction : styles.reactivateAction}>
                        {item.status === 'active' ? 'Pause client' : 'Reactivate client'}
                      </ThemedText>
                    )}
                  </Pressable>
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
    borderRadius: Spacing.two,
    padding: Spacing.three,
    gap: Spacing.two,
  },
  cardTouchable: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: Spacing.two,
  },
  cardInfo: {
    flex: 1,
    gap: Spacing.half,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  pausedText: {
    color: Colors.textSecondary,
  },
  pausedBadge: {
    borderWidth: 1,
    borderColor: Accent,
    borderRadius: 999,
    paddingHorizontal: Spacing.two,
    paddingVertical: 1,
  },
  pausedBadgeText: {
    color: Accent,
  },
  tierRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
  },
  tierActive: {
    color: Accent,
  },
  tierInactive: {
    color: Colors.textSecondary,
  },
  statusRow: {
    borderTopWidth: 1,
    borderTopColor: Colors.backgroundSelected,
    paddingTop: Spacing.two,
  },
  pauseAction: {
    color: Accent,
  },
  reactivateAction: {
    color: Colors.tealBright,
  },
  backButton: {
    alignItems: 'center',
    paddingVertical: Spacing.three,
  },
});
