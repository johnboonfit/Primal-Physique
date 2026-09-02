import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AnswerInput } from '@/components/question-answer-input';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Accent, Colors, Glow, Spacing } from '@/constants/theme';
import { useAuth } from '@/context/auth-context';
import { getCheckInDetail, submitCheckIn, type CheckInDetail, type CheckInQuestionAnswer } from '@/lib/form-check-ins';
import { getQuestionTypeDefinition, type AnswerValue } from '@/lib/question-types';

/** A sensible starting value per answer kind, used only when a question
 * has no existing answer yet — 0/blank would be a real (wrong) answer
 * for a scale or single-select, so those start at `null` instead. */
function blankAnswerFor(question: CheckInQuestionAnswer): AnswerValue {
  if (question.answer !== null) return question.answer as AnswerValue;
  const kind = getQuestionTypeDefinition(question.questionType).answerKind;
  if (kind === 'short_text' || kind === 'numeric') return '';
  if (kind === 'multi_choice') return [];
  return null;
}

function formatStoredAnswer(question: CheckInQuestionAnswer): string {
  const answer = question.answer;
  if (answer === null || answer === undefined) return '—';
  if (Array.isArray(answer)) return answer.length > 0 ? answer.join(', ') : '—';
  return String(answer);
}

function buildAnswers(detail: CheckInDetail): Record<string, AnswerValue> {
  const answers: Record<string, AnswerValue> = {};
  detail.questions.forEach((question) => {
    answers[question.id] = blankAnswerFor(question);
  });
  return answers;
}

export default function CheckInDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { session } = useAuth();

  const [detail, setDetail] = useState<CheckInDetail | null>(null);
  const [answers, setAnswers] = useState<Record<string, AnswerValue>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;

    getCheckInDetail(id)
      .then((data) => {
        if (cancelled) return;
        setDetail(data);
        setAnswers(buildAnswers(data));
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load this check-in.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [id]);

  const handleSubmit = async () => {
    setSaveError(null);
    if (!session || !detail) return;

    for (let i = 0; i < detail.questions.length; i++) {
      const question = detail.questions[i];
      const typeDefinition = getQuestionTypeDefinition(question.questionType);
      const validationError = typeDefinition.validateAnswer(question.config, answers[question.id] ?? null);
      if (validationError) {
        setSaveError(`Question ${i + 1}: ${validationError}`);
        return;
      }
    }

    setSaving(true);
    try {
      const submission = detail.questions.map((question) => {
        const typeDefinition = getQuestionTypeDefinition(question.questionType);
        return {
          questionId: question.id,
          answer: typeDefinition.toStoredAnswer(question.config, answers[question.id] ?? null),
        };
      });
      await submitCheckIn(detail.id, session.user.id, submission);
      const refreshed = await getCheckInDetail(detail.id);
      setDetail(refreshed);
      setAnswers(buildAnswers(refreshed));
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Something went wrong submitting your check-in.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
          <Pressable onPress={() => router.back()} style={styles.backButton}>
            <ThemedText type="linkPrimary">Back</ThemedText>
          </Pressable>

          {loading && <ActivityIndicator style={styles.loader} />}
          {!loading && error && <ThemedText style={styles.error}>{error}</ThemedText>}

          {!loading && detail && (
            <>
              <ThemedText type="title" style={styles.title}>
                {detail.formName}
              </ThemedText>
              <ThemedText themeColor="textSecondary" style={styles.date}>
                Due {detail.scheduledDate} ·{' '}
                <ThemedText
                  type="smallBold"
                  themeColor={detail.status === 'pending' ? 'textSecondary' : undefined}
                  style={detail.status === 'completed' ? styles.statusCompleted : detail.status === 'missed' ? styles.statusMissed : undefined}>
                  {detail.status === 'completed' ? 'Completed' : detail.status === 'missed' ? 'Missed' : 'Pending'}
                </ThemedText>
              </ThemedText>

              {detail.status === 'missed' && (
                <ThemedText themeColor="textSecondary" style={styles.missedNotice}>
                  This check-in wasn&apos;t completed in time and is no longer active.
                </ThemedText>
              )}

              {detail.questions.map((question, index) => {
                const typeDefinition = getQuestionTypeDefinition(question.questionType);
                return (
                  <ThemedView key={question.id} type="backgroundElement" style={styles.questionCard}>
                    <ThemedText type="smallBold">
                      {index + 1}. {question.label}
                    </ThemedText>

                    {detail.status === 'pending' ? (
                      <AnswerInput
                        answerKind={typeDefinition.answerKind}
                        config={question.config}
                        value={answers[question.id] ?? null}
                        onChange={(value) => setAnswers((current) => ({ ...current, [question.id]: value }))}
                      />
                    ) : (
                      <ThemedText type="small" themeColor="textSecondary">
                        {formatStoredAnswer(question)}
                      </ThemedText>
                    )}
                  </ThemedView>
                );
              })}

              {saveError && <ThemedText style={styles.error}>{saveError}</ThemedText>}

              {detail.status === 'pending' && (
                <Pressable
                  style={({ pressed }) => [styles.primaryButton, pressed && styles.pressed]}
                  onPress={handleSubmit}
                  disabled={saving}>
                  {saving ? (
                    <ActivityIndicator color={Colors.text} />
                  ) : (
                    <ThemedText type="smallBold" style={styles.primaryButtonText}>
                      Submit check-in
                    </ThemedText>
                  )}
                </Pressable>
              )}
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
  backButton: {
    marginBottom: Spacing.two,
  },
  title: {
    marginTop: Spacing.two,
  },
  date: {
    marginBottom: Spacing.two,
  },
  statusCompleted: {
    color: Colors.tealBright,
  },
  statusMissed: {
    color: Accent,
  },
  missedNotice: {
    marginBottom: Spacing.two,
  },
  loader: {
    marginTop: Spacing.five,
  },
  error: {
    color: Accent,
    textAlign: 'center',
  },
  questionCard: {
    borderRadius: Spacing.two,
    padding: Spacing.three,
    gap: Spacing.two,
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
});
