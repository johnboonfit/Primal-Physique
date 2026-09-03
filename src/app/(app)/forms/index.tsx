import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { HeroStat } from '@/components/hero-stat';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Accent, Colors, Glow, Spacing } from '@/constants/theme';
import { useAuth } from '@/context/auth-context';
import { listFormTemplates, type FormTemplateSummary } from '@/lib/form-templates';
import { getReadinessFormId, setReadinessFormId } from '@/lib/readiness';

export default function FormsListScreen() {
  const { session } = useAuth();
  const [forms, setForms] = useState<FormTemplateSummary[]>([]);
  const [readinessFormId, setReadinessFormIdState] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [settingReadinessId, setSettingReadinessId] = useState<string | null>(null);
  const [readinessError, setReadinessError] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      if (!session) return;
      let cancelled = false;

      setLoading(true);
      Promise.all([listFormTemplates(session.user.id), getReadinessFormId()])
        .then(([formsData, readinessId]) => {
          if (cancelled) return;
          setForms(formsData);
          setReadinessFormIdState(readinessId);
        })
        .catch((err) => {
          if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load forms.');
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });

      return () => {
        cancelled = true;
      };
    }, [session])
  );

  const handleSetReadiness = async (formId: string) => {
    setReadinessError(null);
    setSettingReadinessId(formId);
    try {
      await setReadinessFormId(formId);
      setReadinessFormIdState(formId);
    } catch (err) {
      setReadinessError(err instanceof Error ? err.message : 'Failed to set the readiness questionnaire.');
    } finally {
      setSettingReadinessId(null);
    }
  };

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <ThemedView style={styles.header}>
          <ThemedText type="title">Check-in Forms</ThemedText>
          <Pressable style={styles.newButton} onPress={() => router.push('/forms/new')}>
            <ThemedText type="smallBold" style={styles.newButtonText}>
              + New
            </ThemedText>
          </Pressable>
        </ThemedView>
        <ThemedText themeColor="textSecondary" type="small" style={styles.subtitle}>
          Reusable check-in forms — assign one to a client on a recurring schedule. One form can also be set as the
          Pre-Workout Readiness questionnaire, shown to every client at the start of every session.
        </ThemedText>

        {!loading && !error && <HeroStat value={forms.length} label="Forms Built" />}

        {loading && <ActivityIndicator style={styles.loader} />}

        {!loading && error && <ThemedText style={styles.error}>{error}</ThemedText>}
        {readinessError && <ThemedText style={styles.error}>{readinessError}</ThemedText>}

        {!loading && !error && forms.length === 0 && (
          <ThemedText themeColor="textSecondary" style={styles.empty}>
            No forms yet. Tap + New to build your first check-in.
          </ThemedText>
        )}

        {!loading && !error && forms.length > 0 && (
          <FlatList
            data={forms}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.listContent}
            renderItem={({ item }) => {
              const isReadiness = item.id === readinessFormId;
              return (
                <ThemedView type="backgroundElement" style={styles.card}>
                  <Pressable onPress={() => router.push(`/forms/${item.id}`)}>
                    <ThemedText type="smallBold">{item.name}</ThemedText>
                    <ThemedText type="small" themeColor="textSecondary">
                      {item.questionCount} question{item.questionCount === 1 ? '' : 's'}
                    </ThemedText>
                    {isReadiness && (
                      <ThemedText type="small" style={styles.readinessBadge}>
                        ✓ Pre-Workout Readiness questionnaire
                      </ThemedText>
                    )}
                  </Pressable>
                  <View style={styles.cardActions}>
                    <Pressable onPress={() => router.push(`/forms/assign/${item.id}`)}>
                      <ThemedText type="linkPrimary">Assign</ThemedText>
                    </Pressable>
                    {!isReadiness && (
                      <Pressable onPress={() => handleSetReadiness(item.id)} disabled={settingReadinessId === item.id}>
                        {settingReadinessId === item.id ? (
                          <ActivityIndicator size="small" />
                        ) : (
                          <ThemedText type="linkPrimary">Set as readiness</ThemedText>
                        )}
                      </Pressable>
                    )}
                  </View>
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
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.two,
  },
  newButton: {
    ...Glow.oxblood,
    backgroundColor: Accent,
    borderRadius: Spacing.two,
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.three,
  },
  newButtonText: {
    color: Colors.text,
  },
  subtitle: {
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
  cardActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: Spacing.three,
  },
  readinessBadge: {
    color: Colors.tealBright,
    marginTop: Spacing.half,
  },
  backButton: {
    alignItems: 'center',
    paddingVertical: Spacing.three,
  },
});
