import { useLocalSearchParams } from 'expo-router';

import { CustomExerciseForm } from '@/components/custom-exercise-form';

export default function EditCustomExerciseScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <CustomExerciseForm exerciseId={id} />;
}
