import { useLocalSearchParams } from 'expo-router';

import { WorkoutForm } from '@/components/workout-form';

export default function NewWorkoutScreen() {
  const { weekId } = useLocalSearchParams<{ weekId?: string }>();
  return <WorkoutForm weekId={weekId} />;
}
