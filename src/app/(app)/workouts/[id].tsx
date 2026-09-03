import { useLocalSearchParams } from 'expo-router';

import { WorkoutForm } from '@/components/workout-form';

export default function EditWorkoutScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <WorkoutForm workoutId={id} />;
}
