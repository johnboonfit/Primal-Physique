import { useState } from 'react';
import { ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ExerciseProgressPanel } from '@/components/exercise-progress-panel';
import { MeasurePanel } from '@/components/measure-panel';
import { MetricsPanel } from '@/components/metrics-panel';
import { PhotosPanel } from '@/components/photos-panel';
import { PillRow } from '@/components/pill-row';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';

type SubTab = 'metrics' | 'measure' | 'exercise' | 'photos';

const SUB_TABS: { key: SubTab; label: string }[] = [
  { key: 'metrics', label: 'Metrics' },
  { key: 'measure', label: 'Measure' },
  { key: 'exercise', label: 'Exercise' },
  { key: 'photos', label: 'Photos' },
];

export default function ProgressScreen() {
  const [activeTab, setActiveTab] = useState<SubTab>('metrics');

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
          <ThemedText type="title" style={styles.title}>
            Progress
          </ThemedText>

          <PillRow
            activeKey={activeTab}
            items={SUB_TABS.map((tab) => ({ key: tab.key, label: tab.label, onPress: () => setActiveTab(tab.key) }))}
          />

          {activeTab === 'metrics' && <MetricsPanel />}
          {activeTab === 'measure' && <MeasurePanel />}
          {activeTab === 'exercise' && <ExerciseProgressPanel />}
          {activeTab === 'photos' && <PhotosPanel />}
        </ScrollView>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  safeArea: { flex: 1, paddingHorizontal: Spacing.four, paddingTop: Spacing.four },
  scrollContent: {
    gap: Spacing.two,
    paddingBottom: Spacing.four,
  },
  title: {
    marginBottom: Spacing.two,
  },
});
