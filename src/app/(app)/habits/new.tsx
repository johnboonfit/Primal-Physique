import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, TextInput } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Accent, Colors, Glow, Spacing } from '@/constants/theme';
import { listClientOptions, type ClientOption } from '@/lib/assignments';
import { useAuth } from '@/context/auth-context';
import { useTheme } from '@/hooks/use-theme';
import { createHabit } from '@/lib/habits';

export default function NewHabitScreen() {
  const theme = useTheme();
  const { session } = useAuth();

  const [clients, setClients] = useState<ClientOption[]>([]);
  const [loadingClients, setLoadingClients] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [clientId, setClientId] = useState<string | null>(null);
  const [name, setName] = useState('');

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    listClientOptions()
      .then(setClients)
      .catch((err) => setLoadError(err instanceof Error ? err.message : 'Failed to load clients.'))
      .finally(() => setLoadingClients(false));
  }, []);

  const handleSave = async () => {
    setError(null);
    if (!session) return;

    if (!clientId) {
      setError('Pick a client.');
      return;
    }
    if (!name.trim()) {
      setError('Enter a habit name.');
      return;
    }

    setSaving(true);
    try {
      await createHabit(session.user.id, clientId, name.trim());
      router.replace('/habits');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong saving this habit.');
    } finally {
      setSaving(false);
    }
  };

  if (loadingClients) {
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
            New habit
          </ThemedText>

          {loadError && <ThemedText style={styles.error}>{loadError}</ThemedText>}

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
            Habit name
          </ThemedText>
          <TextInput
            value={name}
            onChangeText={setName}
            placeholder="e.g. 10k steps"
            placeholderTextColor={theme.textSecondary}
            style={[styles.input, { color: theme.text, borderColor: theme.backgroundSelected }]}
          />

          {error && <ThemedText style={styles.error}>{error}</ThemedText>}

          <Pressable
            style={({ pressed }) => [styles.primaryButton, pressed && styles.pressed]}
            onPress={handleSave}
            disabled={saving}>
            {saving ? (
              <ActivityIndicator color={Colors.text} />
            ) : (
              <ThemedText type="smallBold" style={styles.primaryButtonText}>
                Save habit
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
