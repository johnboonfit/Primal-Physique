import { useState } from 'react';
import { Pressable, StyleSheet } from 'react-native';
import Svg, { Circle, Ellipse, Rect } from 'react-native-svg';

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

const WIDTH = 200;
const HEIGHT = 380;

type BodyRegion = {
  group: MuscleGroup;
  render: (color: string) => React.ReactNode;
};

// Shared shapes (identical position on both views -- the same muscle,
// visible from either side, so it always shows the same weekly count and
// therefore the same color).
function Shoulders({ color }: { color: string }) {
  return (
    <>
      <Ellipse cx={58} cy={68} rx={17} ry={13} fill={color} />
      <Ellipse cx={142} cy={68} rx={17} ry={13} fill={color} />
    </>
  );
}

function Arms({ color }: { color: string }) {
  return (
    <>
      <Rect x={32} y={64} width={21} height={104} rx={10.5} fill={color} />
      <Rect x={147} y={64} width={21} height={104} rx={10.5} fill={color} />
    </>
  );
}

function Legs({ color }: { color: string }) {
  return (
    <>
      <Rect x={70} y={168} width={26} height={88} rx={13} fill={color} />
      <Rect x={104} y={168} width={26} height={88} rx={13} fill={color} />
    </>
  );
}

function Calves({ color }: { color: string }) {
  return (
    <>
      <Rect x={72} y={262} width={22} height={66} rx={11} fill={color} />
      <Rect x={106} y={262} width={22} height={66} rx={11} fill={color} />
    </>
  );
}

const FRONT_REGIONS: BodyRegion[] = [
  { group: 'shoulders', render: (color) => <Shoulders key="shoulders" color={color} /> },
  { group: 'chest', render: (color) => <Rect key="chest" x={66} y={58} width={68} height={56} rx={14} fill={color} /> },
  { group: 'arms', render: (color) => <Arms key="arms" color={color} /> },
  { group: 'core', render: (color) => <Rect key="core" x={73} y={114} width={54} height={50} rx={12} fill={color} /> },
  { group: 'legs', render: (color) => <Legs key="legs" color={color} /> },
  { group: 'calves', render: (color) => <Calves key="calves" color={color} /> },
];

const BACK_REGIONS: BodyRegion[] = [
  { group: 'shoulders', render: (color) => <Shoulders key="shoulders" color={color} /> },
  { group: 'back', render: (color) => <Rect key="back" x={66} y={58} width={68} height={106} rx={16} fill={color} /> },
  { group: 'arms', render: (color) => <Arms key="arms" color={color} /> },
  { group: 'legs', render: (color) => <Legs key="legs" color={color} /> },
  { group: 'calves', render: (color) => <Calves key="calves" color={color} /> },
];

type MuscleHeatmapProps = {
  counts: MuscleGroupCounts;
};

/**
 * A simplified, deliberately non-anatomical body silhouette -- rounded
 * geometric shapes, not muscle illustration -- color-coded per region by
 * this week's logged set count for that muscle group. Tap anywhere on it
 * to flip between front and back: chest/core only show on the front
 * (not visible from behind), back only shows on the back (not visible
 * from the front), and shoulders/arms/legs/calves show identically on
 * both since they're visible either way and carry the same count.
 */
export function MuscleHeatmap({ counts }: MuscleHeatmapProps) {
  const [showingBack, setShowingBack] = useState(false);
  const regions = showingBack ? BACK_REGIONS : FRONT_REGIONS;

  return (
    <Pressable onPress={() => setShowingBack((current) => !current)} style={styles.container}>
      <Svg width={WIDTH} height={HEIGHT} viewBox={`0 0 ${WIDTH} ${HEIGHT}`}>
        {/* Head, neck, feet -- decorative outline only, not tracked. */}
        <Circle cx={100} cy={26} r={19} fill={NEUTRAL} />
        <Rect x={89} y={43} width={22} height={16} rx={5} fill={NEUTRAL} />
        <Ellipse cx={83} cy={332} rx={13} ry={8} fill={NEUTRAL} />
        <Ellipse cx={117} cy={332} rx={13} ry={8} fill={NEUTRAL} />

        {regions.map((region) => region.render(TIER_COLORS[tierForSetCount(counts[region.group])]))}
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
