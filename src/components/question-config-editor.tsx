import { Pressable, StyleSheet, TextInput, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Accent, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type { ConfigFieldDefinition, QuestionConfig } from '@/lib/question-types';

type Props = {
  field: ConfigFieldDefinition;
  config: QuestionConfig;
  onChange: (nextConfig: QuestionConfig) => void;
};

/**
 * One renderer per `ConfigFieldDefinition.kind` — not per question type.
 * A new question type that reuses an existing kind (another "list", say)
 * needs zero changes here; only a genuinely new kind of input needs a
 * new case.
 */
export function ConfigFieldEditor({ field, config, onChange }: Props) {
  const theme = useTheme();

  if (field.kind === 'text') {
    const value = typeof config[field.key] === 'string' ? (config[field.key] as string) : '';
    return (
      <View style={styles.field}>
        <ThemedText type="small" themeColor="textSecondary">
          {field.label}
        </ThemedText>
        <TextInput
          value={value}
          onChangeText={(text) => onChange({ ...config, [field.key]: text })}
          placeholder={field.placeholder}
          placeholderTextColor={theme.textSecondary}
          style={[styles.input, { color: theme.text, borderColor: theme.backgroundSelected }]}
        />
      </View>
    );
  }

  if (field.kind === 'range') {
    const minValue = typeof config[field.minKey] === 'string' || typeof config[field.minKey] === 'number' ? String(config[field.minKey]) : '';
    const maxValue = typeof config[field.maxKey] === 'string' || typeof config[field.maxKey] === 'number' ? String(config[field.maxKey]) : '';
    return (
      <View style={styles.field}>
        <ThemedText type="small" themeColor="textSecondary">
          {field.label}
        </ThemedText>
        <View style={styles.rangeRow}>
          <TextInput
            value={minValue}
            onChangeText={(text) => onChange({ ...config, [field.minKey]: text })}
            placeholder="Min"
            keyboardType="number-pad"
            placeholderTextColor={theme.textSecondary}
            style={[styles.input, styles.rangeInput, { color: theme.text, borderColor: theme.backgroundSelected }]}
          />
          <ThemedText type="small" themeColor="textSecondary">
            to
          </ThemedText>
          <TextInput
            value={maxValue}
            onChangeText={(text) => onChange({ ...config, [field.maxKey]: text })}
            placeholder="Max"
            keyboardType="number-pad"
            placeholderTextColor={theme.textSecondary}
            style={[styles.input, styles.rangeInput, { color: theme.text, borderColor: theme.backgroundSelected }]}
          />
        </View>
      </View>
    );
  }

  // field.kind === 'list'
  const options = Array.isArray(config[field.key]) ? (config[field.key] as string[]) : [];

  const updateOption = (index: number, text: string) => {
    const next = [...options];
    next[index] = text;
    onChange({ ...config, [field.key]: next });
  };

  const addOption = () => onChange({ ...config, [field.key]: [...options, ''] });

  const removeOption = (index: number) => {
    if (options.length <= field.minItems) return;
    onChange({ ...config, [field.key]: options.filter((_, i) => i !== index) });
  };

  return (
    <View style={styles.field}>
      <ThemedText type="small" themeColor="textSecondary">
        {field.label}
      </ThemedText>
      {options.map((option, index) => (
        // Index as key is fine here — a plain list of text boxes, no
        // drag-reordering, and removal only ever changes downstream
        // indices, not the identity of what the coach is looking at.
        <View key={index} style={styles.optionRow}>
          <TextInput
            value={option}
            onChangeText={(text) => updateOption(index, text)}
            placeholder={`${field.itemLabel} ${index + 1}`}
            placeholderTextColor={theme.textSecondary}
            style={[styles.input, styles.optionInput, { color: theme.text, borderColor: theme.backgroundSelected }]}
          />
          {options.length > field.minItems && (
            <Pressable onPress={() => removeOption(index)} hitSlop={8}>
              <ThemedText style={styles.removeText}>Remove</ThemedText>
            </Pressable>
          )}
        </View>
      ))}
      <Pressable onPress={addOption}>
        <ThemedText type="linkPrimary">+ Add {field.itemLabel.toLowerCase()}</ThemedText>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  field: {
    gap: Spacing.one,
  },
  input: {
    borderWidth: 1,
    borderRadius: Spacing.two,
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.two,
    fontSize: 14,
  },
  rangeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  rangeInput: {
    flex: 1,
  },
  optionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  optionInput: {
    flex: 1,
  },
  removeText: {
    color: Accent,
    fontSize: 12,
  },
});
