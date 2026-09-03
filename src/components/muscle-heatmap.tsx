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
const HEIGHT = 480;

/** Zero logged sets gets no color at all (a neutral, untouched region) --
 * distinct from the "low" tier, which still means SOME real work was
 * done. Only an actual set logged this week earns any color. */
export function colorForCount(count: number): string {
  return count === 0 ? NEUTRAL : TIER_COLORS[tierForSetCount(count)];
}

// Right-half path data for the paired, mirrored regions -- authored once
// per region and reflected across the centerline (x=100) with a <G>
// transform, rather than hand-duplicating coordinates for the left side.
const SHOULDER_D = 'M114 56 C130 52 150 60 153 80 C155 94 148 104 135 105 C122 106 112 96 111 82 Z';
const ARM_D =
  'M116 58 C134 63 144 80 142 102 C141 118 136 132 130 140 C129 164 129 188 131 210 C132 226 130 242 125 256 L112 256 C110 240 111 224 112 208 C108 184 107 160 110 138 C104 124 105 102 110 84 C112 74 114 65 116 58 Z';
const LEG_D =
  'M101 188 L121 188 C125 218 123 250 118 282 C116 304 112 324 107 342 L100 342 C99 308 99 272 99 236 C99 220 100 203 101 188 Z';
const CALF_D =
  'M101 344 L113 344 C117 366 116 388 110 408 C108 422 104 434 100 440 L97 440 C94 430 93 416 95 400 C96 382 98 362 101 344 Z';
const LAT_D =
  'M114 82 C130 88 140 104 138 126 C136 146 128 166 116 182 L104 176 C107 158 110 140 110 122 C110 108 111 94 114 82 Z';

// Symmetric, single-piece regions that straddle the centerline.
const CHEST_D =
  'M79 84 C82 70 92 63 100 66 C108 63 118 70 121 84 C123 94 118 104 109 109 C103 112 100 108 100 101 C100 108 97 112 91 109 C82 104 77 94 79 84 Z';
const CORE_D =
  'M81 110 L119 110 C121 130 119 152 115 168 C113 178 110 184 105 186 L95 186 C90 184 87 178 85 168 C81 152 79 130 81 110 Z';
const TRAPS_D = 'M92 56 L108 56 L120 82 L100 128 L80 82 Z';
const SPINE_D = 'M93 128 L107 128 L105 186 L95 186 Z';

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
      <Path d="M100 110 L100 186" />
      <Path d="M85 130 L115 130" />
      <Path d="M84 150 L116 150" />
      <Path d="M83 168 L117 168" />
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
        <Circle cx={100} cy={24} r={18} fill={NEUTRAL} stroke={OUTLINE} strokeWidth={1.5} />
        <Path d="M92 42 L90 56 L110 56 L108 42 Z" fill={NEUTRAL} stroke={OUTLINE} strokeWidth={1.5} />
        <Ellipse cx={82} cy={259} rx={8} ry={11} fill={NEUTRAL} stroke={OUTLINE} strokeWidth={1.5} />
        <Ellipse cx={118} cy={259} rx={8} ry={11} fill={NEUTRAL} stroke={OUTLINE} strokeWidth={1.5} />
        <Ellipse cx={88} cy={452} rx={12} ry={8} fill={NEUTRAL} stroke={OUTLINE} strokeWidth={1.5} />
        <Ellipse cx={112} cy={452} rx={12} ry={8} fill={NEUTRAL} stroke={OUTLINE} strokeWidth={1.5} />

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
