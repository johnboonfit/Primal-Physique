import { getFormTemplateDetail } from '@/lib/form-templates';
import type { QuestionConfig, QuestionType } from '@/lib/question-types';
import { supabase } from '@/lib/supabase';

/** The single active readiness questionnaire, if a coach has configured
 * one -- see readiness.sql's header for why this is one global setting
 * (app_settings.readiness_form_id) rather than a per-client assignment. */
export async function getReadinessFormId(): Promise<string | null> {
  const { data, error } = await supabase.from('app_settings').select('readiness_form_id').eq('id', true).single();
  if (error) throw error;
  return data.readiness_form_id as string | null;
}

/** Marks one of the coach's own forms as THE readiness questionnaire
 * every client sees at the start of every session -- replaces whatever
 * was set before, there's only ever one active at a time. */
export async function setReadinessFormId(formId: string): Promise<void> {
  const { error } = await supabase.from('app_settings').update({ readiness_form_id: formId }).eq('id', true);
  if (error) throw error;
}

export type ReadinessQuestion = {
  id: string;
  questionType: QuestionType;
  label: string;
  config: QuestionConfig;
  /** Whatever this client already answered for THIS specific workout
   * session, or null if they haven't reached this question yet. */
  answer: unknown | null;
};

export type ReadinessStatus = {
  formId: string | null;
  formName: string | null;
  questions: ReadinessQuestion[];
  /** True the moment every question already has an answer for this
   * session -- also true (vacuously) when no readiness questionnaire is
   * configured at all, since there's nothing to block on in that case. */
  completed: boolean;
};

/**
 * The readiness gate for one specific workout session: the active
 * template's questions, each carrying whatever this client has already
 * answered FOR THIS ASSIGNMENT specifically (never a different
 * session's answers, even for the same client) -- so a screen can tell
 * "not started yet" from "already done" in one call.
 */
export async function getReadinessStatusForAssignment(assignmentId: string): Promise<ReadinessStatus> {
  const formId = await getReadinessFormId();
  if (!formId) return { formId: null, formName: null, questions: [], completed: true };

  const form = await getFormTemplateDetail(formId);

  const { data: responses, error } = await supabase
    .from('readiness_responses')
    .select('question_id, answer')
    .eq('assignment_id', assignmentId);

  if (error) throw error;

  const answerByQuestionId = new Map((responses ?? []).map((row) => [row.question_id as string, row.answer]));

  const questions: ReadinessQuestion[] = form.questions.map((question) => ({
    id: question.id,
    questionType: question.questionType,
    label: question.label,
    config: question.config,
    answer: answerByQuestionId.get(question.id) ?? null,
  }));

  return {
    formId: form.id,
    formName: form.name,
    questions,
    completed: questions.length > 0 && questions.every((question) => question.answer !== null),
  };
}

/**
 * Saves every answer for one session in one call. Upsert, not a plain
 * insert -- `readiness_responses` is unique on (assignment_id,
 * question_id), and a retried submission (e.g. after a partial network
 * failure) should overwrite the earlier attempt, not error.
 */
export async function submitReadinessResponses(
  assignmentId: string,
  clientId: string,
  responses: { questionId: string; answer: unknown }[]
) {
  const rows = responses.map((response) => ({
    assignment_id: assignmentId,
    client_id: clientId,
    question_id: response.questionId,
    answer: response.answer,
  }));

  const { error } = await supabase.from('readiness_responses').upsert(rows, { onConflict: 'assignment_id,question_id' });
  if (error) throw error;
}
