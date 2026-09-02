import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Accent, Spacing } from '@/constants/theme';
import { getFormTemplateDetail, type FormQuestionDetail, type FormTemplateDetail } from '@/lib/form-templates';
import { getQuestionTypeDefinition, type ConfigFieldDefinition, type QuestionConfig } from '@/lib/question-types';

/** One line of review text per config field, generic over `field.kind` —
 * same reasoning as ConfigFieldEditor: this reads any question type's
 * saved config without needing a case for that specific type. */
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

function QuestionSummary({ question, index }: { question: FormQuestionDetail; index: number }) {
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

export default function FormDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();

  const [form, setForm] = useState<FormTemplateDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      if (!id) return;
      let cancelled = false;

      setLoading(true);
      getFormTemplateDetail(id)
        .then((data) => {
          if (!cancelled) setForm(data);
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
            <ThemedText type="small" themeColor="textSecondary" style={styles.subtitle}>
              {form.questions.length} question{form.questions.length === 1 ? '' : 's'} · not yet scheduled or assigned
            </ThemedText>

            {form.questions.map((question, index) => (
              <QuestionSummary key={question.id} question={question} index={index} />
            ))}
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
    textAlign: 'center',
    marginTop: Spacing.five,
  },
  scrollContent: {
    gap: Spacing.two,
    paddingBottom: Spacing.four,
  },
  title: {
    fontSize: 32,
    lineHeight: 38,
  },
  subtitle: {
    marginBottom: Spacing.two,
  },
  card: {
    borderRadius: Spacing.two,
    padding: Spacing.three,
    gap: Spacing.half,
  },
});
