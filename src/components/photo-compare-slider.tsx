import { Image } from 'expo-image';
import { useCallback } from 'react';
import { StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { useAnimatedStyle, useSharedValue } from 'react-native-reanimated';

import { ThemedText } from '@/components/themed-text';
import { Accent, Colors, Spacing } from '@/constants/theme';

const AnimatedImage = Animated.createAnimatedComponent(Image);

// Never below 1x: contentFit="cover" already fills the frame at 1x, so
// zooming out further would just reveal empty space at the edges.
// Zooming in past 3x is more than enough to line up a specific feature
// (waist, shoulders) between two photos taken at different distances.
const MIN_ZOOM = 1;
const MAX_ZOOM = 3;

export type PhotoCompareSliderProps = {
  beforeUri: string;
  afterUri: string;
  beforeLabel?: string;
  afterLabel?: string;
};

/**
 * A generic before/after image slider: two images stacked, a draggable
 * vertical divider reveals more of one or the other, and each image can
 * be pinch-zoomed independently — two photos of the same person rarely
 * end up at the same scale (different distance from the camera, a
 * different crop), so being able to resize just one until a landmark
 * (waist, shoulders) lines up with the other is what makes the
 * comparison actually useful rather than just a novelty wipe effect.
 *
 * Takes plain image URIs and optional labels only — nothing here knows
 * about progress photos, clients, or angles, so it's just as usable
 * anywhere else two images need a visual compare (e.g. the coach's
 * Clients view).
 */
export function PhotoCompareSlider({ beforeUri, afterUri, beforeLabel, afterLabel }: PhotoCompareSliderProps) {
  const containerWidth = useSharedValue(0);
  const hasInitializedDivider = useSharedValue(false);
  const dividerX = useSharedValue(0);
  const dividerDragStartX = useSharedValue(0);

  const beforeScale = useSharedValue(1);
  const beforeScaleBase = useSharedValue(1);
  const afterScale = useSharedValue(1);
  const afterScaleBase = useSharedValue(1);

  const handleLayout = useCallback(
    (event: LayoutChangeEvent) => {
      const width = event.nativeEvent.layout.width;
      containerWidth.value = width;
      // Only ever set the *initial* divider position — a later relayout
      // (e.g. a web window resize) shouldn't snap a already-dragged
      // divider back to the middle.
      if (!hasInitializedDivider.value) {
        dividerX.value = width / 2;
        hasInitializedDivider.value = true;
      }
    },
    [containerWidth, dividerX, hasInitializedDivider]
  );

  const dividerPan = Gesture.Pan()
    .activeOffsetX([-5, 5])
    .failOffsetY([-15, 15])
    .onStart(() => {
      dividerDragStartX.value = dividerX.value;
    })
    .onUpdate((event) => {
      const next = dividerDragStartX.value + event.translationX;
      dividerX.value = Math.min(containerWidth.value, Math.max(0, next));
    });

  const beforePinch = Gesture.Pinch()
    .onUpdate((event) => {
      beforeScale.value = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, beforeScaleBase.value * event.scale));
    })
    .onEnd(() => {
      beforeScaleBase.value = beforeScale.value;
    });

  const afterPinch = Gesture.Pinch()
    .onUpdate((event) => {
      afterScale.value = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, afterScaleBase.value * event.scale));
    })
    .onEnd(() => {
      afterScaleBase.value = afterScale.value;
    });

  const clipStyle = useAnimatedStyle(() => ({ width: dividerX.value }));
  const dividerLineStyle = useAnimatedStyle(() => ({ left: dividerX.value - 1 }));
  const handleStyle = useAnimatedStyle(() => ({ left: dividerX.value - 22 }));
  const beforeImageStyle = useAnimatedStyle(() => ({
    width: containerWidth.value,
    transform: [{ scale: beforeScale.value }],
  }));
  const afterImageStyle = useAnimatedStyle(() => ({
    transform: [{ scale: afterScale.value }],
  }));

  return (
    <View style={styles.container} onLayout={handleLayout}>
      <GestureDetector gesture={afterPinch}>
        <AnimatedImage
          source={{ uri: afterUri }}
          style={[StyleSheet.absoluteFill, afterImageStyle]}
          contentFit="cover"
        />
      </GestureDetector>

      <Animated.View style={[styles.beforeClip, clipStyle]}>
        <GestureDetector gesture={beforePinch}>
          <AnimatedImage
            source={{ uri: beforeUri }}
            style={[styles.beforeImage, beforeImageStyle]}
            contentFit="cover"
          />
        </GestureDetector>
      </Animated.View>

      {afterLabel && (
        <View style={[styles.labelBadge, styles.labelRight]}>
          <ThemedText type="small" style={styles.labelText}>
            {afterLabel}
          </ThemedText>
        </View>
      )}
      {beforeLabel && (
        <View style={[styles.labelBadge, styles.labelLeft]}>
          <ThemedText type="small" style={styles.labelText}>
            {beforeLabel}
          </ThemedText>
        </View>
      )}

      <Animated.View style={[styles.divider, dividerLineStyle]} pointerEvents="none" />

      <GestureDetector gesture={dividerPan}>
        <Animated.View style={[styles.handle, handleStyle]}>
          <View style={styles.handleBar} />
        </Animated.View>
      </GestureDetector>

      <ThemedText type="small" themeColor="textSecondary" style={styles.pinchHint}>
        Pinch either photo to resize it
      </ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
    aspectRatio: 3 / 4,
    borderRadius: Spacing.two,
    overflow: 'hidden',
    backgroundColor: Colors.backgroundElement,
  },
  beforeClip: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    overflow: 'hidden',
  },
  beforeImage: {
    height: '100%',
  },
  divider: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: 2,
    backgroundColor: Colors.text,
  },
  handle: {
    position: 'absolute',
    top: '50%',
    marginTop: -22,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: Accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  handleBar: {
    width: 4,
    height: 20,
    borderRadius: 2,
    backgroundColor: Colors.text,
  },
  labelBadge: {
    position: 'absolute',
    top: Spacing.two,
    backgroundColor: 'rgba(0,0,0,0.55)',
    borderRadius: 999,
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.half,
  },
  labelLeft: {
    left: Spacing.two,
  },
  labelRight: {
    right: Spacing.two,
  },
  labelText: {
    color: Colors.text,
  },
  pinchHint: {
    position: 'absolute',
    bottom: Spacing.two,
    alignSelf: 'center',
    backgroundColor: 'rgba(0,0,0,0.55)',
    borderRadius: 999,
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.half,
  },
});
