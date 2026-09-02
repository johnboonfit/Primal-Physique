import { supabase } from '@/lib/supabase';

export type MuscleGroup = 'arms' | 'back' | 'calves' | 'chest' | 'core' | 'legs' | 'shoulders';

export const MUSCLE_GROUPS: { key: MuscleGroup; label: string }[] = [
  { key: 'arms', label: 'Arms' },
  { key: 'back', label: 'Back' },
  { key: 'calves', label: 'Calves' },
  { key: 'chest', label: 'Chest' },
  { key: 'core', label: 'Core' },
  { key: 'legs', label: 'Legs' },
  { key: 'shoulders', label: 'Shoulders' },
];

export type ExerciseSummary = {
  id: string;
  name: string;
  muscleGroup: string;
  category: string;
  equipment: string[];
};

export type ExerciseDetail = ExerciseSummary & {
  primaryMuscles: string[];
  secondaryMuscles: string[];
  instructions: string[];
  description: string | null;
  videoUrl: string | null;
  imageUrl: string | null;
  attribution: string;
};

/**
 * Just the fields the browse list needs — name, group, category,
 * equipment — for every row in the library. There are only ~870
 * exercises total (it's a one-time imported reference table, not
 * something that grows with usage), so fetching the whole light-weight
 * list once and filtering client-side is simpler than paginating or
 * re-querying on every keystroke.
 */
export async function listExerciseLibrarySummaries(): Promise<ExerciseSummary[]> {
  const { data, error } = await supabase
    .from('exercise_library')
    .select('id, name, muscle_group, category, equipment')
    .order('name');

  if (error) throw error;

  return (data ?? []).map((row) => ({
    id: row.id as string,
    name: row.name as string,
    muscleGroup: row.muscle_group as string,
    category: row.category as string,
    equipment: (row.equipment as string[] | null) ?? [],
  }));
}

/** The heavier fields (instructions, attribution, etc.) — fetched only
 * when a coach actually expands one exercise to look at it. */
export async function getExerciseDetail(id: string): Promise<ExerciseDetail> {
  const { data, error } = await supabase
    .from('exercise_library')
    .select(
      'id, name, muscle_group, category, equipment, primary_muscles, secondary_muscles, instructions, description, video_url, image_url, attribution'
    )
    .eq('id', id)
    .single();

  if (error) throw error;

  return {
    id: data.id as string,
    name: data.name as string,
    muscleGroup: data.muscle_group as string,
    category: data.category as string,
    equipment: (data.equipment as string[] | null) ?? [],
    primaryMuscles: (data.primary_muscles as string[] | null) ?? [],
    secondaryMuscles: (data.secondary_muscles as string[] | null) ?? [],
    instructions: (data.instructions as string[] | null) ?? [],
    description: data.description as string | null,
    videoUrl: data.video_url as string | null,
    imageUrl: data.image_url as string | null,
    attribution: data.attribution as string,
  };
}
