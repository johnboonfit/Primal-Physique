import { supabase } from '@/lib/supabase';
import type { QuestionConfig, QuestionType } from '@/lib/question-types';

export type FormQuestionDraft = {
  questionType: QuestionType;
  label: string;
  config: QuestionConfig;
};

export type FormTemplateSummary = {
  id: string;
  name: string;
  createdAt: string;
  questionCount: number;
};

export type FormQuestionDetail = {
  id: string;
  position: number;
  questionType: QuestionType;
  label: string;
  config: QuestionConfig;
};

export type FormTemplateDetail = {
  id: string;
  name: string;
  createdAt: string;
  questions: FormQuestionDetail[];
};

/**
 * Saves a form and its questions as one unit, same pattern as
 * createWorkout/createProgramme: if the questions fail to save after the
 * form row already exists, the half-saved form is cleaned up rather than
 * left behind empty. `position` is just each question's index in the
 * array — there's no drag-to-reorder in this chunk, so the order the
 * coach built them in is the order they're saved in.
 */
export async function createFormTemplate(coachId: string, name: string, questions: FormQuestionDraft[]): Promise<string> {
  const { data: form, error: formError } = await supabase
    .from('form_templates')
    .insert({ coach_id: coachId, name })
    .select('id')
    .single();

  if (formError) throw formError;

  const rows = questions.map((question, index) => ({
    form_id: form.id as string,
    position: index,
    question_type: question.questionType,
    label: question.label,
    config: question.config,
  }));

  const { error: questionsError } = await supabase.from('form_questions').insert(rows);

  if (questionsError) {
    await supabase.from('form_templates').delete().eq('id', form.id);
    throw questionsError;
  }

  return form.id as string;
}

export async function listFormTemplates(coachId: string): Promise<FormTemplateSummary[]> {
  const { data, error } = await supabase
    .from('form_templates')
    .select('id, name, created_at, form_questions(count)')
    .eq('coach_id', coachId)
    .order('created_at', { ascending: false });

  if (error) throw error;

  return (data ?? []).map((row) => ({
    id: row.id as string,
    name: row.name as string,
    createdAt: row.created_at as string,
    questionCount: (row.form_questions as { count: number }[] | null)?.[0]?.count ?? 0,
  }));
}

export async function getFormTemplateDetail(formId: string): Promise<FormTemplateDetail> {
  const { data, error } = await supabase.from('form_templates').select('id, name, created_at').eq('id', formId).single();

  if (error) throw error;

  const { data: questions, error: questionsError } = await supabase
    .from('form_questions')
    .select('id, position, question_type, label, config')
    .eq('form_id', formId)
    .order('position');

  if (questionsError) throw questionsError;

  return {
    id: data.id as string,
    name: data.name as string,
    createdAt: data.created_at as string,
    questions: (questions ?? []).map((row) => ({
      id: row.id as string,
      position: row.position as number,
      questionType: row.question_type as QuestionType,
      label: row.label as string,
      config: (row.config as QuestionConfig) ?? {},
    })),
  };
}
