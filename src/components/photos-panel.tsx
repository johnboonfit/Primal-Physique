import { useFocusEffect } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { Image } from 'expo-image';
import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';

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

/** Front/side/back progress photo logging, gallery, and a swipe/slide
 * compare tool between any two photos of the same angle. One angle is
 * selected at a time — it drives what you're uploading as, what the
 * gallery shows, and which photos the compare tool can pick from. */
export function PhotosPanel() {
  const { session } = useAuth();

  const [photos, setPhotos] = useState<ProgressPhoto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [selectedAngle, setSelectedAngle] = useState<PhotoAngle>('front');
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const [compareA, setCompareA] = useState<ProgressPhoto | null>(null);
  const [compareB, setCompareB] = useState<ProgressPhoto | null>(null);

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
    setCompareA(null);
    setCompareB(null);
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

      {loading && <ActivityIndicator style={styles.loader} />}
      {!loading && error && <ThemedText style={styles.error}>{error}</ThemedText>}
      {!loading && !error && photosForAngle.length === 0 && (
        <ThemedText themeColor="textSecondary">No {angleLabel(selectedAngle).toLowerCase()} photos yet.</ThemedText>
      )}

      {!loading && !error && photosForAngle.length > 0 && (
        <View style={styles.gallery}>
          {photosForAngle.map((photo) => (
            <View key={photo.id} style={styles.galleryItem}>
              <Image source={{ uri: photo.url }} style={styles.galleryImage} contentFit="cover" />
              <ThemedText type="small" themeColor="textSecondary" style={styles.galleryDate}>
                {photo.logDate}
              </ThemedText>
            </View>
          ))}
        </View>
      )}

      {photosForAngle.length >= 2 && (
        <>
          <ThemedText type="smallBold" style={styles.sectionLabel2}>
            Compare {angleLabel(selectedAngle).toLowerCase()} photos
          </ThemedText>

          <ThemedText type="small" themeColor="textSecondary">
            Before
          </ThemedText>
          <PhotoThumbnailPicker photos={photosForAngle} selected={compareA} onSelect={setCompareA} />

          <ThemedText type="small" themeColor="textSecondary" style={styles.fieldLabel}>
            After
          </ThemedText>
          <PhotoThumbnailPicker photos={photosForAngle} selected={compareB} onSelect={setCompareB} />

          {compareA && compareB && (
            <View style={styles.compareWrap}>
              <PhotoCompareSlider
                beforeUri={compareA.url}
                afterUri={compareB.url}
                beforeLabel={compareA.logDate}
                afterLabel={compareB.logDate}
              />
            </View>
          )}
        </>
      )}
    </>
  );
}

function PhotoThumbnailPicker({
  photos,
  selected,
  onSelect,
}: {
  photos: ProgressPhoto[];
  selected: ProgressPhoto | null;
  onSelect: (photo: ProgressPhoto) => void;
}) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.thumbRow}>
      {photos.map((photo) => (
        <Pressable key={photo.id} onPress={() => onSelect(photo)} style={styles.thumbWrap}>
          <Image
            source={{ uri: photo.url }}
            style={[styles.thumbImage, selected?.id === photo.id && styles.thumbImageSelected]}
            contentFit="cover"
          />
          <ThemedText type="small" themeColor="textSecondary">
            {photo.logDate}
          </ThemedText>
        </Pressable>
      ))}
    </ScrollView>
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
  fieldLabel: {
    marginTop: Spacing.two,
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
    backgroundColor: Colors.backgroundElement,
  },
  galleryDate: {
    textAlign: 'center',
  },
  thumbRow: {
    marginBottom: Spacing.one,
  },
  thumbWrap: {
    alignItems: 'center',
    marginRight: Spacing.two,
    gap: Spacing.half,
  },
  thumbImage: {
    width: 64,
    height: 85,
    borderRadius: Spacing.one,
    borderWidth: 2,
    borderColor: 'transparent',
    backgroundColor: Colors.backgroundElement,
  },
  thumbImageSelected: {
    borderColor: Accent,
  },
  compareWrap: {
    marginTop: Spacing.two,
  },
});
