import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Accent, Colors, Glow, Spacing } from '@/constants/theme';
import { useAuth } from '@/context/auth-context';
import { useTheme } from '@/hooks/use-theme';
import { COMMUNITY_TAGS, createCommunityPost, type CommunityTag } from '@/lib/community';

const PICKER_OPTIONS: ImagePicker.ImagePickerOptions = {
  mediaTypes: 'images',
  base64: true,
  quality: 0.7,
  allowsEditing: true,
  aspect: [4, 3],
};

export default function NewCommunityPostScreen() {
  const theme = useTheme();
  const { session, profile } = useAuth();
  const isCoach = profile?.role === 'coach';

  // Clients never see Announcement as an option in the first place —
  // not just a disabled row. The real restriction still lives in
  // community_posts.sql's insert policy regardless of what this list
  // shows; this is only about not offering a choice that would fail.
  const availableTags = useMemo(() => COMMUNITY_TAGS.filter((tag) => !tag.coachOnly || isCoach), [isCoach]);

  const [tag, setTag] = useState<CommunityTag>(availableTags[0]?.key ?? 'win');
  const [body, setBody] = useState('');
  const [imageBase64, setImageBase64] = useState<string | null>(null);
  const [imagePreviewUri, setImagePreviewUri] = useState<string | null>(null);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handlePickImage = async (source: 'camera' | 'library') => {
    setError(null);

    const permission =
      source === 'camera'
        ? await ImagePicker.requestCameraPermissionsAsync()
        : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      setError(
        source === 'camera' ? 'Camera access is needed to take a photo.' : 'Photo library access is needed to choose a photo.'
      );
      return;
    }

    const result =
      source === 'camera'
        ? await ImagePicker.launchCameraAsync(PICKER_OPTIONS)
        : await ImagePicker.launchImageLibraryAsync(PICKER_OPTIONS);

    if (result.canceled || !result.assets?.[0]?.base64) return;
    setImageBase64(result.assets[0].base64);
    setImagePreviewUri(result.assets[0].uri);
  };

  const handleSave = async () => {
    setError(null);
    if (!session) return;

    if (!body.trim()) {
      setError('Write something before posting.');
      return;
    }

    setSaving(true);
    try {
      await createCommunityPost({
        authorId: session.user.id,
        tag,
        body: body.trim(),
        imageBase64: imageBase64 ?? undefined,
      });
      router.replace('/community');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong posting that.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
          <ThemedText type="title" style={styles.title}>
            New post
          </ThemedText>

          <ThemedText type="smallBold" style={styles.sectionLabel}>
            Tag
          </ThemedText>
          <View style={styles.tagRow}>
            {availableTags.map((option) => {
              const selected = option.key === tag;
              return (
                <Pressable key={option.key} onPress={() => setTag(option.key)}>
                  <ThemedView type="backgroundElement" style={[styles.tagOption, selected && styles.tagOptionSelected]}>
                    <ThemedText type={selected ? 'smallBold' : 'default'}>
                      {option.emoji} {option.label}
                    </ThemedText>
                  </ThemedView>
                </Pressable>
              );
            })}
          </View>

          <ThemedText type="smallBold" style={styles.sectionLabel}>
            What's going on?
          </ThemedText>
          <TextInput
            value={body}
            onChangeText={setBody}
            placeholder="Share a win, a PR, a question..."
            placeholderTextColor={theme.textSecondary}
            multiline
            numberOfLines={4}
            style={[styles.bodyInput, { color: theme.text, borderColor: theme.backgroundSelected }]}
          />

          <ThemedText type="smallBold" style={styles.sectionLabel}>
            Photo (optional)
          </ThemedText>
          {imagePreviewUri ? (
            <View>
              <Image source={{ uri: imagePreviewUri }} style={styles.preview} contentFit="cover" />
              <Pressable
                onPress={() => {
                  setImageBase64(null);
                  setImagePreviewUri(null);
                }}>
                <ThemedText type="small" themeColor="textSecondary" style={styles.removeText}>
                  Remove photo
                </ThemedText>
              </Pressable>
            </View>
          ) : (
            <View style={styles.pickerRow}>
              <Pressable style={styles.pickerButton} onPress={() => handlePickImage('camera')}>
                <ThemedText type="smallBold">Take photo</ThemedText>
              </Pressable>
              <Pressable style={styles.pickerButton} onPress={() => handlePickImage('library')}>
                <ThemedText type="smallBold">Choose photo</ThemedText>
              </Pressable>
            </View>
          )}

          {error && <ThemedText style={styles.error}>{error}</ThemedText>}

          <Pressable
            style={({ pressed }) => [styles.primaryButton, pressed && styles.pressed]}
            onPress={handleSave}
            disabled={saving}>
            {saving ? (
              <ActivityIndicator color={Colors.text} />
            ) : (
              <ThemedText type="smallBold" style={styles.primaryButtonText}>
                Post
              </ThemedText>
            )}
          </Pressable>

          <Pressable style={styles.cancelButton} onPress={() => router.back()}>
            <ThemedText themeColor="textSecondary">Cancel</ThemedText>
          </Pressable>
        </ScrollView>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  safeArea: { flex: 1 },
  scrollContent: {
    padding: Spacing.four,
    gap: Spacing.two,
  },
  title: {
    marginBottom: Spacing.two,
  },
  sectionLabel: {
    marginTop: Spacing.three,
  },
  tagRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
    marginTop: Spacing.half,
  },
  tagOption: {
    borderWidth: 1,
    borderColor: 'transparent',
    borderRadius: 999,
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.three,
  },
  tagOptionSelected: {
    borderColor: Accent,
  },
  bodyInput: {
    borderWidth: 1,
    borderRadius: Spacing.two,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.three,
    fontSize: 16,
    minHeight: 100,
    textAlignVertical: 'top',
  },
  pickerRow: {
    flexDirection: 'row',
    gap: Spacing.two,
    marginTop: Spacing.half,
  },
  pickerButton: {
    flex: 1,
    borderWidth: 1,
    borderColor: Colors.backgroundSelected,
    borderRadius: Spacing.two,
    paddingVertical: Spacing.three,
    alignItems: 'center',
  },
  preview: {
    width: '100%',
    aspectRatio: 4 / 3,
    borderRadius: Spacing.two,
    marginTop: Spacing.half,
  },
  removeText: {
    textAlign: 'center',
    marginTop: Spacing.two,
  },
  error: {
    color: Accent,
    textAlign: 'center',
  },
  primaryButton: {
    ...Glow.oxblood,
    backgroundColor: Accent,
    borderRadius: Spacing.two,
    paddingVertical: Spacing.three,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: Spacing.three,
  },
  pressed: {
    opacity: 0.85,
  },
  primaryButtonText: {
    color: Colors.text,
  },
  cancelButton: {
    alignItems: 'center',
    paddingVertical: Spacing.two,
  },
});
