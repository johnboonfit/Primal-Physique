import { Redirect, router } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AnswerInput } from '@/components/question-answer-input';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Accent, Colors, Glow, Spacing } from '@/constants/theme';
import { useAuth } from '@/context/auth-context';
import type { ExternalFormDetail } from '@/lib/external-forms';
import { getOnboardingStatus, getParqForm, submitOnboardingParq } from '@/lib/onboarding';
import { getQuestionTypeDefinition, type AnswerValue } from '@/lib/question-types';

function blankAnswerFor(question: ExternalFormDetail['questions'][number]): AnswerValue {
  const kind = getQuestionTypeDefinition(question.questionType).answerKind;
  if (kind === 'short_text' || kind === 'numeric') return '';
  if (kind === 'multi_choice') return [];
  return null;
}

/**
 * Step 3. Requires a real session — a client who somehow lands here
 * without one gets sent back to Welcome. Reuses the exact PARQ template
 * built last chunk (via app_settings.parq_form_id) and the same
 * <AnswerInput> every other question-answering screen in this app uses.
 * Submitting evaluates the health flag server-side (a database trigger,
 * see onboarding.sql) — this screen just asks getOnboardingStatus()
 * afterward to find out where to send the client next, the exact same
 * function that decides where a RESUMING client lands.
 */
export default function OnboardingParqScreen() {
  const { session, loadingProfile } = useAuth();

  const [form, setForm] = useState<ExternalFormDetail | null>(null);
  const [answers, setAnswers] = useState<Record<string, AnswerValue>>({});
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!session) return;
    getParqForm()
      .then((data) => {
        setForm(data);
        if (data) {
          const initial: Record<string, AnswerValue> = {};
          data.questions.forEach((q) => {
            initial[q.id] = blankAnswerFor(q);
          });
          setAnswers(initial);
        }
      })
      .catch((err) => setLoadError(err instanceof Error ? err.message : 'Failed to load the health screening form.'))
      .finally(() => setLoading(false));
  }, [session]);

  if (!loadingProfile && !session) {
    return <Redirect href="/welcome" />;
  }

  const handleSubmit = async () => {
    if (!session || !form) return;
    setError(null);

    for (let i = 0; i < form.questions.length; i++) {
      const question = form.questions[i];
      const typeDefinition = getQuestionTypeDefinition(question.questionType);
      const validationError = typeDefinition.validateAnswer(question.config, answers[question.id] ?? null);
      if (validationError) {
        setError(`Question ${i + 1}: ${validationError}`);
        return;
      }
    }

    setSubmitting(true);
    try {
      const payload = form.questions.map((question) => {
        const typeDefinition = getQuestionTypeDefinition(question.questionType);
        return {
          questionId: question.id,
          answer: typeDefinition.toStoredAnswer(question.config, answers[question.id] ?? null),
        };
      });
      await submitOnboardingParq(session.user.id, payload);

      const status = await getOnboardingStatus(session.user.id);
      router.replace(status === 'needs_health_review' ? '/health-advisory' : '/client');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong submitting this form.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
          {loading && <ActivityIndicator style={styles.loader} />}

          {!loading && loadError && (
            <ThemedText style={styles.error}>
              Couldn&apos;t load your health screening form: {loadError}
            </ThemedText>
          )}

          {!loading && !loadError && !form && (
            <ThemedText themeColor="textSecondary" style={styles.notFound}>
              No health screening form is configured yet — contact your coach.
            </ThemedText>
          )}

          {!loading && !loadError && form && (
            <>
              <ThemedText type="title" style={styles.title}>
                {form.name}
              </ThemedText>
              <ThemedText themeColor="textSecondary" style={styles.subtitle}>
                Standard pre-exercise health screening. Answer honestly — a "Yes" doesn&apos;t stop you training, it
                just means we&apos;ll check in about it first.
              </ThemedText>

              {form.questions.map((question, index) => {
                const typeDefinition = getQuestionTypeDefinition(question.questionType);
                return (
                  <ThemedView key={question.id} type="backgroundElement" style={styles.questionCard}>
                    <ThemedText type="smallBold">
                      {index + 1}. {question.label}
                    </ThemedText>
                    <AnswerInput
                      answerKind={typeDefinition.answerKind}
                      config={question.config}
                      value={answers[question.id] ?? null}
                      onChange={(value) => setAnswers((current) => ({ ...current, [question.id]: value }))}
                    />
                  </ThemedView>
                );
              })}

              {error && <ThemedText style={styles.error}>{error}</ThemedText>}

              <Pressable
                style={({ pressed }) => [styles.primaryButton, pressed && styles.pressed]}
                onPress={handleSubmit}
                disabled={submitting}>
                {submitting ? (
                  <ActivityIndicator color={Colors.text} />
                ) : (
                  <ThemedText type="smallBold" style={styles.primaryButtonText}>
                    Submit
                  </ThemedText>
                )}
              </Pressable>
            </>
          )}
        </ScrollView>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  safeArea: { flex: 1 },
  scrollContent: {
    padding: Spacing.four,
    gap: Spacing.two,
  },
  loader: {
    marginTop: Spacing.six,
  },
  notFound: {
    textAlign: 'center',
    marginTop: Spacing.six,
  },
  title: {
    marginBottom: Spacing.half,
  },
  subtitle: {
    marginBottom: Spacing.two,
  },
  questionCard: {
    borderRadius: Spacing.two,
    padding: Spacing.three,
    gap: Spacing.two,
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
    marginTop: Spacing.two,
  },
  pressed: {
    opacity: 0.85,
  },
  primaryButtonText: {
    color: Colors.text,
  },
});
