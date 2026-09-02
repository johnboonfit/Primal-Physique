/**
 * The whole point of this file: every question type is a data entry in
 * QUESTION_TYPES, not a branch of if/else scattered through the builder
 * screen. Adding a new question type later — a date picker, a photo
 * upload, whatever — means adding one more entry here (and, if it needs
 * a genuinely new kind of config input, one more case in
 * `question-config-editor.tsx`'s small, shared set of field kinds). It
 * never means touching the builder screen itself, since that screen only
 * ever loops over `configFields` and asks `ConfigFieldEditor` to render
 * whatever's there.
 */

export type QuestionType = 'short_text' | 'number' | 'single_select' | 'multi_select' | 'scale' | 'measurement';

export type QuestionConfig = Record<string, unknown>;

/**
 * The small, fixed set of *shapes* a question type's extra configuration
 * can take — not one per question type, one per kind of input control.
 * `question-config-editor.tsx` has exactly one renderer per `kind` here.
 */
export type ConfigFieldDefinition =
  | { key: string; kind: 'text'; label: string; placeholder?: string }
  | { key: string; kind: 'list'; label: string; itemLabel: string; minItems: number }
  | { key: string; kind: 'range'; label: string; minKey: string; maxKey: string };

export type QuestionTypeDefinition = {
  key: QuestionType;
  label: string;
  description: string;
  configFields: ConfigFieldDefinition[];
  defaultConfig: () => QuestionConfig;
  /** Returns an error message if this question's config isn't ready to
   * save yet (e.g. a select with fewer than 2 options), or null if it's
   * fine. Lives on the type definition itself, same reasoning as
   * `configFields` — so validation grows by adding a type, not by
   * editing a shared switch statement. */
  validateConfig: (config: QuestionConfig) => string | null;
  /** Converts whatever shape the editor keeps config in (e.g. a scale's
   * min/max are edited as raw text, so a field cleared mid-edit reads as
   * "" rather than silently becoming 0) into the shape actually saved to
   * the database. Identity for every type that doesn't need it. */
  toStoredConfig: (config: QuestionConfig) => QuestionConfig;
};

function optionsFrom(config: QuestionConfig): string[] {
  return Array.isArray(config.options) ? (config.options as unknown[]).filter((o): o is string => typeof o === 'string') : [];
}

function validateOptions(config: QuestionConfig): string | null {
  const nonEmpty = optionsFrom(config).filter((o) => o.trim().length > 0);
  return nonEmpty.length >= 2 ? null : 'Add at least 2 options.';
}

export const QUESTION_TYPES: QuestionTypeDefinition[] = [
  {
    key: 'short_text',
    label: 'Short text',
    description: 'A single line of free text.',
    configFields: [],
    defaultConfig: () => ({}),
    validateConfig: () => null,
    toStoredConfig: (config) => config,
  },
  {
    key: 'number',
    label: 'Number',
    description: 'A plain numeric answer.',
    configFields: [],
    defaultConfig: () => ({}),
    validateConfig: () => null,
    toStoredConfig: (config) => config,
  },
  {
    key: 'single_select',
    label: 'Single select',
    description: 'The client picks exactly one option.',
    configFields: [{ key: 'options', kind: 'list', label: 'Options', itemLabel: 'Option', minItems: 2 }],
    defaultConfig: () => ({ options: ['', ''] }),
    validateConfig: validateOptions,
    toStoredConfig: (config) => ({ options: optionsFrom(config).map((o) => o.trim()).filter((o) => o.length > 0) }),
  },
  {
    key: 'multi_select',
    label: 'Multi select',
    description: 'The client can pick any number of options.',
    configFields: [{ key: 'options', kind: 'list', label: 'Options', itemLabel: 'Option', minItems: 2 }],
    defaultConfig: () => ({ options: ['', ''] }),
    validateConfig: validateOptions,
    toStoredConfig: (config) => ({ options: optionsFrom(config).map((o) => o.trim()).filter((o) => o.length > 0) }),
  },
  {
    key: 'scale',
    label: 'Scale / slider',
    description: 'A numeric rating within a fixed range, e.g. 1–10.',
    configFields: [{ key: 'range', kind: 'range', label: 'Scale range', minKey: 'min', maxKey: 'max' }],
    defaultConfig: () => ({ min: '1', max: '10' }),
    validateConfig: (config) => {
      const { min: minRaw, max: maxRaw } = config;
      if (minRaw === '' || minRaw === undefined || maxRaw === '' || maxRaw === undefined) {
        return 'Enter both a minimum and maximum for the scale.';
      }
      const min = Number(minRaw);
      const max = Number(maxRaw);
      if (Number.isNaN(min) || Number.isNaN(max) || !Number.isInteger(min) || !Number.isInteger(max)) {
        return 'Scale range must be whole numbers.';
      }
      if (min >= max) return 'The scale minimum must be less than the maximum.';
      return null;
    },
    toStoredConfig: (config) => ({ min: Number(config.min), max: Number(config.max) }),
  },
  {
    key: 'measurement',
    label: 'Weight / measurement',
    description: 'A numeric measurement, optionally labelled with a unit (e.g. lb, in, cm).',
    configFields: [{ key: 'unit', kind: 'text', label: 'Unit (optional)', placeholder: 'e.g. lb, in, cm' }],
    defaultConfig: () => ({ unit: '' }),
    validateConfig: () => null,
    toStoredConfig: (config) => ({ unit: typeof config.unit === 'string' ? config.unit.trim() : '' }),
  },
];

export function getQuestionTypeDefinition(key: QuestionType): QuestionTypeDefinition {
  const found = QUESTION_TYPES.find((type) => type.key === key);
  if (!found) throw new Error(`Unknown question type: ${key}`);
  return found;
}
