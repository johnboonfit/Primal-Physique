import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import type { NutriScoreGrade } from '@/lib/nutri-score';

// The actual official Nutri-Score palette (Santé publique France) --
// used as-is rather than remapped to this app's own palette, since the
// whole point of the badge is that it's instantly recognizable as a
// real Nutri-Score grade, the same way it looks on an actual product.
const GRADE_COLORS: Record<NutriScoreGrade, string> = {
  A: '#038141',
  B: '#85BB2F',
  C: '#FECB02',
  D: '#EE8100',
  E: '#E63E11',
};

// The C grade's yellow is too light for white text to stay readable.
const DARK_TEXT_GRADES: NutriScoreGrade[] = ['C'];

export function NutriScoreBadge({ grade, size = 'small' }: { grade: NutriScoreGrade; size?: 'small' | 'large' }) {
  const isLarge = size === 'large';
  return (
    <View
      style={[
        styles.badge,
        { backgroundColor: GRADE_COLORS[grade] },
        isLarge ? styles.badgeLarge : styles.badgeSmall,
      ]}>
      <ThemedText
        type={isLarge ? 'title' : 'smallBold'}
        style={[styles.text, DARK_TEXT_GRADES.includes(grade) ? styles.textDark : styles.textLight]}>
        {grade}
      </ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 999,
  },
  badgeSmall: {
    width: 22,
    height: 22,
  },
  badgeLarge: {
    width: 44,
    height: 44,
  },
  text: {
    fontWeight: '800',
  },
  textLight: {
    color: '#FFFFFF',
  },
  textDark: {
    color: '#1A1A1A',
  },
});
