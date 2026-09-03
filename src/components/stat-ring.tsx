import { StyleSheet, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';

import { ThemedText } from '@/components/themed-text';
import { Colors, Glow, Spacing } from '@/constants/theme';

type StatRingProps = {
  value: string;
  label: string;
  /** 0-1 fill fraction for the ring's arc, when this stat has a real cap
   * to measure against (e.g. session RPE out of 10). Omit for an
   * open-ended number with no natural ceiling (e.g. total weight
   * lifted) -- renders as a full ring instead of a fabricated
   * percentage. */
  progress?: number;
  size?: number;
};

const STROKE_WIDTH = 10;

/**
 * A circular data ring, in this app's own palette -- soft teal glow
 * behind a teal arc on a carbon-black track, bone white number in the
 * center. Deliberately just one accent color (teal) rather than the
 * multi-color gauges a reference design might use: oxblood is reserved
 * for buttons/active states only (see theme.ts), so it never appears
 * here as decoration.
 */
export function StatRing({ value, label, progress, size = 140 }: StatRingProps) {
  const radius = (size - STROKE_WIDTH) / 2;
  const circumference = 2 * Math.PI * radius;
  const fraction = progress === undefined ? 1 : Math.min(1, Math.max(0, progress));
  const dashOffset = circumference * (1 - fraction);
  // Scales with the ring itself rather than a fixed ThemedText size, so
  // a smaller supporting-stat ring's number doesn't overflow its circle.
  const valueFontSize = Math.round(size * 0.26);

  return (
    <View style={styles.container}>
      <View style={[styles.glowWrap, { width: size, height: size, borderRadius: size / 2 }]}>
        <Svg width={size} height={size} style={styles.svg}>
          <Circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            stroke={Colors.backgroundSelected}
            strokeWidth={STROKE_WIDTH}
            fill="none"
          />
          <Circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            stroke={Colors.tealBright}
            strokeWidth={STROKE_WIDTH}
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={dashOffset}
            fill="none"
            // Starts the arc at the top (12 o'clock) instead of SVG's
            // default 3 o'clock, and fills clockwise. A plain SVG
            // `transform` string here (rather than react-native-svg's
            // rotation/origin shorthand props) avoids a harmless but
            // noisy "Invalid DOM property" console warning under
            // react-native-web.
            transform={`rotate(-90, ${size / 2}, ${size / 2})`}
          />
        </Svg>
        <View style={styles.center}>
          <ThemedText
            style={[styles.value, { fontSize: valueFontSize, lineHeight: valueFontSize * 1.05 }]}
            numberOfLines={1}
            adjustsFontSizeToFit>
            {value}
          </ThemedText>
        </View>
      </View>
      <ThemedText type="smallBold" style={styles.label}>
        {label}
      </ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    gap: Spacing.two,
  },
  glowWrap: {
    ...Glow.teal,
    alignItems: 'center',
    justifyContent: 'center',
  },
  svg: {
    position: 'absolute',
  },
  center: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.two,
  },
  value: {
    textAlign: 'center',
    fontWeight: '800',
  },
  label: {
    textTransform: 'uppercase',
    letterSpacing: 1,
    textAlign: 'center',
  },
});
