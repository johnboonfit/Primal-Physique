import { router } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ConfigFieldEditor } from '@/components/question-config-editor';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Accent, Colors, Glow, Spacing } from '@/constants/theme';
import { useAuth } from '@/context/auth-context';
import { useTheme } from '@/hooks/use-theme';
import { createFormTemplate } from '@/lib/form-templates';
import { getQuestionTypeDefinition, QUESTION_TYPES, type QuestionConfig, type QuestionType } from '@/lib/question-types';

type QuestionDraft = {
  key: string;
  questionType: QuestionType;
  label: string;
  config: QuestionConfig;
};

let nextKey = 0;
function makeQuestion(): QuestionDraft {
  nextKey += 1;
  const defaultType = QUESTION_TYPES[0];
  return { key: `question-${nextKey}`, questionType: defaultType.key, label: '', config: defaultType.defaultConfig() };
}

export default function NewFormScreen() {
  const theme = useTheme();
  const { session } = useAuth();

  const [name, setName] = useState('');
  const [questions, setQuestions] = useState<QuestionDraft[]>([makeQuestion()]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const updateQuestion = (key: string, patch: Partial<QuestionDraft>) => {
    setQuestions((current) => current.map((q) => (q.key === key ? { ...q, ...patch } : q)));
  };

  const setQuestionType = (key: string, questionType: QuestionType) => {
    updateQuestion(key, { questionType, config: getQuestionTypeDefinition(questionType).defaultConfig() });
  };

  const addQuestion = () => setQuestions((current) => [...current, makeQuestion()]);

  const removeQuestion = (key: string) => {
    setQuestions((current) => (current.length > 1 ? current.filter((q) => q.key !== key) : current));
  };

  const handleSave = async () => {
    setError(null);
    if (!session) return;

    const trimmedName = name.trim();
    if (!trimmedName) {
      setError('Give the form a name.');
      return;
    }

    for (let i = 0; i < questions.length; i++) {
      const question = questions[i];
      if (!question.label.trim()) {
        setError(`Question ${i + 1}: give it some question text.`);
        return;
      }
      const typeDefinition = getQuestionTypeDefinition(question.questionType);
      const configError = typeDefinition.validateConfig(question.config);
      if (configError) {
        setError(`Question ${i + 1}: ${configError}`);
        return;
      }
    }

    setSaving(true);
    try {
      const drafts = questions.map((question) => {
        const typeDefinition = getQuestionTypeDefinition(question.questionType);
        return {
          questionType: question.questionType,
          label: question.label.trim(),
          config: typeDefinition.toStoredConfig(question.config),
        };
      });
      const formId = await createFormTemplate(session.user.id, trimmedName, drafts);
      router.replace(`/forms/${formId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong saving the form.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
          <ThemedText type="title" style={styles.title}>
            New check-in form
          </ThemedText>

          <TextInput
            value={name}
            onChangeText={setName}
            placeholder="Form name (e.g. Weekly Check-in)"
            placeholderTextColor={theme.textSecondary}
            style={[styles.input, { color: theme.text, borderColor: theme.backgroundSelected }]}
          />

          <ThemedText type="smallBold" style={styles.sectionLabel}>
            Questions
          </ThemedText>

          {questions.map((question, index) => (
            <QuestionRow
              key={question.key}
              question={question}
              index={index}
              theme={theme}
              canRemove={questions.length > 1}
              onLabelChange={(label) => updateQuestion(question.key, { label })}
              onTypeChange={(type) => setQuestionType(question.key, type)}
              onConfigChange={(config) => updateQuestion(question.key, { config })}
              onRemove={() => removeQuestion(question.key)}
            />
          ))}

          <Pressable style={styles.addButton} onPress={addQuestion}>
            <ThemedText type="linkPrimary">+ Add question</ThemedText>
          </Pressable>

          {error && <ThemedText style={styles.error}>{error}</ThemedText>}

          <Pressable
            style={({ pressed }) => [styles.primaryButton, pressed && styles.pressed]}
            onPress={handleSave}
            disabled={saving}>
            {saving ? (
              <ActivityIndicator color={Colors.text} />
            ) : (
              <ThemedText type="smallBold" style={styles.primaryButtonText}>
                Save form
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

function QuestionRow({
  question,
  index,
  theme,
  canRemove,
  onLabelChange,
  onTypeChange,
  onConfigChange,
  onRemove,
}: {
  question: QuestionDraft;
  index: number;
  theme: ReturnType<typeof useTheme>;
  canRemove: boolean;
  onLabelChange: (label: string) => void;
  onTypeChange: (type: QuestionType) => void;
  onConfigChange: (config: QuestionConfig) => void;
  onRemove: () => void;
}) {
  const typeDefinition = getQuestionTypeDefinition(question.questionType);

  return (
    <ThemedView type="backgroundElement" style={styles.questionCard}>
      <View style={styles.questionTopRow}>
        <ThemedText type="small" themeColor="textSecondary">
          Question {index + 1}
        </ThemedText>
        {canRemove && (
          <Pressable onPress={onRemove} hitSlop={8}>
            <ThemedText style={styles.removeText}>Remove</ThemedText>
          </Pressable>
        )}
      </View>

      <TextInput
        value={question.label}
        onChangeText={onLabelChange}
        placeholder="Question text (e.g. How did training feel this week?)"
        placeholderTextColor={theme.textSecondary}
        style={[styles.input, { color: theme.text, borderColor: theme.backgroundSelected }]}
      />

      <ThemedText type="small" themeColor="textSecondary" style={styles.typeLabel}>
        Type
      </ThemedText>
      <View style={styles.chipRow}>
        {QUESTION_TYPES.map((type) => {
          const selected = type.key === question.questionType;
          return (
            <Pressable
              key={type.key}
              onPress={() => onTypeChange(type.key)}
              style={[styles.chip, { borderColor: theme.backgroundSelected }, selected && styles.chipSelected]}>
              <ThemedText type="small" style={selected ? styles.chipTextSelected : undefined}>
                {type.label}
              </ThemedText>
            </Pressable>
          );
        })}
      </View>
      <ThemedText type="small" themeColor="textSecondary">
        {typeDefinition.description}
      </ThemedText>

      {typeDefinition.configFields.map((field) => (
        <ConfigFieldEditor key={field.key} field={field} config={question.config} onChange={onConfigChange} />
      ))}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  safeArea: { flex: 1 },
  scrollContent: {
    padding: Spacing.four,
    gap: Spacing.three,
  },
  title: {
    marginBottom: Spacing.half,
  },
  input: {
    borderWidth: 1,
    borderRadius: Spacing.two,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.three,
    fontSize: 16,
  },
  sectionLabel: {
    marginTop: Spacing.two,
  },
  questionCard: {
    borderRadius: Spacing.two,
    padding: Spacing.three,
    gap: Spacing.two,
  },
  questionTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  typeLabel: {
    marginTop: Spacing.one,
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
  removeText: {
    color: Accent,
    fontSize: 12,
  },
  addButton: {
    alignSelf: 'flex-start',
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
