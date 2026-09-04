import { useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AnswerInput } from '@/components/question-answer-input';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Accent, Colors, Glow, Spacing } from '@/constants/theme';
import { getExternalFormByToken, submitExternalFormResponse, type PublicExternalForm } from '@/lib/external-forms';
import { getQuestionTypeDefinition, type AnswerValue, type QuestionType } from '@/lib/question-types';

function blankAnswerFor(questionType: QuestionType): AnswerValue {
  const kind = getQuestionTypeDefinition(questionType).answerKind;
  if (kind === 'short_text' || kind === 'numeric') return '';
  if (kind === 'multi_choice') return [];
  return null;
}

/**
 * The one screen a link recipient actually sees — deliberately outside
 * the (app) group entirely, so it never touches useAuth(), never
 * redirects to a login screen, and works exactly the same whether the
 * visitor has this app installed, has an account, or has never heard of
 * Primal Physique before. Everything it needs comes from two functions
 * in external-forms.ts, both of which resolve purely off the token in
 * the URL — see external-forms.sql for why those are the only way in.
 */
export default function PublicExternalFormScreen() {
  const { token } = useLocalSearchParams<{ token: string }>();

  const [form, setForm] = useState<PublicExternalForm | null>(null);
  const [answers, setAnswers] = useState<Record<string, AnswerValue>>({});
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    if (!token) return;
    getExternalFormByToken(token)
      .then((data) => {
        if (!data) {
          setNotFound(true);
          return;
        }
        setForm(data);
        const initial: Record<string, AnswerValue> = {};
        data.questions.forEach((q) => {
          initial[q.id] = blankAnswerFor(q.questionType);
        });
        setAnswers(initial);
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load this form.'))
      .finally(() => setLoading(false));
  }, [token]);

  const handleSubmit = async () => {
    if (!form || !token) return;
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
      await submitExternalFormResponse(token, payload);
      setSubmitted(true);
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
          <ThemedText type="small" themeColor="textSecondary" style={styles.brand}>
            PRIMAL PHYSIQUE
          </ThemedText>

          {loading && <ActivityIndicator style={styles.loader} />}

          {!loading && notFound && (
            <ThemedText themeColor="textSecondary" style={styles.notFound}>
              This form link isn&apos;t valid — double-check the link, or ask for a new one.
            </ThemedText>
          )}

          {!loading && !notFound && submitted && (
            <ThemedView type="backgroundElement" style={styles.thanksCard}>
              <ThemedText type="title" style={styles.thanksTitle}>
                Thanks!
              </ThemedText>
              <ThemedText themeColor="textSecondary">Your response has been recorded.</ThemedText>
            </ThemedView>
          )}

          {!loading && !notFound && !submitted && form && (
            <>
              <ThemedText type="title" style={styles.title}>
                {form.formName}
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
    maxWidth: 560,
    width: '100%',
    alignSelf: 'center',
  },
  brand: {
    letterSpacing: 2,
    marginBottom: Spacing.two,
  },
  loader: {
    marginTop: Spacing.six,
  },
  notFound: {
    textAlign: 'center',
    marginTop: Spacing.six,
  },
  title: {
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
  thanksCard: {
    ...Glow.teal,
    borderRadius: Spacing.four,
    padding: Spacing.five,
    gap: Spacing.two,
    alignItems: 'center',
    marginTop: Spacing.six,
  },
  thanksTitle: {
    marginBottom: Spacing.one,
  },
});
