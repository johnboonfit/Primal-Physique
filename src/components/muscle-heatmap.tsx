import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Svg, { Circle, Ellipse, G, Path } from 'react-native-svg';

import { ThemedText } from '@/components/themed-text';
import { Colors, Glow, Spacing } from '@/constants/theme';
import type { MuscleGroup } from '@/lib/exercise-library';
import { tierForSetCount, type MuscleGroupCounts, type VolumeTier } from '@/lib/muscle-group-analysis';

/**
 * A teal -> oxblood intensity gradient, not a red/yellow/green traffic
 * light -- this stays on this app's own palette instead of borrowing an
 * unrelated convention. Bright teal (low) deepens to deep teal
 * (moderate), then switches to oxblood (high) -- oxblood already means
 * "needs attention" everywhere else in the app (buttons, active/selected
 * states), so a muscle group pushed into overtraining reads the exact
 * same way here.
 */
export const TIER_COLORS: Record<VolumeTier, string> = {
  low: Colors.tealBright,
  moderate: Colors.tealDeep,
  high: Colors.oxblood,
};

const NEUTRAL = Colors.backgroundSelected;
const OUTLINE = Colors.background;

const WIDTH = 220;
const HEIGHT = 480;

/** Zero logged sets gets no color at all (a neutral, untouched region) --
 * distinct from the "low" tier, which still means SOME real work was
 * done. Only an actual set logged this week earns any color. */
export function colorForCount(count: number): string {
  return count === 0 ? NEUTRAL : TIER_COLORS[tierForSetCount(count)];
}

// Right-half path data for the paired, mirrored regions -- authored once
// per region and reflected across the centerline (x=110) with a <G>
// transform, rather than hand-duplicating coordinates for the left side.
// The pose (arms held slightly out from the torso, per the reference
// anatomy chart) is deliberate -- it's what leaves the armpit/lat area
// visible instead of an arm flattened against the body.
const TRAP_FRONT_D = 'M119 62 C127 60 135 62 139 68 C141 73 137 79 129 81 C123 82 118 77 117 68 Z';
const SHOULDER_D =
  'M132 68 C149 66 169 75 175 93 C179 105 172 117 158 120 C146 122 134 113 130 97 C128 87 129 76 132 68 Z';
const ARM_D =
  'M140 96 C161 100 177 117 179 141 C180 157 173 171 161 179 C163 197 167 215 173 231 C175 241 173 251 165 257 L153 255 C151 241 149 225 149 209 C143 197 139 181 141 165 C133 153 129 135 133 119 C135 109 137 101 140 96 Z';
const LEG_D =
  'M100 242 L139 242 C143 268 141 296 135 322 C132 338 127 350 119 358 L104 358 C102 336 101 312 101 288 C101 272 100 256 100 242 Z';
const CALF_D =
  'M104 360 L120 360 C125 382 123 404 115 424 C112 434 107 444 100 448 L96 448 C92 436 91 420 94 402 C96 384 100 368 104 360 Z';
const TRAP_BACK_HALF_D = 'M110 62 L140 100 L110 168 Z';
const LAT_D =
  'M138 92 C157 100 167 121 163 147 C160 169 149 191 133 209 L117 201 C121 179 125 157 123 135 C122 118 123 102 131 90 Z';
const HAM_GLUTE_D =
  'M98 224 L141 224 C146 248 143 274 137 298 C144 312 141 330 133 344 C129 354 123 360 117 362 L102 362 C100 340 99 316 100 292 C96 270 97 246 98 224 Z';

// Symmetric, single-piece regions that straddle the centerline.
const CHEST_D =
  'M84 82 C88 68 100 60 110 64 C120 60 132 68 136 82 C139 96 132 114 118 122 C112 126 110 120 110 110 C110 120 108 126 102 122 C88 114 81 96 84 82 Z';
const CORE_D =
  'M88 124 L132 124 C135 148 133 174 127 196 C124 208 119 218 112 222 L108 222 C101 218 96 208 93 196 C87 174 85 148 88 124 Z';
const SPINE_D = 'M98 168 L122 168 C120 190 118 208 112 222 L108 222 C102 208 100 190 98 168 Z';

function MirroredRegion({ d, color }: { d: string; color: string }) {
  return (
    <>
      <Path d={d} fill={color} stroke={OUTLINE} strokeWidth={1.5} />
      <G transform={`translate(${WIDTH}, 0) scale(-1, 1)`}>
        <Path d={d} fill={color} stroke={OUTLINE} strokeWidth={1.5} />
      </G>
    </>
  );
}

function CoreDividers() {
  return (
    <G stroke={OUTLINE} strokeWidth={1} strokeOpacity={0.5}>
      <Path d="M110 124 L110 222" />
      <Path d="M91 142 L129 142" />
      <Path d="M89 162 L131 162" />
      <Path d="M87 182 L133 182" />
      <Path d="M90 202 L130 202" />
    </G>
  );
}

type MuscleHeatmapProps = {
  counts: MuscleGroupCounts;
};

/**
 * A muscular body silhouette modeled on a standard front/back anatomy
 * reference chart (arms held slightly out from the torso, distinct
 * trapezius/deltoid/pec/lat regions, a segmented ab grid), built from
 * SVG paths and color-coded per region by this week's logged set count
 * for that muscle group. Tap anywhere on it to flip between front and
 * back: chest/core only show on the front (not visible from behind),
 * back only shows on the back (not visible from the front), and
 * shoulders/arms/legs/calves show identically on both since they're
 * visible either way and carry the same count.
 */
export function MuscleHeatmap({ counts }: MuscleHeatmapProps) {
  const [showingBack, setShowingBack] = useState(false);

  const color = (group: MuscleGroup) => colorForCount(counts[group]);

  return (
    <Pressable onPress={() => setShowingBack((current) => !current)} style={styles.container}>
      <View style={styles.glowWrap}>
      <Svg width={WIDTH} height={HEIGHT} viewBox={`0 0 ${WIDTH} ${HEIGHT}`}>
        {/* Head, neck, hands, feet -- decorative outline only, not tracked. */}
        <Circle cx={110} cy={28} r={19} fill={NEUTRAL} stroke={OUTLINE} strokeWidth={1.5} />
        <Path d="M101 47 L99 62 L121 62 L119 47 Z" fill={NEUTRAL} stroke={OUTLINE} strokeWidth={1.5} />
        <Ellipse cx={158} cy={258} rx={8} ry={11} fill={NEUTRAL} stroke={OUTLINE} strokeWidth={1.5} />
        <Ellipse cx={62} cy={258} rx={8} ry={11} fill={NEUTRAL} stroke={OUTLINE} strokeWidth={1.5} />
        <Ellipse cx={98} cy={452} rx={12} ry={8} fill={NEUTRAL} stroke={OUTLINE} strokeWidth={1.5} />
        <Ellipse cx={122} cy={452} rx={12} ry={8} fill={NEUTRAL} stroke={OUTLINE} strokeWidth={1.5} />

        {showingBack ? (
          <>
            <Path d={TRAP_BACK_HALF_D} fill={color('shoulders')} stroke={OUTLINE} strokeWidth={1.5} />
            <G transform={`translate(${WIDTH}, 0) scale(-1, 1)`}>
              <Path d={TRAP_BACK_HALF_D} fill={color('shoulders')} stroke={OUTLINE} strokeWidth={1.5} />
            </G>
            <Path d={SPINE_D} fill={color('back')} stroke={OUTLINE} strokeWidth={1.5} />
            <MirroredRegion d={LAT_D} color={color('back')} />
            <MirroredRegion d={SHOULDER_D} color={color('shoulders')} />
            <MirroredRegion d={ARM_D} color={color('arms')} />
            <MirroredRegion d={HAM_GLUTE_D} color={color('legs')} />
            <MirroredRegion d={CALF_D} color={color('calves')} />
          </>
        ) : (
          <>
            <MirroredRegion d={TRAP_FRONT_D} color={color('shoulders')} />
            <MirroredRegion d={SHOULDER_D} color={color('shoulders')} />
            <Path d={CHEST_D} fill={color('chest')} stroke={OUTLINE} strokeWidth={1.5} />
            <Path d={CORE_D} fill={color('core')} stroke={OUTLINE} strokeWidth={1.5} />
            <CoreDividers />
            <MirroredRegion d={ARM_D} color={color('arms')} />
            <MirroredRegion d={LEG_D} color={color('legs')} />
            <MirroredRegion d={CALF_D} color={color('calves')} />
          </>
        )}
      </Svg>
      </View>
      <ThemedText type="small" themeColor="textSecondary" style={styles.flipHint}>
        {showingBack ? 'Back — tap to flip' : 'Front — tap to flip'}
      </ThemedText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    gap: Spacing.one,
  },
  glowWrap: {
    ...Glow.teal,
  },
  flipHint: {
    marginTop: Spacing.half,
  },
});
