import { useFocusEffect } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { Image } from 'expo-image';
import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';

import { PhotoCompareSlider } from '@/components/photo-compare-slider';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Accent, Colors, Glow, Spacing } from '@/constants/theme';
import { useAuth } from '@/context/auth-context';
import {
  listProgressPhotos,
  PHOTO_ANGLES,
  uploadProgressPhoto,
  type PhotoAngle,
  type ProgressPhoto,
} from '@/lib/progress-photos';

function todayISODate() {
  return new Date().toISOString().slice(0, 10);
}

function angleLabel(angle: PhotoAngle) {
  return PHOTO_ANGLES.find((a) => a.key === angle)?.label ?? angle;
}

const PICKER_OPTIONS: ImagePicker.ImagePickerOptions = {
  mediaTypes: 'images',
  base64: true,
  quality: 0.7,
  allowsEditing: true,
  aspect: [3, 4],
};

/** Front/side/back progress photo logging, and a gallery that doubles
 * as the compare tool -- tap any two photos of the same angle right in
 * the grid to swipe/slide-compare them, rather than a second, separate
 * before/after picker duplicating the same gallery underneath. One
 * angle is selected at a time -- it drives what you're uploading as,
 * what the gallery shows, and which two photos can be compared. */
export function PhotosPanel() {
  const { session } = useAuth();

  const [photos, setPhotos] = useState<ProgressPhoto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [selectedAngle, setSelectedAngle] = useState<PhotoAngle>('front');
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  // Up to 2 photos picked straight from the gallery below -- ordered by
  // logDate (earlier = before, later = after) when rendering the
  // slider, not by which one was tapped first, so comparing them in
  // either order always reads correctly.
  const [compareSelection, setCompareSelection] = useState<ProgressPhoto[]>([]);

  const load = useCallback(() => {
    if (!session) return;
    setLoading(true);
    listProgressPhotos(session.user.id)
      .then(setPhotos)
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load your progress photos.'))
      .finally(() => setLoading(false));
  }, [session]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const photosForAngle = useMemo(
    () => photos.filter((photo) => photo.angle === selectedAngle),
    [photos, selectedAngle]
  );

  const handleSelectAngle = (angle: PhotoAngle) => {
    setSelectedAngle(angle);
    setUploadError(null);
    setCompareSelection([]);
  };

  /** Tapping a photo already in the selection deselects it. Tapping a
   * new one while fewer than 2 are selected adds it. Tapping a new one
   * with 2 already selected starts a fresh selection with just that
   * photo, rather than leaving it ambiguous which of the two gets
   * bumped. */
  const handleTogglePhoto = (photo: ProgressPhoto) => {
    setCompareSelection((current) => {
      if (current.some((p) => p.id === photo.id)) return current.filter((p) => p.id !== photo.id);
      if (current.length < 2) return [...current, photo];
      return [photo];
    });
  };

  const handlePick = async (source: 'camera' | 'library') => {
    if (!session) return;
    setUploadError(null);

    let permission;
    if (source === 'camera') {
      permission = await ImagePicker.requestCameraPermissionsAsync();
    } else {
      permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    }
    if (!permission.granted) {
      setUploadError(
        source === 'camera'
          ? 'Camera access is needed to take a photo.'
          : 'Photo library access is needed to choose a photo.'
      );
      return;
    }

    const result =
      source === 'camera'
        ? await ImagePicker.launchCameraAsync(PICKER_OPTIONS)
        : await ImagePicker.launchImageLibraryAsync(PICKER_OPTIONS);

    if (result.canceled || !result.assets?.[0]?.base64) return;

    setUploading(true);
    try {
      await uploadProgressPhoto(session.user.id, todayISODate(), selectedAngle, result.assets[0].base64);
      load();
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'Something went wrong uploading that photo.');
    } finally {
      setUploading(false);
    }
  };

  // Earlier photo first regardless of tap order, so the slider always
  // reads left-to-right as a real before/after, not whichever was
  // tapped first.
  const [before, after] =
    compareSelection.length === 2
      ? [...compareSelection].sort((a, b) => (a.logDate < b.logDate ? -1 : 1))
      : [null, null];

  return (
    <>
      <ThemedText type="smallBold" style={styles.sectionLabel}>
        Angle
      </ThemedText>

      <View style={styles.angleRow}>
        {PHOTO_ANGLES.map((angle) => (
          <Pressable key={angle.key} onPress={() => handleSelectAngle(angle.key)} style={styles.angleChipWrap}>
            <View style={[styles.angleChip, selectedAngle === angle.key && styles.angleChipActive]}>
              <ThemedText
                type="small"
                style={selectedAngle === angle.key ? styles.angleChipActiveText : styles.angleChipText}>
                {angle.label}
              </ThemedText>
            </View>
          </Pressable>
        ))}
      </View>

      <ThemedText type="smallBold" style={styles.sectionLabel2}>
        Add a {angleLabel(selectedAngle).toLowerCase()} photo
      </ThemedText>

      <View style={styles.uploadRow}>
        <Pressable
          style={({ pressed }) => [styles.uploadButton, pressed && styles.pressed]}
          onPress={() => handlePick('camera')}
          disabled={uploading}>
          <ThemedText type="smallBold" style={styles.uploadButtonText}>
            Take Photo
          </ThemedText>
        </Pressable>
        <Pressable
          style={({ pressed }) => [styles.uploadButton, styles.uploadButtonSecondary, pressed && styles.pressed]}
          onPress={() => handlePick('library')}
          disabled={uploading}>
          <ThemedText type="smallBold" style={styles.uploadButtonSecondaryText}>
            Choose from Library
          </ThemedText>
        </Pressable>
      </View>

      {uploading && <ActivityIndicator style={styles.loader} />}
      {uploadError && <ThemedText style={styles.error}>{uploadError}</ThemedText>}

      <ThemedText type="smallBold" style={styles.sectionLabel2}>
        {angleLabel(selectedAngle)} gallery
      </ThemedText>
      {photosForAngle.length >= 2 && (
        <ThemedText type="small" themeColor="textSecondary">
          {compareSelection.length === 0
            ? 'Tap two photos to compare them.'
            : compareSelection.length === 1
              ? 'Tap another photo to compare it with.'
              : 'Comparing the two selected photos below.'}
        </ThemedText>
      )}

      {loading && <ActivityIndicator style={styles.loader} />}
      {!loading && error && <ThemedText style={styles.error}>{error}</ThemedText>}
      {!loading && !error && photosForAngle.length === 0 && (
        <ThemedText themeColor="textSecondary">No {angleLabel(selectedAngle).toLowerCase()} photos yet.</ThemedText>
      )}

      {!loading && !error && photosForAngle.length > 0 && (
        <View style={styles.gallery}>
          {photosForAngle.map((photo) => {
            const isSelected = compareSelection.some((p) => p.id === photo.id);
            return (
              <Pressable key={photo.id} onPress={() => handleTogglePhoto(photo)} style={styles.galleryItem}>
                <Image
                  source={{ uri: photo.url }}
                  style={[styles.galleryImage, isSelected && styles.galleryImageSelected]}
                  contentFit="cover"
                />
                <ThemedText type="small" themeColor="textSecondary" style={styles.galleryDate}>
                  {photo.logDate}
                </ThemedText>
              </Pressable>
            );
          })}
        </View>
      )}

      {before && after && (
        <View style={styles.compareWrap}>
          <PhotoCompareSlider
            beforeUri={before.url}
            afterUri={after.url}
            beforeLabel={before.logDate}
            afterLabel={after.logDate}
          />
        </View>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  sectionLabel: {
    marginBottom: Spacing.half,
  },
  sectionLabel2: {
    marginTop: Spacing.three,
    marginBottom: Spacing.half,
  },
  angleRow: {
    flexDirection: 'row',
    gap: Spacing.one,
  },
  angleChipWrap: {
    flex: 1,
  },
  angleChip: {
    borderRadius: 999,
    paddingVertical: Spacing.one,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.backgroundElement,
  },
  angleChipActive: {
    backgroundColor: Accent,
  },
  angleChipText: {
    color: Colors.textSecondary,
  },
  angleChipActiveText: {
    color: Colors.text,
  },
  uploadRow: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  uploadButton: {
    ...Glow.oxblood,
    flex: 1,
    backgroundColor: Accent,
    borderRadius: Spacing.two,
    paddingVertical: Spacing.three,
    alignItems: 'center',
    justifyContent: 'center',
  },
  uploadButtonSecondary: {
    backgroundColor: Colors.backgroundElement,
    shadowOpacity: 0,
    elevation: 0,
  },
  pressed: {
    opacity: 0.85,
  },
  uploadButtonText: {
    color: Colors.text,
  },
  uploadButtonSecondaryText: {
    color: Colors.text,
  },
  loader: {
    marginTop: Spacing.two,
  },
  error: {
    color: Accent,
    textAlign: 'center',
  },
  gallery: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  galleryItem: {
    width: '31%',
    gap: Spacing.half,
  },
  galleryImage: {
    width: '100%',
    aspectRatio: 3 / 4,
    borderRadius: Spacing.two,
    borderWidth: 2,
    borderColor: 'transparent',
    backgroundColor: Colors.backgroundElement,
  },
  galleryImageSelected: {
    borderColor: Accent,
  },
  galleryDate: {
    textAlign: 'center',
  },
  compareWrap: {
    marginTop: Spacing.three,
  },
});
