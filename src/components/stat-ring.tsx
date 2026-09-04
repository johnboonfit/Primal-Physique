import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { Circle } from 'react-native-svg';

import { ThemedText } from '@/components/themed-text';
import { Colors, Glow, Spacing } from '@/constants/theme';

type StatRingProps = {
  value: string;
  label: string;
  /** A short caption under the label -- e.g. "out of 10", or "Coming
   * soon" on a muted/placeholder ring. */
  subtitle?: string;
  /** 0-1 fill fraction for the ring's arc, when this stat has a real cap
   * to measure against (e.g. session RPE out of 10). Omit for an
   * open-ended number with no natural ceiling (e.g. total weight
   * lifted) -- renders as a full ring instead of a fabricated
   * percentage. */
  progress?: number;
  size?: number;
  /** A stat with no real data behind it yet (e.g. Readiness, Steps --
   * see stat-tile.tsx's identical convention). Renders a dashed outline
   * ring with no glow and a muted number instead of a real reading, so
   * it visibly reads as "not tracked yet" rather than a fabricated
   * zero. */
  muted?: boolean;
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
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
export function StatRing({ value, label, subtitle, progress, size = 140, muted, onPress, style }: StatRingProps) {
  const radius = (size - STROKE_WIDTH) / 2;
  const circumference = 2 * Math.PI * radius;
  const fraction = progress === undefined ? 1 : Math.min(1, Math.max(0, progress));
  const dashOffset = circumference * (1 - fraction);
  // Scales with the ring itself rather than a fixed ThemedText size, so
  // a smaller supporting-stat ring's number doesn't overflow its circle.
  const valueFontSize = Math.round(size * 0.26);

  return (
    <Pressable
      style={({ pressed }) => [styles.container, style, pressed && onPress && styles.pressed]}
      onPress={onPress}
      disabled={!onPress}>
      <View
        style={[
          styles.glowWrap,
          { width: size, height: size, borderRadius: size / 2 },
          muted && styles.glowWrapMuted,
        ]}>
        <Svg width={size} height={size} style={styles.svg}>
          {!muted && (
            <Circle
              cx={size / 2}
              cy={size / 2}
              r={radius}
              stroke={Colors.backgroundSelected}
              strokeWidth={STROKE_WIDTH}
              fill="none"
            />
          )}
          <Circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            stroke={muted ? Colors.backgroundSelected : Colors.tealBright}
            strokeWidth={muted ? 1.5 : STROKE_WIDTH}
            strokeLinecap="round"
            strokeDasharray={muted ? '4, 7' : circumference}
            strokeDashoffset={muted ? 0 : dashOffset}
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
            style={[
              styles.value,
              { fontSize: valueFontSize, lineHeight: valueFontSize * 1.05 },
              muted && styles.mutedValue,
            ]}
            numberOfLines={1}
            adjustsFontSizeToFit>
            {value}
          </ThemedText>
        </View>
      </View>
      <ThemedText type="smallBold" style={[styles.label, muted && styles.mutedLabel]}>
        {label}
      </ThemedText>
      {subtitle && (
        <ThemedText type="small" themeColor="textSecondary" style={styles.subtitle}>
          {subtitle}
        </ThemedText>
      )}
    </Pressable>
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
  glowWrapMuted: {
    shadowOpacity: 0,
    elevation: 0,
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
  mutedValue: {
    color: Colors.textSecondary,
  },
  label: {
    textTransform: 'uppercase',
    letterSpacing: 1,
    textAlign: 'center',
  },
  mutedLabel: {
    color: Colors.textSecondary,
  },
  subtitle: {
    textAlign: 'center',
  },
  pressed: {
    opacity: 0.85,
  },
});
