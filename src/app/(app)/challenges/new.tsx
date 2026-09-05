import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Accent, Colors, Glow, Spacing } from '@/constants/theme';
import { useAuth } from '@/context/auth-context';
import { useTheme } from '@/hooks/use-theme';
import { createChallenge, type ChallengeType } from '@/lib/challenges';
import { listClients, type ClientSummary } from '@/lib/clients';

const TYPE_OPTIONS: { key: ChallengeType; label: string }[] = [
  { key: 'volume', label: 'Volume' },
  { key: 'consistency', label: 'Consistency' },
];

function isValidDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value.trim()) && !Number.isNaN(new Date(`${value.trim()}T00:00:00.000Z`).getTime());
}

function initial(name: string) {
  return name.trim().charAt(0).toUpperCase() || '?';
}

/** Coach-only — same inline-guard shape as messages/bulk-send.tsx.
 * "Specific clients" reuses the exact checkbox + Select All picker
 * that screen already established. */
export default function NewChallengeScreen() {
  const theme = useTheme();
  const { session, profile, loadingProfile } = useAuth();

  const [name, setName] = useState('');
  const [type, setType] = useState<ChallengeType>('volume');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [audience, setAudience] = useState<'all' | 'specific'>('all');

  const [clients, setClients] = useState<ClientSummary[]>([]);
  const [loadingClients, setLoadingClients] = useState(true);
  const [selectedClientIds, setSelectedClientIds] = useState<Set<string>>(new Set());

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    listClients()
      .then(setClients)
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load clients.'))
      .finally(() => setLoadingClients(false));
  }, []);

  if (loadingProfile && !profile) return null;
  if (profile?.role !== 'coach') return null;

  const allSelected = clients.length > 0 && selectedClientIds.size === clients.length;

  const toggleClient = (clientId: string) => {
    setSelectedClientIds((current) => {
      const next = new Set(current);
      if (next.has(clientId)) next.delete(clientId);
      else next.add(clientId);
      return next;
    });
  };

  const toggleSelectAll = () => {
    setSelectedClientIds(allSelected ? new Set() : new Set(clients.map((c) => c.id)));
  };

  const canSubmit =
    !saving &&
    name.trim().length > 0 &&
    isValidDate(startDate) &&
    isValidDate(endDate) &&
    endDate >= startDate &&
    (audience === 'all' || selectedClientIds.size > 0);

  const handleSubmit = async () => {
    if (!session || !canSubmit) return;
    setSaving(true);
    setError(null);
    try {
      await createChallenge({
        coachId: session.user.id,
        name: name.trim(),
        type,
        startDate: startDate.trim(),
        endDate: endDate.trim(),
        openToAll: audience === 'all',
        eligibleClientIds: audience === 'all' ? [] : Array.from(selectedClientIds),
      });
      router.back();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create that challenge.');
      setSaving(false);
    }
  };

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} hitSlop={8}>
            <ThemedText type="linkPrimary">Cancel</ThemedText>
          </Pressable>
          <ThemedText type="smallBold">New Challenge</ThemedText>
          <View style={{ width: 50 }} />
        </View>

        <ScrollView contentContainerStyle={styles.scrollContent}>
          <ThemedText type="smallBold" style={styles.fieldLabel}>
            Name
          </ThemedText>
          <TextInput
            value={name}
            onChangeText={setName}
            placeholder="e.g. April Volume Challenge"
            placeholderTextColor={theme.textSecondary}
            style={[styles.input, { color: theme.text, borderColor: theme.backgroundSelected }]}
          />

          <ThemedText type="smallBold" style={styles.fieldLabel}>
            Type
          </ThemedText>
          <View style={styles.typeRow}>
            {TYPE_OPTIONS.map((option) => (
              <Pressable
                key={option.key}
                style={[styles.typePill, type === option.key && styles.typePillActive]}
                onPress={() => setType(option.key)}>
                <ThemedText type="smallBold" style={type === option.key ? styles.typePillTextActive : undefined}>
                  {option.label}
                </ThemedText>
              </Pressable>
            ))}
          </View>

          <ThemedText type="smallBold" style={styles.fieldLabel}>
            Dates
          </ThemedText>
          <View style={styles.dateRow}>
            <TextInput
              value={startDate}
              onChangeText={setStartDate}
              placeholder="Start YYYY-MM-DD"
              placeholderTextColor={theme.textSecondary}
              style={[styles.input, styles.dateInput, { color: theme.text, borderColor: theme.backgroundSelected }]}
            />
            <TextInput
              value={endDate}
              onChangeText={setEndDate}
              placeholder="End YYYY-MM-DD"
              placeholderTextColor={theme.textSecondary}
              style={[styles.input, styles.dateInput, { color: theme.text, borderColor: theme.backgroundSelected }]}
            />
          </View>

          <ThemedText type="smallBold" style={styles.fieldLabel}>
            Who can join
          </ThemedText>
          <View style={styles.audienceRow}>
            <Pressable
              style={[styles.audienceButton, audience === 'all' && styles.audienceButtonActive]}
              onPress={() => setAudience('all')}>
              <ThemedText type="smallBold" style={audience === 'all' ? styles.audienceTextActive : undefined}>
                All Clients
              </ThemedText>
            </Pressable>
            <Pressable
              style={[styles.audienceButton, audience === 'specific' && styles.audienceButtonActive]}
              onPress={() => setAudience('specific')}>
              <ThemedText type="smallBold" style={audience === 'specific' ? styles.audienceTextActive : undefined}>
                Specific Clients
              </ThemedText>
            </Pressable>
          </View>

          {audience === 'specific' && (
            <>
              <View style={styles.sectionHeader}>
                <ThemedText type="small" themeColor="textSecondary">
                  Select Clients ({selectedClientIds.size})
                </ThemedText>
                <Pressable onPress={toggleSelectAll}>
                  <ThemedText type="small" style={styles.selectAll}>
                    {allSelected ? 'Deselect All' : 'Select All'}
                  </ThemedText>
                </Pressable>
              </View>

              {loadingClients && <ActivityIndicator style={styles.loader} />}

              {!loadingClients && clients.length > 0 && (
                <ThemedView type="backgroundElement" style={styles.clientList}>
                  {clients.map((client) => {
                    const checked = selectedClientIds.has(client.id);
                    const label = client.fullName || client.email.split('@')[0];
                    return (
                      <Pressable key={client.id} style={styles.clientRow} onPress={() => toggleClient(client.id)}>
                        <View style={styles.avatar}>
                          <ThemedText type="smallBold" style={{ color: Colors.text }}>
                            {initial(label)}
                          </ThemedText>
                        </View>
                        <ThemedText style={styles.clientName}>{label}</ThemedText>
                        <View style={[styles.checkbox, checked && styles.checkboxChecked]}>
                          {checked && <ThemedText style={styles.checkmark}>✓</ThemedText>}
                        </View>
                      </Pressable>
                    );
                  })}
                </ThemedView>
              )}
            </>
          )}

          {error && <ThemedText style={styles.error}>{error}</ThemedText>}
        </ScrollView>

        <View style={styles.footer}>
          <Pressable style={styles.cancelButton} onPress={() => router.back()}>
            <ThemedText type="smallBold">Cancel</ThemedText>
          </Pressable>
          <Pressable
            style={[styles.submitButton, !canSubmit && styles.submitButtonDisabled]}
            onPress={handleSubmit}
            disabled={!canSubmit}>
            {saving ? (
              <ActivityIndicator size="small" color={Colors.text} />
            ) : (
              <ThemedText type="smallBold" style={{ color: Colors.text }}>
                Create Challenge
              </ThemedText>
            )}
          </Pressable>
        </View>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  safeArea: { flex: 1 },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.two,
    paddingBottom: Spacing.three,
    borderBottomWidth: 1,
    borderBottomColor: Colors.backgroundSelected,
  },
  scrollContent: {
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.three,
    paddingBottom: Spacing.six,
  },
  fieldLabel: {
    marginTop: Spacing.three,
    marginBottom: Spacing.one,
  },
  input: {
    borderWidth: 1,
    borderRadius: Spacing.two,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    fontSize: 16,
  },
  typeRow: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  typePill: {
    borderWidth: 1,
    borderColor: Colors.backgroundSelected,
    borderRadius: 999,
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.four,
  },
  typePillActive: {
    backgroundColor: Accent,
    borderColor: Accent,
  },
  typePillTextActive: {
    color: Colors.text,
  },
  dateRow: {
    flexDirection: 'row',
    gap: Spacing.three,
  },
  dateInput: {
    flex: 1,
  },
  audienceRow: {
    flexDirection: 'row',
    gap: Spacing.three,
  },
  audienceButton: {
    flex: 1,
    borderWidth: 1,
    borderColor: Colors.backgroundSelected,
    borderRadius: Spacing.two,
    paddingVertical: Spacing.three,
    alignItems: 'center',
  },
  audienceButtonActive: {
    ...Glow.oxblood,
    backgroundColor: Accent,
    borderColor: Accent,
  },
  audienceTextActive: {
    color: Colors.text,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: Spacing.three,
    marginBottom: Spacing.two,
  },
  selectAll: {
    color: Accent,
  },
  loader: {
    marginVertical: Spacing.three,
  },
  clientList: {
    borderRadius: Spacing.two,
    maxHeight: 260,
  },
  clientRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    padding: Spacing.three,
    borderBottomWidth: 1,
    borderBottomColor: Colors.background,
  },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.tealDeep,
    alignItems: 'center',
    justifyContent: 'center',
  },
  clientName: {
    flex: 1,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: Spacing.half,
    borderWidth: 1,
    borderColor: Colors.backgroundSelected,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxChecked: {
    backgroundColor: Accent,
    borderColor: Accent,
  },
  checkmark: {
    color: Colors.text,
    fontSize: 14,
    fontWeight: '700',
  },
  error: {
    color: Accent,
    marginTop: Spacing.three,
  },
  footer: {
    flexDirection: 'row',
    gap: Spacing.three,
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.three,
    borderTopWidth: 1,
    borderTopColor: Colors.backgroundSelected,
  },
  cancelButton: {
    flex: 1,
    borderWidth: 1,
    borderColor: Colors.backgroundSelected,
    borderRadius: Spacing.two,
    paddingVertical: Spacing.three,
    alignItems: 'center',
  },
  submitButton: {
    flex: 1,
    ...Glow.oxblood,
    backgroundColor: Accent,
    borderRadius: Spacing.two,
    paddingVertical: Spacing.three,
    alignItems: 'center',
  },
  submitButtonDisabled: {
    opacity: 0.5,
  },
});
