import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Accent, Colors, Glow, Spacing } from '@/constants/theme';
import { useAuth } from '@/context/auth-context';
import { useTheme } from '@/hooks/use-theme';
import { listClientOptions, type ClientOption } from '@/lib/assignments';
import { createFormAssignment, listUpcomingCheckInDates } from '@/lib/form-assignments';
import { getFormTemplateDetail, type FormTemplateDetail } from '@/lib/form-templates';
import { SCHEDULED_DAYS, type ScheduledDay } from '@/lib/programmes';

const PREVIEW_COUNT = 5;
const DEFAULT_DUE_WINDOW_HOURS = '48';

function todayISODate() {
  return new Date().toISOString().slice(0, 10);
}

function displayDate(isoDate: string) {
  return new Date(`${isoDate}T00:00:00.000Z`).toLocaleDateString(undefined, {
    timeZone: 'UTC',
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
}

export default function AssignFormScreen() {
  const theme = useTheme();
  const { session } = useAuth();
  const { id } = useLocalSearchParams<{ id: string }>();

  const [form, setForm] = useState<FormTemplateDetail | null>(null);
  const [clients, setClients] = useState<ClientOption[]>([]);
  const [loadingOptions, setLoadingOptions] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [clientId, setClientId] = useState<string | null>(null);
  const [recurrenceDay, setRecurrenceDay] = useState<ScheduledDay>('mon');
  const [dueWindowHours, setDueWindowHours] = useState(DEFAULT_DUE_WINDOW_HOURS);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;

    Promise.all([getFormTemplateDetail(id), listClientOptions()])
      .then(([formData, clientOptions]) => {
        if (cancelled) return;
        setForm(formData);
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

  const parsedDueWindow = Number(dueWindowHours);
  const hasValidDueWindow = dueWindowHours.trim().length > 0 && Number.isInteger(parsedDueWindow) && parsedDueWindow > 0;

  // Recomputed on every render as the coach changes day/due-window — this
  // is the live proof that the recurrence rule produces the right
  // sequence of future dates before anything is even saved.
  const preview = useMemo(() => {
    if (!hasValidDueWindow) return [];
    return listUpcomingCheckInDates(recurrenceDay, parsedDueWindow, todayISODate(), PREVIEW_COUNT);
  }, [recurrenceDay, parsedDueWindow, hasValidDueWindow]);

  const handleAssign = async () => {
    setError(null);
    if (!session || !id) return;

    if (!clientId) {
      setError('Pick a client.');
      return;
    }
    if (!hasValidDueWindow) {
      setError('Due window must be a whole number of hours greater than 0.');
      return;
    }

    setSaving(true);
    try {
      await createFormAssignment(session.user.id, {
        formId: id,
        clientId,
        recurrenceDay,
        dueWindowHours: parsedDueWindow,
      });
      // Land on the client's own page — the new Check-in Schedule section
      // there is the one place this assignment is visible after saving.
      router.replace(`/clients/${clientId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong assigning this form.');
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
            Assign check-in
          </ThemedText>

          {loadError && <ThemedText style={styles.error}>{loadError}</ThemedText>}

          {form && (
            <ThemedView type="backgroundElement" style={styles.formCard}>
              <ThemedText type="smallBold">{form.name}</ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                {form.questions.length} question{form.questions.length === 1 ? '' : 's'}
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
            Repeats weekly on
          </ThemedText>
          <View style={styles.chipRow}>
            {SCHEDULED_DAYS.map(({ key, label }) => {
              const selected = recurrenceDay === key;
              return (
                <Pressable
                  key={key}
                  onPress={() => setRecurrenceDay(key)}
                  style={[styles.chip, { borderColor: theme.backgroundSelected }, selected && styles.chipSelected]}>
                  <ThemedText type="small" style={selected ? styles.chipTextSelected : undefined}>
                    {label}
                  </ThemedText>
                </Pressable>
              );
            })}
          </View>

          <ThemedText type="smallBold" style={styles.sectionLabel}>
            Due window (hours)
          </ThemedText>
          <TextInput
            value={dueWindowHours}
            onChangeText={setDueWindowHours}
            placeholder="48"
            keyboardType="number-pad"
            placeholderTextColor={theme.textSecondary}
            style={[styles.input, styles.dueWindowInput, { color: theme.text, borderColor: theme.backgroundSelected }]}
          />
          <ThemedText type="small" themeColor="textSecondary">
            How long after the scheduled date a submission still counts as on time — e.g. 48 hours means Monday's
            check-in is on time until Wednesday at the same time.
          </ThemedText>

          <ThemedText type="smallBold" style={styles.sectionLabel}>
            Next {PREVIEW_COUNT} check-ins
          </ThemedText>
          {preview.length === 0 ? (
            <ThemedText type="small" themeColor="textSecondary">
              Enter a valid due window to see the upcoming schedule.
            </ThemedText>
          ) : (
            preview.map((occurrence) => (
              <ThemedView key={occurrence.scheduledDate} type="backgroundElement" style={styles.previewRow}>
                <ThemedText type="small">{displayDate(occurrence.scheduledDate)}</ThemedText>
                <ThemedText type="small" themeColor="textSecondary">
                  Due until {new Date(occurrence.deadline).toLocaleString(undefined, { timeZone: 'UTC' })} UTC
                </ThemedText>
              </ThemedView>
            ))
          )}

          {error && <ThemedText style={styles.error}>{error}</ThemedText>}

          <Pressable
            style={({ pressed }) => [styles.primaryButton, pressed && styles.pressed]}
            onPress={handleAssign}
            disabled={saving}>
            {saving ? (
              <ActivityIndicator color={Colors.text} />
            ) : (
              <ThemedText type="smallBold" style={styles.primaryButtonText}>
                Assign check-in
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
  formCard: {
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
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  chip: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
  },
  chipSelected: {
    ...Glow.oxblood,
    backgroundColor: Accent,
    borderColor: Accent,
  },
  chipTextSelected: {
    color: Colors.text,
    fontWeight: '700',
  },
  input: {
    borderWidth: 1,
    borderRadius: Spacing.two,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.three,
    fontSize: 16,
  },
  dueWindowInput: {
    maxWidth: 160,
  },
  previewRow: {
    borderRadius: Spacing.two,
    padding: Spacing.two,
    marginTop: Spacing.half,
    gap: Spacing.half,
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
