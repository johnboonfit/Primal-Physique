import { Image } from 'expo-image';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';

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

const NEUTRAL = 'transparent';

/** Zero logged sets gets no color at all (a neutral, untouched region) --
 * distinct from the "low" tier, which still means SOME real work was
 * done. Only an actual set logged this week earns any color. */
export function colorForCount(count: number): string {
  return count === 0 ? NEUTRAL : TIER_COLORS[tierForSetCount(count)];
}

/**
 * Region fill paths traced directly off the reference "Muscle Anatomy"
 * chart artwork (not redrawn/approximated) -- each named region is the
 * exact enclosed shape the artwork already draws for that muscle group,
 * extracted via connected-component labeling of the line art and
 * simplified to an SVG path. Coordinates are in the source artwork's own
 * pixel space, matching the companion PNG's natural size exactly (see
 * FRONT_SIZE/BACK_SIZE), so the fill and the line art always align.
 */
const FRONT_PATHS: Record<Exclude<MuscleGroup, 'back'>, string> = {
  shoulders:
    'M 110.0 85.5 L 96.0 83.5 L 95.5 82.0 L 114.0 72.5 L 114.5 81.0 L 110.0 85.5 Z M 155.0 85.5 L 148.5 83.0 L 146.5 79.0 L 147.0 72.5 L 166.5 82.0 L 155.0 85.5 Z M 64.0 117.5 L 68.5 100.0 L 75.0 90.5 L 82.0 86.5 L 92.0 84.5 L 105.5 86.0 L 99.0 90.5 L 79.0 112.5 L 64.0 117.5 Z M 198.0 117.5 L 187.0 114.5 L 179.0 109.5 L 167.5 95.0 L 156.5 86.0 L 171.0 84.5 L 187.0 90.5 L 193.5 100.0 L 198.0 117.5 Z',
  chest:
    'M 111.0 130.5 L 103.0 130.5 L 93.0 126.5 L 78.5 114.0 L 84.0 110.5 L 103.0 89.5 L 119.0 85.5 L 126.0 87.5 L 130.5 92.0 L 130.5 114.0 L 124.0 124.5 L 111.0 130.5 Z M 160.0 130.5 L 144.0 128.5 L 133.5 119.0 L 131.5 113.0 L 131.5 92.0 L 136.0 87.5 L 152.0 86.5 L 159.0 89.5 L 176.0 108.5 L 183.5 114.0 L 169.0 126.5 L 160.0 130.5 Z',
  arms: 'M 59.0 159.5 L 54.0 159.5 L 49.5 156.0 L 51.5 136.0 L 60.0 121.5 L 70.0 116.5 L 79.0 116.5 L 83.5 121.0 L 83.5 132.0 L 67.5 153.0 L 59.0 159.5 Z M 208.0 159.5 L 200.0 158.5 L 179.5 134.0 L 178.5 121.0 L 181.0 117.5 L 195.0 117.5 L 201.0 120.5 L 207.5 129.0 L 213.5 149.0 L 212.5 156.0 L 208.0 159.5 Z M 25.0 205.5 L 19.5 204.0 L 18.5 197.0 L 34.5 161.0 L 47.0 146.5 L 47.5 155.0 L 50.0 158.5 L 55.0 161.5 L 61.5 161.0 L 56.5 167.0 L 50.5 180.0 L 25.0 205.5 Z M 240.0 205.5 L 236.0 205.5 L 233.0 200.5 L 216.5 186.0 L 200.5 161.0 L 210.0 160.5 L 214.5 155.0 L 215.0 146.5 L 225.5 158.0 L 233.5 173.0 L 244.5 199.0 L 240.0 205.5 Z',
  core: 'M 99.0 197.5 L 93.5 197.0 L 96.5 167.0 L 84.5 138.0 L 86.0 121.5 L 110.5 145.0 L 107.5 161.0 L 108.5 184.0 L 105.5 192.0 L 99.0 197.5 Z M 168.0 197.5 L 161.0 196.5 L 156.5 192.0 L 153.5 184.0 L 154.5 161.0 L 151.5 146.0 L 176.0 121.5 L 177.5 138.0 L 165.5 166.0 L 168.0 197.5 Z M 133.0 222.5 L 129.0 222.5 L 121.5 214.0 L 113.5 193.0 L 111.5 141.0 L 109.5 136.0 L 113.0 131.5 L 123.0 128.5 L 127.0 128.5 L 130.0 131.5 L 134.0 128.5 L 144.0 129.5 L 152.5 135.0 L 150.5 141.0 L 149.5 185.0 L 147.5 198.0 L 142.5 211.0 L 133.0 222.5 Z M 108.0 139.5 L 99.5 132.0 L 109.0 131.5 L 108.0 139.5 Z M 154.0 139.5 L 153.0 131.5 L 162.5 132.0 L 154.0 139.5 Z M 147.5 145.0 L 140.0 141.5 L 133.0 141.5 L 131.0 135.5 L 129.0 141.5 L 118.0 142.5 L 114.5 145.0 L 131.0 142.5 L 147.5 145.0 Z M 131.5 150.0 L 133.0 146.5 L 143.5 146.0 L 141.0 144.5 L 134.0 144.5 L 131.0 146.5 L 128.0 144.5 L 118.5 146.0 L 125.0 145.5 L 131.5 150.0 Z M 131.5 169.0 L 133.0 165.5 L 143.5 165.0 L 120.5 163.0 L 131.0 160.5 L 143.0 163.5 L 146.5 162.0 L 134.0 160.5 L 131.5 158.0 L 131.0 153.5 L 130.5 158.0 L 128.0 160.5 L 115.5 162.0 L 120.5 164.0 L 119.0 165.5 L 129.0 165.5 L 131.5 169.0 Z M 132.0 244.5 L 128.0 243.5 L 123.5 238.0 L 113.5 211.0 L 99.5 199.0 L 106.5 193.0 L 109.5 186.0 L 108.5 165.0 L 110.0 159.5 L 111.5 189.0 L 114.5 203.0 L 122.5 218.0 L 130.0 224.5 L 134.0 223.5 L 143.5 212.0 L 148.5 200.0 L 152.0 158.5 L 153.5 165.0 L 152.5 186.0 L 155.5 193.0 L 162.5 199.0 L 150.5 208.0 L 145.5 216.0 L 137.5 240.0 L 132.0 244.5 Z M 146.5 181.0 L 146.0 179.5 L 133.0 179.5 L 131.0 173.5 L 129.0 179.5 L 115.5 180.0 L 116.0 181.5 L 146.5 181.0 Z M 131.5 189.0 L 133.0 184.5 L 143.5 183.0 L 118.5 183.0 L 129.0 184.5 L 131.5 189.0 Z M 131.5 217.0 L 131.0 192.5 L 131.5 217.0 Z',
  legs: 'M 121.0 285.5 L 111.5 270.0 L 107.5 253.0 L 103.5 218.0 L 96.0 199.5 L 104.0 203.5 L 112.5 212.0 L 119.5 233.0 L 123.5 241.0 L 128.5 245.0 L 128.5 262.0 L 121.0 285.5 Z M 142.0 285.5 L 134.5 267.0 L 133.5 245.0 L 138.5 241.0 L 142.5 233.0 L 149.5 212.0 L 155.0 205.5 L 166.0 199.5 L 159.5 214.0 L 151.5 267.0 L 142.0 285.5 Z M 107.0 324.5 L 100.5 323.0 L 97.0 313.5 L 90.0 313.5 L 87.5 311.0 L 83.5 292.0 L 82.5 268.0 L 84.5 244.0 L 94.0 200.5 L 101.5 216.0 L 109.5 269.0 L 114.5 280.0 L 118.5 284.0 L 116.5 309.0 L 112.5 319.0 L 107.0 324.5 Z M 160.0 324.5 L 152.0 322.5 L 147.5 315.0 L 142.5 288.0 L 152.5 269.0 L 160.5 216.0 L 168.0 201.5 L 177.5 243.0 L 179.5 266.0 L 178.5 292.0 L 174.5 311.0 L 172.0 313.5 L 165.0 313.5 L 160.0 324.5 Z',
  calves:
    'M 82.0 451.5 L 71.0 449.5 L 66.5 443.0 L 77.5 432.0 L 84.5 417.0 L 85.5 401.0 L 81.5 377.0 L 81.5 349.0 L 85.5 335.0 L 88.0 333.5 L 91.5 336.0 L 86.5 331.0 L 87.5 317.0 L 89.0 314.5 L 95.0 314.5 L 102.0 326.5 L 110.0 324.5 L 114.0 318.5 L 114.5 322.0 L 110.5 332.0 L 103.0 339.5 L 95.0 340.5 L 91.5 338.0 L 97.0 342.5 L 106.5 340.0 L 109.5 368.0 L 104.5 377.0 L 99.5 395.0 L 97.5 434.0 L 90.5 440.0 L 90.5 444.0 L 82.0 451.5 Z M 167.0 340.5 L 159.0 339.5 L 153.5 335.0 L 148.5 326.0 L 148.0 318.5 L 152.0 324.5 L 160.0 326.5 L 167.0 314.5 L 173.5 315.0 L 175.5 331.0 L 167.0 340.5 Z M 184.0 451.5 L 181.0 451.5 L 174.0 445.5 L 172.5 440.0 L 165.5 434.0 L 163.5 395.0 L 158.5 377.0 L 153.5 368.0 L 156.5 340.0 L 166.0 342.5 L 175.0 333.5 L 177.5 335.0 L 181.5 349.0 L 181.5 377.0 L 177.5 401.0 L 178.5 417.0 L 185.5 432.0 L 196.5 443.0 L 192.0 449.5 L 184.0 451.5 Z',
};

const BACK_PATHS: Record<Exclude<MuscleGroup, 'chest' | 'core'>, string> = {
  shoulders:
    'M 150.0 92.5 L 141.0 90.5 L 117.0 90.5 L 108.0 92.5 L 94.5 82.0 L 111.0 75.5 L 148.0 75.5 L 163.5 82.0 L 150.0 92.5 Z M 62.0 111.5 L 60.5 111.0 L 61.5 107.0 L 65.5 98.0 L 74.0 89.5 L 85.0 84.5 L 95.0 84.5 L 102.5 90.0 L 84.0 105.5 L 78.0 108.5 L 62.0 111.5 Z M 196.0 111.5 L 177.0 107.5 L 155.5 90.0 L 163.0 84.5 L 173.0 84.5 L 182.0 88.5 L 193.5 100.0 L 196.5 107.0 L 196.0 111.5 Z M 130.0 140.5 L 128.0 140.5 L 124.5 135.0 L 116.5 112.0 L 107.0 93.5 L 137.0 91.5 L 150.5 94.0 L 130.0 140.5 Z',
  back: 'M 91.0 203.5 L 89.5 203.0 L 92.5 188.0 L 92.5 164.0 L 80.5 133.0 L 78.5 110.0 L 104.0 91.5 L 121.5 129.0 L 122.5 141.0 L 119.5 152.0 L 109.5 171.0 L 108.5 191.0 L 97.0 197.5 L 91.0 203.5 Z M 168.0 203.5 L 149.5 191.0 L 148.5 171.0 L 137.5 150.0 L 135.5 142.0 L 137.5 126.0 L 154.0 91.5 L 179.5 110.0 L 177.5 134.0 L 165.5 163.0 L 164.5 176.0 L 168.0 203.5 Z M 55.0 157.5 L 52.5 157.0 L 50.0 147.5 L 42.5 148.0 L 43.5 140.0 L 50.5 125.0 L 57.0 116.5 L 64.0 111.5 L 76.0 110.5 L 79.5 126.0 L 78.5 131.0 L 65.5 149.0 L 55.0 157.5 Z M 205.0 157.5 L 199.0 155.5 L 191.5 148.0 L 178.5 129.0 L 182.0 110.5 L 196.0 112.5 L 205.5 122.0 L 214.5 140.0 L 215.5 148.0 L 208.0 147.5 L 205.0 157.5 Z M 129.0 202.5 L 122.0 194.5 L 109.5 192.0 L 111.5 187.0 L 110.5 173.0 L 121.5 152.0 L 124.0 138.5 L 128.0 142.5 L 134.5 139.0 L 136.5 152.0 L 147.5 174.0 L 146.5 188.0 L 148.5 192.0 L 140.0 192.5 L 134.0 195.5 L 129.0 202.5 Z',
  arms: 'M 20.0 209.5 L 15.0 209.5 L 11.5 206.0 L 11.5 203.0 L 23.5 170.0 L 32.5 156.0 L 40.0 148.5 L 43.0 150.5 L 49.0 149.5 L 50.5 157.0 L 53.0 159.5 L 57.5 159.0 L 41.5 184.0 L 29.5 196.0 L 20.0 209.5 Z M 243.0 209.5 L 235.5 207.0 L 227.5 195.0 L 215.5 183.0 L 200.5 159.0 L 205.0 159.5 L 207.5 157.0 L 208.0 149.5 L 215.0 150.5 L 218.0 148.5 L 230.5 163.0 L 246.5 203.0 L 246.5 206.0 L 243.0 209.5 Z',
  legs: 'M 118.0 244.5 L 103.0 242.5 L 97.0 238.5 L 92.5 232.0 L 93.5 217.0 L 99.5 200.0 L 104.0 195.5 L 112.0 193.5 L 121.0 195.5 L 126.5 201.0 L 128.5 208.0 L 127.5 238.0 L 124.0 242.5 L 118.0 244.5 Z M 145.0 244.5 L 136.0 243.5 L 130.5 238.0 L 129.5 206.0 L 137.0 195.5 L 147.0 193.5 L 155.0 196.5 L 160.5 204.0 L 165.5 222.0 L 165.5 231.0 L 162.5 237.0 L 157.0 241.5 L 145.0 244.5 Z M 106.0 325.5 L 103.0 325.5 L 100.5 322.0 L 98.0 307.5 L 94.5 310.0 L 91.5 318.0 L 87.5 319.0 L 82.5 307.0 L 79.5 286.0 L 79.5 256.0 L 84.5 226.0 L 88.5 215.0 L 88.5 209.0 L 97.0 199.5 L 90.5 223.0 L 91.5 233.0 L 99.0 242.5 L 117.5 247.0 L 117.5 255.0 L 122.5 266.0 L 122.5 274.0 L 115.5 297.0 L 112.5 316.0 L 106.0 325.5 Z M 155.0 325.5 L 150.0 324.5 L 145.5 316.0 L 141.5 293.0 L 136.5 279.0 L 135.5 266.0 L 139.5 258.0 L 140.5 247.0 L 159.0 242.5 L 166.5 233.0 L 167.5 224.0 L 159.5 200.0 L 161.0 199.5 L 169.5 209.0 L 169.5 216.0 L 175.5 236.0 L 178.5 256.0 L 178.5 286.0 L 174.5 311.0 L 170.5 319.0 L 166.5 318.0 L 162.5 309.0 L 160.0 307.5 L 157.5 322.0 L 155.0 325.5 Z M 124.0 264.5 L 119.5 256.0 L 118.5 246.0 L 126.0 242.5 L 126.5 255.0 L 124.0 264.5 Z M 134.0 265.5 L 131.5 256.0 L 132.0 242.5 L 139.5 246.0 L 138.5 256.0 L 134.0 265.5 Z',
  calves:
    'M 103.0 346.5 L 100.0 344.5 L 91.0 346.5 L 80.5 339.0 L 83.0 314.5 L 86.0 319.5 L 90.0 321.5 L 97.0 309.5 L 100.5 325.0 L 105.0 327.5 L 110.5 324.0 L 103.5 336.0 L 103.0 346.5 Z M 167.0 340.5 L 161.0 344.5 L 154.5 346.0 L 154.5 336.0 L 147.5 326.0 L 148.0 324.5 L 154.0 327.5 L 157.5 325.0 L 161.0 309.5 L 168.0 321.5 L 170.0 321.5 L 175.5 315.0 L 177.5 338.0 L 167.0 340.5 Z M 99.0 385.5 L 94.5 384.0 L 91.0 372.5 L 87.5 375.0 L 83.0 383.5 L 79.0 383.5 L 75.5 378.0 L 74.5 354.0 L 80.0 340.5 L 92.0 348.5 L 100.0 346.5 L 104.5 352.0 L 105.5 377.0 L 103.5 382.0 L 99.0 385.5 Z M 161.0 385.5 L 157.0 384.5 L 152.5 377.0 L 153.5 351.0 L 158.0 346.5 L 165.0 348.5 L 169.0 347.5 L 178.0 340.5 L 183.5 356.0 L 183.5 373.0 L 181.5 380.0 L 179.0 383.5 L 175.0 383.5 L 167.0 372.5 L 164.5 382.0 L 161.0 385.5 Z M 88.0 451.5 L 80.0 451.5 L 73.0 446.5 L 62.0 443.5 L 61.5 440.0 L 70.0 436.5 L 75.5 431.0 L 78.5 423.0 L 75.5 383.0 L 83.0 385.5 L 90.0 374.5 L 92.5 384.0 L 97.0 387.5 L 100.0 386.5 L 100.5 389.0 L 91.5 421.0 L 91.5 448.0 L 88.0 451.5 Z M 178.0 451.5 L 170.0 451.5 L 166.5 449.0 L 165.5 416.0 L 156.5 387.0 L 161.0 387.5 L 164.5 385.0 L 168.0 374.5 L 170.5 381.0 L 175.0 385.5 L 182.5 383.0 L 179.5 405.0 L 179.5 424.0 L 185.0 433.5 L 196.5 441.0 L 196.0 443.5 L 187.0 445.5 L 178.0 451.5 Z',
};

// Natural pixel size of the source artwork crops -- the SVG fill layer's
// viewBox must match this exactly so its paths line up with the line-art
// image rendered on top of it.
const FRONT_SIZE = { width: 264, height: 461 };
const BACK_SIZE = { width: 262, height: 461 };
const DISPLAY_HEIGHT = 320;

type MuscleHeatmapProps = {
  counts: MuscleGroupCounts;
};

/**
 * The real "Muscle Anatomy" reference chart, used exactly as supplied --
 * not redrawn -- with each muscle group's own enclosed region (traced
 * directly off that artwork's line art via connected-component labeling,
 * see the diagrams the FRONT_PATHS/BACK_PATHS were extracted from) filled
 * underneath it by this week's logged set count. The artwork's own line
 * art then renders on top, transparent everywhere except its white
 * outline strokes, so the color fills always read as "inside this
 * specific muscle" rather than a rough approximation. Tap anywhere on it
 * to flip between front and back: chest/core only exist on the front
 * artwork (not visible from behind), back only exists on the back
 * artwork, and shoulders/arms/legs/calves appear on both since they're
 * visible either way and always carry the same count.
 */
export function MuscleHeatmap({ counts }: MuscleHeatmapProps) {
  const [showingBack, setShowingBack] = useState(false);

  const size = showingBack ? BACK_SIZE : FRONT_SIZE;
  const displayWidth = Math.round((size.width / size.height) * DISPLAY_HEIGHT);

  const color = (group: MuscleGroup) => colorForCount(counts[group]);

  return (
    <Pressable onPress={() => setShowingBack((current) => !current)} style={styles.container}>
      <View style={[styles.glowWrap, { width: displayWidth, height: DISPLAY_HEIGHT }]}>
        <Svg
          width={displayWidth}
          height={DISPLAY_HEIGHT}
          viewBox={`0 0 ${size.width} ${size.height}`}
          style={StyleSheet.absoluteFill}>
          {showingBack ? (
            <>
              <Path d={BACK_PATHS.shoulders} fill={color('shoulders')} />
              <Path d={BACK_PATHS.back} fill={color('back')} />
              <Path d={BACK_PATHS.arms} fill={color('arms')} />
              <Path d={BACK_PATHS.legs} fill={color('legs')} />
              <Path d={BACK_PATHS.calves} fill={color('calves')} />
            </>
          ) : (
            <>
              <Path d={FRONT_PATHS.shoulders} fill={color('shoulders')} />
              <Path d={FRONT_PATHS.chest} fill={color('chest')} />
              <Path d={FRONT_PATHS.core} fill={color('core')} />
              <Path d={FRONT_PATHS.arms} fill={color('arms')} />
              <Path d={FRONT_PATHS.legs} fill={color('legs')} />
              <Path d={FRONT_PATHS.calves} fill={color('calves')} />
            </>
          )}
        </Svg>
        <Image
          source={showingBack ? require('@/assets/images/muscle-anatomy-back.png') : require('@/assets/images/muscle-anatomy-front.png')}
          style={{ width: displayWidth, height: DISPLAY_HEIGHT }}
          contentFit="fill"
        />
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
