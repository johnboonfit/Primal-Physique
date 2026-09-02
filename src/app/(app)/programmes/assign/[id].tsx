import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, TextInput } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Accent, Colors, Glow, Spacing } from '@/constants/theme';
import { useAuth } from '@/context/auth-context';
import { useTheme } from '@/hooks/use-theme';
import { listClientOptions, type ClientOption } from '@/lib/assignments';
import { assignProgrammeToClient, getProgrammeDetail, GOAL_TYPES, type ProgrammeDetail } from '@/lib/programmes';

function todayISODate() {
  return new Date().toISOString().slice(0, 10);
}

function goalLabel(goalType: ProgrammeDetail['goalType']) {
  return GOAL_TYPES.find((g) => g.key === goalType)?.label ?? goalType;
}

export default function AssignProgrammeScreen() {
  const theme = useTheme();
  const { session } = useAuth();
  const { id } = useLocalSearchParams<{ id: string }>();

  const [template, setTemplate] = useState<ProgrammeDetail | null>(null);
  const [clients, setClients] = useState<ClientOption[]>([]);
  const [loadingOptions, setLoadingOptions] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [clientId, setClientId] = useState<string | null>(null);
  const [startDate, setStartDate] = useState(todayISODate());

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;

    Promise.all([getProgrammeDetail(id), listClientOptions()])
      .then(([templateData, clientOptions]) => {
        if (cancelled) return;
        setTemplate(templateData);
        setClients(clientOptions);
      })
      .catch((err) => {
        if (!cancelled) setLoadError(err instanceof Error ? err.message : 'Failed to load options.');
      })
      .finally(() => {
        if (!cancelled) setLoadingOptions(false);
      });

    return () => {
      cancelled = true;
    };
  }, [id]);

  const handleAssign = async () => {
    setError(null);
    if (!session || !id) return;

    if (!clientId) {
      setError('Pick a client.');
      return;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate)) {
      setError('Enter the start date as YYYY-MM-DD.');
      return;
    }

    setSaving(true);
    try {
      await assignProgrammeToClient(session.user.id, clientId, id, startDate);
      router.replace('/assignments');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong assigning this programme.');
    } finally {
      setSaving(false);
    }
  };

  if (loadingOptions) {
    return (
      <ThemedView style={styles.container}>
        <SafeAreaView style={[styles.safeArea, styles.centered]}>
          <ActivityIndicator />
        </SafeAreaView>
      </ThemedView>
    );
  }

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
          <ThemedText type="title" style={styles.title}>
            Assign programme
          </ThemedText>

          {loadError && <ThemedText style={styles.error}>{loadError}</ThemedText>}

          {template && (
            <ThemedView type="backgroundElement" style={styles.templateCard}>
              <ThemedText type="smallBold">{template.name}</ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                {goalLabel(template.goalType)} · {template.durationWeeks}-week programme · {template.weekCount} week
                {template.weekCount === 1 ? '' : 's'} built
              </ThemedText>
            </ThemedView>
          )}

          {!loadError && clients.length === 0 && (
            <ThemedText themeColor="textSecondary">There are no client accounts yet.</ThemedText>
          )}

          {clients.length > 0 && (
            <>
              <ThemedText type="smallBold" style={styles.sectionLabel}>
                Client
              </ThemedText>
              {clients.map((client) => {
                const selected = client.id === clientId;
                return (
                  <Pressable key={client.id} onPress={() => setClientId(client.id)}>
                    <ThemedView
                      type="backgroundElement"
                      style={[styles.optionRow, selected && styles.optionRowSelected]}>
                      <ThemedText type={selected ? 'smallBold' : 'default'}>{client.email}</ThemedText>
                    </ThemedView>
                  </Pressable>
                );
              })}
            </>
          )}

          <ThemedText type="smallBold" style={styles.sectionLabel}>
            Start date
          </ThemedText>
          <TextInput
            value={startDate}
            onChangeText={setStartDate}
            placeholder="YYYY-MM-DD"
            placeholderTextColor={theme.textSecondary}
            style={[styles.input, { color: theme.text, borderColor: theme.backgroundSelected }]}
          />
          <ThemedText type="small" themeColor="textSecondary">
            Week 1 runs from this date for 7 days; sessions land on the programme's scheduled training days within
            that window.
          </ThemedText>

          {error && <ThemedText style={styles.error}>{error}</ThemedText>}

          <Pressable
            style={({ pressed }) => [styles.primaryButton, pressed && styles.pressed]}
            onPress={handleAssign}
            disabled={saving}>
            {saving ? (
              <ActivityIndicator color={Colors.text} />
            ) : (
              <ThemedText type="smallBold" style={styles.primaryButtonText}>
                Assign programme
              </ThemedText>
            )}
          </Pressable>

          <Pressable style={styles.cancelButton} onPress={() => router.back()}>
            <ThemedText themeColor="textSecondary">Cancel</ThemedText>
          </Pressable>
        </ScrollView>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  safeArea: { flex: 1 },
  centered: { alignItems: 'center', justifyContent: 'center' },
  scrollContent: {
    padding: Spacing.four,
    gap: Spacing.two,
  },
  title: {
    marginBottom: Spacing.two,
  },
  templateCard: {
    borderRadius: Spacing.two,
    padding: Spacing.three,
    gap: Spacing.half,
    marginBottom: Spacing.two,
  },
  sectionLabel: {
    marginTop: Spacing.three,
  },
  optionRow: {
    borderWidth: 1,
    borderColor: 'transparent',
    borderRadius: Spacing.two,
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.three,
    marginTop: Spacing.half,
  },
  optionRowSelected: {
    borderColor: Accent,
  },
  input: {
    borderWidth: 1,
    borderRadius: Spacing.two,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.three,
    fontSize: 16,
  },
  error: {
    color: Accent,
    textAlign: 'center',
  },
  primaryButton: {
    ...Glow.oxblood,
    backgroundColor: Accent,
    borderRadius: Spacing.two,
    paddingVertical: Spacing.three,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: Spacing.three,
  },
  pressed: {
    opacity: 0.85,
  },
  primaryButtonText: {
    color: Colors.text,
  },
  cancelButton: {
    alignItems: 'center',
    paddingVertical: Spacing.two,
  },
});
