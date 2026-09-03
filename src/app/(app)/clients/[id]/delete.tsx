import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Accent, Colors, Glow, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { deleteClient } from '@/lib/client-deletion';
import { getClient, type ClientSummary } from '@/lib/clients';
import { getErrorMessage } from '@/lib/errors';

const DELETED_ITEMS = [
  'Every logged workout, set, food entry, weight/body-measurement check-in, and progress photo',
  'All assigned workouts, programmes, check-in schedules, and habits',
  'Their entire chat history with you (both sides of the conversation)',
  'Their login — they will not be able to sign in again',
];

const KEPT_ITEMS = [
  'Anything they posted to Community stays exactly as written — body, image, replies, reactions — just re-labeled as posted by "Deleted user"',
];

/**
 * The one genuinely irreversible action in this app. Deliberately its
 * own screen, not a dialog — a coach has to actually navigate here and
 * read what's about to happen, not just tap through a modal by reflex.
 */
export default function DeleteClientScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const theme = useTheme();

  const [client, setClient] = useState<ClientSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [confirmText, setConfirmText] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    getClient(id)
      .then(setClient)
      .catch((err) => setLoadError(getErrorMessage(err, "Failed to load this client's details.")))
      .finally(() => setLoading(false));
  }, [id]);

  const confirmTarget = client?.fullName || client?.email || '';
  const canDelete = confirmText.trim().length > 0 && confirmText.trim() === confirmTarget;

  const handleDelete = async () => {
    if (!client || !canDelete) return;
    setDeleteError(null);
    setDeleting(true);
    try {
      await deleteClient(client.id);
      router.replace('/clients');
    } catch (err) {
      setDeleteError(getErrorMessage(err, 'Failed to delete this client.'));
      setDeleting(false);
    }
  };

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <Pressable onPress={() => router.back()} style={styles.backButton}>
          <ThemedText type="linkPrimary">Back</ThemedText>
        </Pressable>

        {loading && <ActivityIndicator style={styles.loader} />}
        {!loading && loadError && <ThemedText style={styles.error}>{loadError}</ThemedText>}

        {!loading && !loadError && client && (
          <ScrollView contentContainerStyle={styles.scrollContent}>
            <View style={styles.glowWrap}>
              <ThemedText type="title" style={styles.title}>
                Delete {confirmTarget}
              </ThemedText>
            </View>

            <ThemedText themeColor="textSecondary">
              This permanently deletes their account. There is no undo, no archive, and no way to restore this
              afterward — read the whole breakdown below before typing their name.
            </ThemedText>

            <ThemedText type="smallBold" style={styles.sectionLabel}>
              Permanently deleted
            </ThemedText>
            <ThemedView type="backgroundElement" style={styles.card}>
              {DELETED_ITEMS.map((item) => (
                <View key={item} style={styles.listRow}>
                  <ThemedText style={styles.bullet}>—</ThemedText>
                  <ThemedText type="small" style={styles.listText}>
                    {item}
                  </ThemedText>
                </View>
              ))}
            </ThemedView>

            <ThemedText type="smallBold" style={styles.sectionLabel}>
              Kept — anonymized, not deleted
            </ThemedText>
            <ThemedView type="backgroundElement" style={styles.card}>
              {KEPT_ITEMS.map((item) => (
                <View key={item} style={styles.listRow}>
                  <ThemedText style={styles.bulletTeal}>—</ThemedText>
                  <ThemedText type="small" style={styles.listText}>
                    {item}
                  </ThemedText>
                </View>
              ))}
            </ThemedView>

            <ThemedText type="smallBold" style={styles.sectionLabel}>
              Type their name to confirm
            </ThemedText>
            <ThemedText type="small" themeColor="textSecondary" style={styles.confirmHint}>
              Type exactly: {confirmTarget}
            </ThemedText>
            <TextInput
              value={confirmText}
              onChangeText={setConfirmText}
              placeholder={confirmTarget}
              placeholderTextColor={theme.textSecondary}
              autoCapitalize="none"
              autoCorrect={false}
              style={[styles.input, { color: theme.text, borderColor: theme.backgroundSelected }]}
            />

            {deleteError && <ThemedText style={styles.error}>{deleteError}</ThemedText>}

            <Pressable
              style={({ pressed }) => [
                styles.deleteButton,
                (!canDelete || deleting) && styles.deleteButtonDisabled,
                pressed && canDelete && styles.pressed,
              ]}
              onPress={handleDelete}
              disabled={!canDelete || deleting}>
              {deleting ? (
                <ActivityIndicator color={Colors.text} />
              ) : (
                <ThemedText type="smallBold" style={styles.deleteButtonText}>
                  Permanently delete this client
                </ThemedText>
              )}
            </Pressable>
          </ScrollView>
        )}
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  safeArea: { flex: 1, paddingHorizontal: Spacing.four, paddingTop: Spacing.four },
  backButton: {
    marginBottom: Spacing.two,
  },
  loader: {
    marginTop: Spacing.five,
  },
  error: {
    color: Accent,
  },
  scrollContent: {
    gap: Spacing.two,
    paddingBottom: Spacing.six,
  },
  glowWrap: {
    ...Glow.oxblood,
    alignSelf: 'flex-start',
  },
  title: {
    fontSize: 30,
    lineHeight: 36,
  },
  sectionLabel: {
    marginTop: Spacing.three,
  },
  card: {
    borderRadius: Spacing.two,
    padding: Spacing.three,
    gap: Spacing.two,
  },
  listRow: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  bullet: {
    color: Accent,
  },
  bulletTeal: {
    color: Colors.tealBright,
  },
  listText: {
    flex: 1,
  },
  confirmHint: {
    marginTop: -Spacing.one,
  },
  input: {
    borderWidth: 1,
    borderRadius: Spacing.two,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.three,
    fontSize: 16,
  },
  deleteButton: {
    ...Glow.oxblood,
    backgroundColor: Accent,
    borderRadius: Spacing.two,
    paddingVertical: Spacing.three,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: Spacing.two,
  },
  deleteButtonDisabled: {
    opacity: 0.4,
  },
  pressed: {
    opacity: 0.85,
  },
  deleteButtonText: {
    color: Colors.text,
  },
});
