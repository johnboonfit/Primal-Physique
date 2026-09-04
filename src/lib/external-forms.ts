import { supabase } from '@/lib/supabase';
import type { QuestionConfig, QuestionType } from '@/lib/question-types';

export type ExternalFormQuestionDraft = {
  questionType: QuestionType;
  label: string;
  config: QuestionConfig;
};

export type ExternalFormSummary = {
  id: string;
  name: string;
  shareToken: string;
  createdAt: string;
  questionCount: number;
};

export type ExternalFormQuestionDetail = {
  id: string;
  position: number;
  questionType: QuestionType;
  label: string;
  config: QuestionConfig;
};

export type ExternalFormDetail = {
  id: string;
  name: string;
  shareToken: string;
  createdAt: string;
  questions: ExternalFormQuestionDetail[];
};

/** Saves a form and its questions as one unit, same pattern as
 * createFormTemplate — if the questions fail to save, the half-created
 * form row is cleaned up rather than left behind empty. */
export async function createExternalForm(coachId: string, name: string, questions: ExternalFormQuestionDraft[]): Promise<string> {
  const { data: form, error: formError } = await supabase
    .from('external_forms')
    .insert({ coach_id: coachId, name })
    .select('id')
    .single();

  if (formError) throw formError;

  const rows = questions.map((question, index) => ({
    form_id: form.id as string,
    question_position: index,
    question_type: question.questionType,
    label: question.label,
    config: question.config,
  }));

  const { error: questionsError } = await supabase.from('external_form_questions').insert(rows);

  if (questionsError) {
    await supabase.from('external_forms').delete().eq('id', form.id);
    throw questionsError;
  }

  return form.id as string;
}

export async function listExternalForms(coachId: string): Promise<ExternalFormSummary[]> {
  const { data, error } = await supabase
    .from('external_forms')
    .select('id, name, share_token, created_at, external_form_questions(count)')
    .eq('coach_id', coachId)
    .order('created_at', { ascending: false });

  if (error) throw error;

  return (data ?? []).map((row) => ({
    id: row.id as string,
    name: row.name as string,
    shareToken: row.share_token as string,
    createdAt: row.created_at as string,
    questionCount: (row.external_form_questions as { count: number }[] | null)?.[0]?.count ?? 0,
  }));
}

export async function getExternalFormDetail(formId: string): Promise<ExternalFormDetail> {
  const { data, error } = await supabase
    .from('external_forms')
    .select('id, name, share_token, created_at')
    .eq('id', formId)
    .single();

  if (error) throw error;

  const { data: questions, error: questionsError } = await supabase
    .from('external_form_questions')
    .select('id, question_position, question_type, label, config')
    .eq('form_id', formId)
    .order('question_position');

  if (questionsError) throw questionsError;

  return {
    id: data.id as string,
    name: data.name as string,
    shareToken: data.share_token as string,
    createdAt: data.created_at as string,
    questions: (questions ?? []).map((row) => ({
      id: row.id as string,
      position: row.question_position as number,
      questionType: row.question_type as QuestionType,
      label: row.label as string,
      config: (row.config as QuestionConfig) ?? {},
    })),
  };
}

export async function deleteExternalForm(formId: string): Promise<void> {
  const { error } = await supabase.from('external_forms').delete().eq('id', formId);
  if (error) throw error;
}

type SubmissionAnswer = { label: string; answer: unknown; position: number };
type SubmissionDraft = { submissionId: string; submittedAt: string; answers: SubmissionAnswer[] };

export type ExternalFormSubmission = {
  submissionId: string;
  submittedAt: string;
  answers: { label: string; answer: unknown }[];
};

/** Every submission this form has received, most recent first — one row
 * per answer comes back from the table, grouped here by submission_id
 * into one card's worth of answers per actual visitor. */
export async function listExternalFormResponses(formId: string): Promise<ExternalFormSubmission[]> {
  const { data, error } = await supabase
    .from('external_form_responses')
    .select('submission_id, submitted_at, answer, external_form_questions(label, question_position)')
    .eq('form_id', formId)
    .order('submitted_at', { ascending: false });

  if (error) throw error;

  const bySubmission = new Map<string, SubmissionDraft>();
  for (const row of data ?? []) {
    const submissionId = row.submission_id as string;
    const question = row.external_form_questions as unknown as { label: string; question_position: number } | null;
    const existing = bySubmission.get(submissionId);
    const entry: SubmissionAnswer = {
      label: question?.label ?? 'Unknown question',
      answer: row.answer,
      position: question?.question_position ?? 0,
    };
    if (existing) {
      existing.answers.push(entry);
    } else {
      bySubmission.set(submissionId, { submissionId, submittedAt: row.submitted_at as string, answers: [entry] });
    }
  }

  return [...bySubmission.values()]
    .map((submission) => ({
      submissionId: submission.submissionId,
      submittedAt: submission.submittedAt,
      answers: submission.answers
        .slice()
        .sort((a, b) => a.position - b.position)
        .map(({ label, answer }) => ({ label, answer })),
    }))
    .sort((a, b) => b.submittedAt.localeCompare(a.submittedAt));
}

export type PublicExternalForm = {
  formId: string;
  formName: string;
  questions: ExternalFormQuestionDetail[];
};

/** The one way an anonymous visitor reads a form — see
 * external-forms.sql's get_external_form_by_token for why this is an
 * RPC call, not a direct table select. Returns null for a token that
 * doesn't match anything, same "not found" either way whether the link
 * is malformed or was never real. */
export async function getExternalFormByToken(token: string): Promise<PublicExternalForm | null> {
  const { data, error } = await supabase.rpc('get_external_form_by_token', { p_token: token });
  if (error) throw error;

  const rows = (data ?? []) as {
    form_id: string;
    form_name: string;
    question_id: string;
    question_position: number;
    question_type: QuestionType;
    label: string;
    config: QuestionConfig;
  }[];

  if (rows.length === 0) return null;

  return {
    formId: rows[0].form_id,
    formName: rows[0].form_name,
    questions: rows.map((row) => ({
      id: row.question_id,
      position: row.question_position,
      questionType: row.question_type,
      label: row.label,
      config: row.config ?? {},
    })),
  };
}

/** The one way an anonymous visitor writes to this app — see
 * external-forms.sql's submit_external_form_response. */
export async function submitExternalFormResponse(
  token: string,
  answers: { questionId: string; answer: unknown }[]
): Promise<void> {
  const { error } = await supabase.rpc('submit_external_form_response', {
    p_token: token,
    p_answers: answers.map((a) => ({ question_id: a.questionId, answer: a.answer })),
  });
  if (error) throw error;
}
