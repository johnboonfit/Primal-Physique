import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { VideoPlayback } from '@/components/video-playback';
import { Accent, Colors, Glow, Spacing } from '@/constants/theme';
import { getCoachFormCheckSubmission, respondToFormCheck, type CoachFormCheckSubmission } from '@/lib/form-check';
import { pickVideoFromLibrary, recordVideo, type PickedVideo } from '@/lib/video-picker';

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

/** Coach-only review screen: watch the client's video, then respond
 * with written feedback and, optionally, a follow-up video of their
 * own demonstrating a correction. Once responded, this becomes a
 * read-only view of what was sent -- there's no re-editing a response
 * in this chunk, same as a check-in's answers don't get edited after
 * the fact. */
export default function CoachFormCheckDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();

  const [submission, setSubmission] = useState<CoachFormCheckSubmission | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [feedbackText, setFeedbackText] = useState('');
  const [pickedVideo, setPickedVideo] = useState<PickedVideo | null>(null);
  const [picking, setPicking] = useState(false);
  const [saving, setSaving] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    getCoachFormCheckSubmission(id)
      .then(setSubmission)
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load that submission.'))
      .finally(() => setLoading(false));
  }, [id]);

  const handlePick = async (source: 'camera' | 'library') => {
    setActionError(null);
    setPicking(true);
    try {
      const video = source === 'camera' ? await recordVideo() : await pickVideoFromLibrary();
      if (video) setPickedVideo(video);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to get that video.');
    } finally {
      setPicking(false);
    }
  };

  const canSubmit = !saving && feedbackText.trim().length > 0;

  const handleSubmit = async () => {
    if (!submission || !canSubmit) return;
    setSaving(true);
    setActionError(null);
    try {
      await respondToFormCheck({
        submissionId: submission.id,
        clientId: submission.clientId,
        feedbackText,
        video: pickedVideo,
      });
      router.back();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to send that feedback.');
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <ThemedView style={styles.container}>
        <SafeAreaView style={styles.safeArea}>
          <ActivityIndicator style={styles.loader} />
        </SafeAreaView>
      </ThemedView>
    );
  }

  if (error || !submission) {
    return (
      <ThemedView style={styles.container}>
        <SafeAreaView style={styles.safeArea}>
          <ThemedText style={styles.error}>{error ?? 'That submission could not be found.'}</ThemedText>
        </SafeAreaView>
      </ThemedView>
    );
  }

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <Pressable style={styles.backLink} hitSlop={8} onPress={() => router.back()}>
          <ThemedText type="linkPrimary">‹ Back</ThemedText>
        </Pressable>

        <ScrollView contentContainerStyle={styles.scrollContent}>
          <ThemedText type="title" style={styles.title}>
            {submission.exerciseName}
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            {submission.clientName} · {formatDate(submission.createdAt)}
          </ThemedText>

          <VideoPlayback uri={submission.videoUrl} />

          {submission.clientNote && (
            <ThemedView type="backgroundElement" style={styles.noteCard}>
              <ThemedText type="smallBold">Client's Note</ThemedText>
              <ThemedText type="small">{submission.clientNote}</ThemedText>
            </ThemedView>
          )}

          {submission.status === 'reviewed' ? (
            <ThemedView type="backgroundElement" style={styles.noteCard}>
              <ThemedText type="smallBold">Your Feedback</ThemedText>
              <ThemedText type="small">{submission.feedbackText}</ThemedText>
              {submission.feedbackVideoUrl && <VideoPlayback uri={submission.feedbackVideoUrl} />}
            </ThemedView>
          ) : (
            <ThemedView type="backgroundElement" style={styles.formCard}>
              <ThemedText type="smallBold" style={styles.fieldLabel}>
                Your Feedback
              </ThemedText>
              <TextInput
                value={feedbackText}
                onChangeText={setFeedbackText}
                placeholder="What do you want them to work on?"
                placeholderTextColor={Colors.textSecondary}
                multiline
                style={[styles.input, { color: Colors.text, borderColor: Colors.backgroundSelected }]}
              />

              <ThemedText type="smallBold" style={styles.fieldLabel}>
                Follow-up video (optional)
              </ThemedText>
              <View style={styles.pickRow}>
                <Pressable style={styles.pickButton} onPress={() => handlePick('camera')} disabled={picking}>
                  <ThemedText type="smallBold" style={styles.pickButtonText}>
                    🎥 Record
                  </ThemedText>
                </Pressable>
                <Pressable style={styles.pickButton} onPress={() => handlePick('library')} disabled={picking}>
                  <ThemedText type="smallBold" style={styles.pickButtonText}>
                    📁 Choose from Library
                  </ThemedText>
                </Pressable>
              </View>
              {picking && <ActivityIndicator style={styles.loader} />}
              {pickedVideo && !picking && (
                <ThemedText type="small" themeColor="textSecondary">
                  ✓ Follow-up video ready to send
                </ThemedText>
              )}

              {actionError && <ThemedText style={styles.error}>{actionError}</ThemedText>}

              <Pressable
                style={[styles.submitButton, !canSubmit && styles.submitButtonDisabled]}
                onPress={handleSubmit}
                disabled={!canSubmit}>
                {saving ? (
                  <ActivityIndicator size="small" color={Colors.text} />
                ) : (
                  <ThemedText type="smallBold" style={{ color: Colors.text }}>
                    Send Feedback
                  </ThemedText>
                )}
              </Pressable>
            </ThemedView>
          )}
        </ScrollView>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  safeArea: { flex: 1, paddingHorizontal: Spacing.four, paddingTop: Spacing.two },
  backLink: {
    marginBottom: Spacing.two,
    alignSelf: 'flex-start',
  },
  loader: {
    marginTop: Spacing.five,
  },
  error: {
    color: Accent,
    marginTop: Spacing.two,
  },
  scrollContent: {
    gap: Spacing.three,
    paddingBottom: Spacing.six,
  },
  title: {
    marginBottom: -Spacing.one,
  },
  noteCard: {
    borderRadius: Spacing.two,
    padding: Spacing.three,
    gap: Spacing.two,
  },
  formCard: {
    borderRadius: Spacing.two,
    padding: Spacing.three,
    gap: Spacing.two,
  },
  fieldLabel: {
    marginTop: Spacing.one,
  },
  input: {
    borderWidth: 1,
    borderRadius: Spacing.two,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    fontSize: 16,
    minHeight: 80,
    textAlignVertical: 'top',
  },
  pickRow: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  pickButton: {
    flex: 1,
    borderWidth: 1,
    borderColor: Colors.backgroundSelected,
    borderRadius: Spacing.two,
    paddingVertical: Spacing.three,
    alignItems: 'center',
  },
  pickButtonText: {
    color: Colors.tealBright,
  },
  submitButton: {
    ...Glow.oxblood,
    backgroundColor: Accent,
    borderRadius: Spacing.two,
    paddingVertical: Spacing.three,
    alignItems: 'center',
  },
  submitButtonDisabled: {
    opacity: 0.5,
  },
});
