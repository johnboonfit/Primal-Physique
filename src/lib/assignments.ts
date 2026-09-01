import { supabase } from '@/lib/supabase';

export type WorkoutOption = {
  id: string;
  name: string;
};

export type ClientOption = {
  id: string;
  email: string;
};

export type AssignmentSummary = {
  id: string;
  workoutName: string;
  clientEmail: string;
  assignedDate: string;
};

export type ClientAssignmentSummary = {
  id: string;
  workoutName: string;
  assignedDate: string;
};

export type AssignmentDetail = {
  id: string;
  workoutName: string;
  assignedDate: string;
  exercises: { id: string; name: string; setsReps: string }[];
};

export async function listCoachWorkoutOptions(coachId: string): Promise<WorkoutOption[]> {
  const { data, error } = await supabase
    .from('workouts')
    .select('id, name')
    .eq('coach_id', coachId)
    .order('name');

  if (error) throw error;
  return (data ?? []) as WorkoutOption[];
}

export async function listClientOptions(): Promise<ClientOption[]> {
  const { data, error } = await supabase.from('profiles').select('id, email').eq('role', 'client').order('email');

  if (error) throw error;
  return (data ?? []) as ClientOption[];
}

export async function createAssignment(coachId: string, workoutId: string, clientId: string, assignedDate: string) {
  const { error } = await supabase.from('assignments').insert({
    coach_id: coachId,
    workout_id: workoutId,
    client_id: clientId,
    assigned_date: assignedDate,
  });

  if (error) throw error;
}

export async function listAssignments(coachId: string): Promise<AssignmentSummary[]> {
  // "!client_id" tells Supabase which foreign key to follow — assignments
  // points at profiles twice (coach_id and client_id), so without this
  // hint it wouldn't know which relationship we mean.
  const { data, error } = await supabase
    .from('assignments')
    .select('id, assigned_date, workouts(name), profiles!client_id(email)')
    .eq('coach_id', coachId)
    .order('assigned_date', { ascending: false });

  if (error) throw error;

  return (data ?? []).map((row) => ({
    id: row.id as string,
    workoutName: (row.workouts as unknown as { name: string } | null)?.name ?? 'Unknown workout',
    clientEmail: (row.profiles as unknown as { email: string } | null)?.email ?? 'Unknown client',
    assignedDate: row.assigned_date as string,
  }));
}

export async function listMyAssignments(clientId: string): Promise<ClientAssignmentSummary[]> {
  const { data, error } = await supabase
    .from('assignments')
    .select('id, assigned_date, workouts(name)')
    .eq('client_id', clientId)
    .order('assigned_date', { ascending: false });

  if (error) throw error;

  return (data ?? []).map((row) => ({
    id: row.id as string,
    workoutName: (row.workouts as unknown as { name: string } | null)?.name ?? 'Unknown workout',
    assignedDate: row.assigned_date as string,
  }));
}

export async function getAssignmentDetail(assignmentId: string): Promise<AssignmentDetail> {
  const { data, error } = await supabase
    .from('assignments')
    .select('id, assigned_date, workouts(name, workout_exercises(id, name, sets_reps, position))')
    .eq('id', assignmentId)
    .single();

  if (error) throw error;

  const workout = data.workouts as unknown as {
    name: string;
    workout_exercises: { id: string; name: string; sets_reps: string; position: number }[];
  } | null;

  const exercises = (workout?.workout_exercises ?? [])
    .slice()
    .sort((a, b) => a.position - b.position)
    .map((exercise) => ({ id: exercise.id, name: exercise.name, setsReps: exercise.sets_reps }));

  return {
    id: data.id as string,
    workoutName: workout?.name ?? 'Unknown workout',
    assignedDate: data.assigned_date as string,
    exercises,
  };
}
