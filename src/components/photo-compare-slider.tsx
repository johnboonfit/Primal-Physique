import { Image } from 'expo-image';
import { useMemo, useRef, useState } from 'react';
import { PanResponder, StyleSheet, View, type LayoutChangeEvent } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Accent, Colors, Spacing } from '@/constants/theme';

export type PhotoCompareSliderProps = {
  beforeUri: string;
  afterUri: string;
  beforeLabel?: string;
  afterLabel?: string;
};

/**
 * A generic before/after image slider: two images stacked, a draggable
 * vertical divider reveals more of one or the other as it moves. Takes
 * plain image URIs and optional labels only — nothing here knows about
 * progress photos, clients, or angles, so it's just as usable anywhere
 * else two images need a visual compare (e.g. the coach's Clients view).
 */
export function PhotoCompareSlider({ beforeUri, afterUri, beforeLabel, afterLabel }: PhotoCompareSliderProps) {
  const [containerWidth, setContainerWidth] = useState(0);
  const [sliderX, setSliderX] = useState<number | null>(null);

  const containerWidthRef = useRef(0);
  const sliderXRef = useRef(0);
  const dragStartXRef = useRef(0);

  const handleLayout = (event: LayoutChangeEvent) => {
    const width = event.nativeEvent.layout.width;
    containerWidthRef.current = width;
    setContainerWidth(width);
    if (sliderX === null) {
      const initial = width / 2;
      sliderXRef.current = initial;
      setSliderX(initial);
    }
  };

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderGrant: () => {
          dragStartXRef.current = sliderXRef.current;
        },
        onPanResponderMove: (_event, gestureState) => {
          const next = Math.min(
            containerWidthRef.current,
            Math.max(0, dragStartXRef.current + gestureState.dx)
          );
          sliderXRef.current = next;
          setSliderX(next);
        },
      }),
    []
  );

  const resolvedSliderX = sliderX ?? containerWidth / 2;

  return (
    <View style={styles.container} onLayout={handleLayout}>
      <Image source={{ uri: afterUri }} style={StyleSheet.absoluteFill} contentFit="cover" />

      {containerWidth > 0 && (
        <View style={[styles.beforeClip, { width: resolvedSliderX }]}>
          <Image source={{ uri: beforeUri }} style={[styles.beforeImage, { width: containerWidth }]} contentFit="cover" />
        </View>
      )}

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

      {containerWidth > 0 && (
        <View style={[styles.divider, { left: resolvedSliderX - 1 }]} pointerEvents="none" />
      )}

      {containerWidth > 0 && (
        <View style={[styles.handle, { left: resolvedSliderX - 22 }]} {...panResponder.panHandlers}>
          <View style={styles.handleBar} />
        </View>
      )}
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
});
