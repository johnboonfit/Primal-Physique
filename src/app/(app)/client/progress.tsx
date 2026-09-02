import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { CompliancePanel } from '@/components/compliance-panel';
import { MeasurePanel } from '@/components/measure-panel';
import { MetricsPanel } from '@/components/metrics-panel';
import { PhotosPanel } from '@/components/photos-panel';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Accent, Colors, Spacing } from '@/constants/theme';

type SubTab = 'compliance' | 'metrics' | 'measure' | 'photos';

const SUB_TABS: { key: SubTab; label: string }[] = [
  { key: 'compliance', label: 'Compliance' },
  { key: 'metrics', label: 'Metrics' },
  { key: 'measure', label: 'Measure' },
  { key: 'photos', label: 'Photos' },
];

export default function ProgressScreen() {
  const [activeTab, setActiveTab] = useState<SubTab>('compliance');

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

          {activeTab === 'compliance' && <CompliancePanel />}
          {activeTab === 'metrics' && <MetricsPanel />}
          {activeTab === 'measure' && <MeasurePanel />}
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
  subTabRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
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
