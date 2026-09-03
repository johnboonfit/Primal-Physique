import { useState } from 'react';
import { Pressable, StyleSheet } from 'react-native';
import Svg, { Circle, Ellipse, G, Path } from 'react-native-svg';

import { ThemedText } from '@/components/themed-text';
import { Colors, Spacing } from '@/constants/theme';
import type { MuscleGroup } from '@/lib/exercise-library';
import { tierForSetCount, type MuscleGroupCounts, type VolumeTier } from '@/lib/muscle-group-analysis';

// A real, universally-understood traffic-light convention for a training
// LOAD warning -- used as-is rather than remapped into this app's own
// carbon/teal/oxblood palette, same reasoning NutriScoreBadge already
// uses the real Nutri-Score colors: the whole point is that red reads as
// "too much" at a glance, which a teal-only palette can't signal.
export const TIER_COLORS: Record<VolumeTier, string> = {
  low: '#2ECC71',
  moderate: '#F4B400',
  high: '#EF4444',
};

const NEUTRAL = Colors.backgroundSelected;
const OUTLINE = Colors.background;

const WIDTH = 200;
const HEIGHT = 440;

/** Zero logged sets gets no color at all (a neutral, untouched region) --
 * distinct from the "low" tier, which still means SOME real work was
 * done. Only an actual set logged this week earns any color. */
export function colorForCount(count: number): string {
  return count === 0 ? NEUTRAL : TIER_COLORS[tierForSetCount(count)];
}

// Right-half path data for the paired, mirrored regions -- authored once
// per region and reflected across the centerline (x=100) with a <G>
// transform, rather than hand-duplicating coordinates for the left side.
const SHOULDER_D = 'M120 66 C138 62 160 72 166 92 C170 106 162 120 146 122 C132 124 120 112 118 96 Z';
const ARM_D =
  'M148 96 C166 104 172 126 168 150 C165 170 156 182 148 186 C144 206 142 226 146 246 C148 258 146 270 138 278 L126 278 C122 264 124 246 128 228 C122 212 120 192 126 172 C116 158 114 134 122 114 C128 104 138 98 148 96 Z';
const LEG_D =
  'M102 215 L124 215 C128 240 126 264 121 288 C119 306 116 322 112 334 L102 334 C101 306 100 278 100 250 C100 238 101 226 102 215 Z';
const CALF_D =
  'M102 336 L112 336 C116 352 115 368 110 384 C108 394 105 402 100 406 L98 406 C96 396 95 384 96 370 C97 358 99 346 102 336 Z';
const LAT_D =
  'M118 98 C136 104 148 122 146 146 C144 168 134 190 120 208 L106 202 C110 182 113 162 112 142 C111 126 113 110 118 98 Z';

// Symmetric, single-piece regions that straddle the centerline.
const CHEST_D =
  'M74 100 C78 84 92 74 100 78 C108 74 122 84 126 100 C130 112 124 126 112 132 C104 136 100 130 100 122 C100 130 96 136 88 132 C76 126 70 112 74 100 Z';
const CORE_D =
  'M80 134 L120 134 C122 158 121 182 118 200 C117 208 115 214 112 216 L88 216 C85 214 83 208 82 200 C79 182 78 158 80 134 Z';
const TRAPS_D = 'M90 66 L110 66 L124 96 L100 146 L76 96 Z';
const SPINE_D = 'M92 146 L108 146 L106 216 L94 216 Z';

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
      <Path d="M100 134 L100 216" />
      <Path d="M84 156 L116 156" />
      <Path d="M83 178 L117 178" />
      <Path d="M82 198 L118 198" />
    </G>
  );
}

type MuscleHeatmapProps = {
  counts: MuscleGroupCounts;
};

/**
 * A stylized, athletically-proportioned body silhouette (not literal
 * anatomy) built from SVG paths, color-coded per region by this week's
 * logged set count for that muscle group. Tap anywhere on it to flip
 * between front and back: chest/core only show on the front (not visible
 * from behind), back only shows on the back (not visible from the
 * front), and shoulders/arms/legs/calves show identically on both since
 * they're visible either way and carry the same count.
 */
export function MuscleHeatmap({ counts }: MuscleHeatmapProps) {
  const [showingBack, setShowingBack] = useState(false);

  const color = (group: MuscleGroup) => colorForCount(counts[group]);

  return (
    <Pressable onPress={() => setShowingBack((current) => !current)} style={styles.container}>
      <Svg width={WIDTH} height={HEIGHT} viewBox={`0 0 ${WIDTH} ${HEIGHT}`}>
        {/* Head, neck, hands, feet -- decorative outline only, not tracked. */}
        <Circle cx={100} cy={30} r={22} fill={NEUTRAL} stroke={OUTLINE} strokeWidth={1.5} />
        <Path d="M90 50 L88 66 L112 66 L110 50 Z" fill={NEUTRAL} stroke={OUTLINE} strokeWidth={1.5} />
        <Ellipse cx={64} cy={281} rx={9} ry={12} fill={NEUTRAL} stroke={OUTLINE} strokeWidth={1.5} />
        <Ellipse cx={136} cy={281} rx={9} ry={12} fill={NEUTRAL} stroke={OUTLINE} strokeWidth={1.5} />
        <Ellipse cx={88} cy={412} rx={13} ry={9} fill={NEUTRAL} stroke={OUTLINE} strokeWidth={1.5} />
        <Ellipse cx={112} cy={412} rx={13} ry={9} fill={NEUTRAL} stroke={OUTLINE} strokeWidth={1.5} />

        {showingBack ? (
          <>
            <Path d={TRAPS_D} fill={color('shoulders')} stroke={OUTLINE} strokeWidth={1.5} />
            <Path d={SPINE_D} fill={color('back')} stroke={OUTLINE} strokeWidth={1.5} />
            <MirroredRegion d={LAT_D} color={color('back')} />
            <MirroredRegion d={SHOULDER_D} color={color('shoulders')} />
            <MirroredRegion d={ARM_D} color={color('arms')} />
            <MirroredRegion d={LEG_D} color={color('legs')} />
            <MirroredRegion d={CALF_D} color={color('calves')} />
          </>
        ) : (
          <>
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
  flipHint: {
    marginTop: Spacing.half,
  },
});
