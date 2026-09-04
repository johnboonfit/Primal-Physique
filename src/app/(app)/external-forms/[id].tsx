import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ConfirmDialog } from '@/components/confirm-dialog';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Accent, Colors, Glow, Spacing } from '@/constants/theme';
import {
  deleteExternalForm,
  getExternalFormDetail,
  listExternalFormResponses,
  type ExternalFormDetail,
  type ExternalFormQuestionDetail,
  type ExternalFormSubmission,
} from '@/lib/external-forms';
import { getQuestionTypeDefinition, type ConfigFieldDefinition, type QuestionConfig } from '@/lib/question-types';

/** Same generic, per-field-kind review text as forms/[id].tsx. */
function describeConfigField(field: ConfigFieldDefinition, config: QuestionConfig): string {
  if (field.kind === 'text') {
    const value = config[field.key];
    return `${field.label}: ${typeof value === 'string' && value.trim() ? value : '(none)'}`;
  }
  if (field.kind === 'range') {
    return `${field.label}: ${config[field.minKey]}–${config[field.maxKey]}`;
  }
  const options = Array.isArray(config[field.key]) ? (config[field.key] as string[]) : [];
  return `${field.label}: ${options.join(', ')}`;
}

function formatAnswer(answer: unknown): string {
  if (answer === null || answer === undefined) return '—';
  if (Array.isArray(answer)) return answer.length > 0 ? answer.join(', ') : '—';
  return String(answer);
}

function QuestionSummary({ question, index }: { question: ExternalFormQuestionDetail; index: number }) {
  const typeDefinition = getQuestionTypeDefinition(question.questionType);

  return (
    <ThemedView type="backgroundElement" style={styles.card}>
      <ThemedText type="small" themeColor="textSecondary">
        Question {index + 1} · {typeDefinition.label}
      </ThemedText>
      <ThemedText type="smallBold">{question.label}</ThemedText>
      {typeDefinition.configFields.map((field) => (
        <ThemedText key={field.key} type="small" themeColor="textSecondary">
          {describeConfigField(field, question.config)}
        </ThemedText>
      ))}
    </ThemedView>
  );
}

function SubmissionCard({ submission }: { submission: ExternalFormSubmission }) {
  return (
    <ThemedView type="backgroundElement" style={styles.card}>
      <ThemedText type="small" themeColor="textSecondary">
        Submitted {new Date(submission.submittedAt).toLocaleString()}
      </ThemedText>
      {submission.answers.map((answer, index) => (
        <ThemedText key={index} type="small">
          <ThemedText type="smallBold">{answer.label}: </ThemedText>
          {formatAnswer(answer.answer)}
        </ThemedText>
      ))}
    </ThemedView>
  );
}

export default function ExternalFormDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();

  const [form, setForm] = useState<ExternalFormDetail | null>(null);
  const [submissions, setSubmissions] = useState<ExternalFormSubmission[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      if (!id) return;
      let cancelled = false;

      setLoading(true);
      Promise.all([getExternalFormDetail(id), listExternalFormResponses(id)])
        .then(([formData, submissionData]) => {
          if (cancelled) return;
          setForm(formData);
          setSubmissions(submissionData);
        })
        .catch((err) => {
          if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load this form.');
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });

      return () => {
        cancelled = true;
      };
    }, [id])
  );

  const shareUrl = form && typeof window !== 'undefined' ? `${window.location.origin}/e/${form.shareToken}` : (form?.shareToken ?? '');

  const handleCopy = async () => {
    if (!shareUrl || typeof navigator === 'undefined' || !navigator.clipboard) return;
    await navigator.clipboard.writeText(shareUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleConfirmDelete = async () => {
    if (!form) return;
    setDeleteError(null);
    setDeleting(true);
    try {
      await deleteExternalForm(form.id);
      router.replace('/external-forms');
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : 'Failed to delete this form.');
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
        {!loading && error && <ThemedText style={styles.error}>{error}</ThemedText>}

        {!loading && !error && form && (
          <ScrollView contentContainerStyle={styles.scrollContent}>
            <ThemedText type="title" style={styles.title}>
              {form.name}
            </ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              {form.questions.length} question{form.questions.length === 1 ? '' : 's'} · no login required to view or submit
            </ThemedText>

            <ThemedText type="smallBold" style={styles.sectionLabel}>
              Shareable link
            </ThemedText>
            <ThemedView type="backgroundElement" style={styles.linkCard}>
              <ThemedText type="small" style={styles.linkText} selectable>
                {shareUrl}
              </ThemedText>
              <Pressable onPress={handleCopy}>
                <ThemedText type="linkPrimary">{copied ? 'Copied ✓' : 'Copy link'}</ThemedText>
              </Pressable>
            </ThemedView>

            <ThemedText type="smallBold" style={styles.sectionLabel}>
              Questions
            </ThemedText>
            {form.questions.map((question, index) => (
              <QuestionSummary key={question.id} question={question} index={index} />
            ))}

            <ThemedText type="smallBold" style={styles.sectionLabel}>
              Submissions ({submissions.length})
            </ThemedText>
            {submissions.length === 0 ? (
              <ThemedText themeColor="textSecondary" style={styles.empty}>
                No submissions yet.
              </ThemedText>
            ) : (
              submissions.map((submission) => <SubmissionCard key={submission.submissionId} submission={submission} />)
            )}

            <ThemedText type="smallBold" style={styles.sectionLabel}>
              Danger Zone
            </ThemedText>
            <ThemedView type="backgroundElement" style={styles.dangerCard}>
              <ThemedText type="small" themeColor="textSecondary">
                Permanently deletes this form, its link, and every submission it received.
              </ThemedText>
              {deleteError && <ThemedText style={styles.error}>{deleteError}</ThemedText>}
              <Pressable onPress={() => setConfirmDelete(true)}>
                <ThemedText type="smallBold" style={styles.dangerText}>
                  Delete this form…
                </ThemedText>
              </Pressable>
            </ThemedView>
          </ScrollView>
        )}

        <ConfirmDialog
          visible={confirmDelete}
          title="Delete this form?"
          message="This permanently deletes the form, its link, and every submission it received. This can't be undone."
          confirmLabel="Delete"
          busy={deleting}
          onConfirm={handleConfirmDelete}
          onCancel={() => setConfirmDelete(false)}
        />
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
    textAlign: 'center',
  },
  scrollContent: {
    gap: Spacing.two,
    paddingBottom: Spacing.six,
  },
  title: {
    fontSize: 30,
    lineHeight: 36,
  },
  sectionLabel: {
    marginTop: Spacing.three,
  },
  linkCard: {
    ...Glow.teal,
    borderRadius: Spacing.two,
    padding: Spacing.three,
    gap: Spacing.two,
  },
  linkText: {
    color: Colors.tealBright,
  },
  card: {
    borderRadius: Spacing.two,
    padding: Spacing.three,
    gap: Spacing.half,
  },
  empty: {
    marginTop: Spacing.one,
  },
  dangerCard: {
    borderRadius: Spacing.two,
    padding: Spacing.three,
    gap: Spacing.two,
    borderWidth: 1,
    borderColor: Accent,
  },
  dangerText: {
    color: Accent,
  },
});
