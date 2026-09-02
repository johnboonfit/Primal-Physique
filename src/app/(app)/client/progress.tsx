import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { MeasurePanel } from '@/components/measure-panel';
import { MetricsPanel } from '@/components/metrics-panel';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Accent, Colors, Spacing } from '@/constants/theme';

type SubTab = 'metrics' | 'measure';

const SUB_TABS: { key: SubTab; label: string }[] = [
  { key: 'metrics', label: 'Metrics' },
  { key: 'measure', label: 'Measure' },
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

          <View style={styles.subTabRow}>
            {SUB_TABS.map((tab) => (
              <Pressable key={tab.key} onPress={() => setActiveTab(tab.key)}>
                <View style={[styles.subTab, activeTab === tab.key && styles.subTabActive]}>
                  <ThemedText
                    type="smallBold"
                    style={activeTab === tab.key ? styles.subTabActiveText : styles.subTabText}>
                    {tab.label}
                  </ThemedText>
                </View>
              </Pressable>
            ))}
          </View>

          {activeTab === 'metrics' ? <MetricsPanel /> : <MeasurePanel />}
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
  subTabRow: {
    flexDirection: 'row',
    gap: Spacing.two,
    marginBottom: Spacing.two,
  },
  subTab: {
    borderRadius: 999,
    paddingVertical: Spacing.one,
    paddingHorizontal: Spacing.three,
    backgroundColor: Colors.backgroundElement,
  },
  subTabActive: {
    backgroundColor: Accent,
  },
  subTabText: {
    color: Colors.textSecondary,
  },
  subTabActiveText: {
    color: Colors.text,
  },
});
