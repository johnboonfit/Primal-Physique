import { Pressable, StyleSheet, TextInput, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Accent, Colors, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type { AnswerKind, AnswerValue, QuestionConfig } from '@/lib/question-types';

type Props = {
  answerKind: AnswerKind;
  config: QuestionConfig;
  value: AnswerValue;
  onChange: (value: AnswerValue) => void;
};

function optionsFrom(config: QuestionConfig): string[] {
  return Array.isArray(config.options) ? (config.options as unknown[]).filter((o): o is string => typeof o === 'string') : [];
}

/**
 * One renderer per `AnswerKind` — not per question type, same reasoning
 * as ConfigFieldEditor. `numeric` serves both the "number" and
 * "measurement" question types; the only difference is whether
 * `config.unit` happens to be set, read generically here rather than
 * because of which type this is.
 */
export function AnswerInput({ answerKind, config, value, onChange }: Props) {
  const theme = useTheme();

  if (answerKind === 'short_text') {
    return (
      <TextInput
        value={typeof value === 'string' ? value : ''}
        onChangeText={onChange}
        placeholder="Your answer"
        placeholderTextColor={theme.textSecondary}
        style={[styles.input, { color: theme.text, borderColor: theme.backgroundSelected }]}
      />
    );
  }

  if (answerKind === 'numeric') {
    const unit = typeof config.unit === 'string' ? config.unit.trim() : '';
    return (
      <View style={styles.numericRow}>
        <TextInput
          value={typeof value === 'string' ? value : ''}
          onChangeText={onChange}
          placeholder="0"
          keyboardType="decimal-pad"
          placeholderTextColor={theme.textSecondary}
          style={[styles.input, styles.numericInput, { color: theme.text, borderColor: theme.backgroundSelected }]}
        />
        {unit.length > 0 && (
          <ThemedText type="small" themeColor="textSecondary">
            {unit}
          </ThemedText>
        )}
      </View>
    );
  }

  if (answerKind === 'single_choice') {
    const options = optionsFrom(config);
    return (
      <View style={styles.chipRow}>
        {options.map((option) => {
          const selected = value === option;
          return (
            <Pressable
              key={option}
              onPress={() => onChange(option)}
              style={[styles.chip, { borderColor: theme.backgroundSelected }, selected && styles.chipSelected]}>
              <ThemedText type="small" style={selected ? styles.chipTextSelected : undefined}>
                {option}
              </ThemedText>
            </Pressable>
          );
        })}
      </View>
    );
  }

  if (answerKind === 'multi_choice') {
    const options = optionsFrom(config);
    const picked = Array.isArray(value) ? value : [];
    const toggle = (option: string) => {
      onChange(picked.includes(option) ? picked.filter((o) => o !== option) : [...picked, option]);
    };
    return (
      <View style={styles.chipRow}>
        {options.map((option) => {
          const selected = picked.includes(option);
          return (
            <Pressable
              key={option}
              onPress={() => toggle(option)}
              style={[styles.chip, { borderColor: theme.backgroundSelected }, selected && styles.chipSelected]}>
              <ThemedText type="small" style={selected ? styles.chipTextSelected : undefined}>
                {option}
              </ThemedText>
            </Pressable>
          );
        })}
      </View>
    );
  }

  // answerKind === 'scale'
  const min = Number(config.min);
  const max = Number(config.max);
  const steps = Array.from({ length: max - min + 1 }, (_, i) => min + i);
  return (
    <View style={styles.chipRow}>
      {steps.map((step) => {
        const selected = value === step;
        return (
          <Pressable
            key={step}
            onPress={() => onChange(step)}
            style={[styles.scaleChip, { borderColor: theme.backgroundSelected }, selected && styles.chipSelected]}>
            <ThemedText type="smallBold" style={selected ? styles.chipTextSelected : undefined}>
              {step}
            </ThemedText>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  input: {
    borderWidth: 1,
    borderRadius: Spacing.two,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    fontSize: 16,
  },
  numericRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  numericInput: {
    flex: 1,
    maxWidth: 160,
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
  scaleChip: {
    borderWidth: 1,
    borderRadius: 999,
    minWidth: 40,
    alignItems: 'center',
    paddingVertical: Spacing.two,
  },
  chipSelected: {
    backgroundColor: Accent,
    borderColor: Accent,
  },
  chipTextSelected: {
    color: Colors.text,
    fontWeight: '700',
  },
});
