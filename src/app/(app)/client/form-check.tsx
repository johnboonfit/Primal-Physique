import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { FeatureLockedCard } from '@/components/feature-locked-card';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { VideoPlayback } from '@/components/video-playback';
import { Accent, Colors, Glow, Spacing } from '@/constants/theme';
import { useAuth } from '@/context/auth-context';
import { isFeatureEnabled } from '@/lib/feature-toggles';
import { listMyFormCheckSubmissions, submitFormCheck, type ClientFormCheckSubmission } from '@/lib/form-check';
import { pickVideoFromLibrary, recordVideo, type PickedVideo } from '@/lib/video-picker';

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

/**
 * Client-side Form Check: record or upload a short video of an
 * exercise, submit it with a note, then see the coach's response once
 * it lands. Gated by the same isFeatureEnabled('form_check') check
 * every other per-client-toggle-gated screen already uses (Chat,
 * Community, Leaderboards) -- a client this is off for sees the
 * standard locked-card upsell instead of the record/upload form.
 */
export default function ClientFormCheckScreen() {
  const { session } = useAuth();

  const [featureEnabled, setFeatureEnabled] = useState(true);
  const [checkingAccess, setCheckingAccess] = useState(true);

  const [submissions, setSubmissions] = useState<ClientFormCheckSubmission[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const [exerciseName, setExerciseName] = useState('');
  const [clientNote, setClientNote] = useState('');
  const [pickedVideo, setPickedVideo] = useState<PickedVideo | null>(null);
  const [picking, setPicking] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const load = useCallback(() => {
    if (!session) return;
    setLoading(true);
    setError(null);
    listMyFormCheckSubmissions(session.user.id)
      .then(setSubmissions)
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load your Form Check submissions.'))
      .finally(() => setLoading(false));
  }, [session]);

  useFocusEffect(
    useCallback(() => {
      if (!session) return;
      setCheckingAccess(true);
      isFeatureEnabled(session.user.id, 'form_check')
        .then(setFeatureEnabled)
        .catch(() => setFeatureEnabled(true))
        .finally(() => setCheckingAccess(false));
      load();
    }, [session, load])
  );

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

  const canSubmit = !submitting && exerciseName.trim().length > 0 && pickedVideo !== null;

  const handleSubmit = async () => {
    if (!session || !pickedVideo || !canSubmit) return;
    setSubmitting(true);
    setActionError(null);
    try {
      await submitFormCheck({
        clientId: session.user.id,
        exerciseName: exerciseName.trim(),
        clientNote,
        base64: pickedVideo.base64,
        fileExtension: pickedVideo.fileExtension,
        mimeType: pickedVideo.mimeType,
      });
      setExerciseName('');
      setClientNote('');
      setPickedVideo(null);
      load();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to submit that video.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <Pressable style={styles.backLink} hitSlop={8} onPress={() => router.replace('/client')}>
          <ThemedText type="linkPrimary">‹ Back</ThemedText>
        </Pressable>

        <ThemedText type="title" style={styles.title}>
          Form Check
        </ThemedText>

        {checkingAccess ? (
          <ActivityIndicator style={styles.loader} />
        ) : !featureEnabled ? (
          <FeatureLockedCard title="Form Check" message="Your coach has turned off Form Check access for your account." />
        ) : (
          <ScrollView contentContainerStyle={styles.scrollContent}>
            <ThemedView type="backgroundElement" style={styles.submitCard}>
              <ThemedText type="smallBold" style={styles.fieldLabel}>
                Exercise
              </ThemedText>
              <TextInput
                value={exerciseName}
                onChangeText={setExerciseName}
                placeholder="e.g. Barbell Back Squat"
                placeholderTextColor={Colors.textSecondary}
                style={[styles.input, { color: Colors.text, borderColor: Colors.backgroundSelected }]}
              />

              <ThemedText type="smallBold" style={styles.fieldLabel}>
                Note (optional)
              </ThemedText>
              <TextInput
                value={clientNote}
                onChangeText={setClientNote}
                placeholder="Anything feel off? What should your coach look at?"
                placeholderTextColor={Colors.textSecondary}
                multiline
                style={[styles.input, styles.noteInput, { color: Colors.text, borderColor: Colors.backgroundSelected }]}
              />

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
                  ✓ Video ready to submit
                </ThemedText>
              )}
              {actionError && <ThemedText style={styles.error}>{actionError}</ThemedText>}

              <Pressable
                style={[styles.submitButton, !canSubmit && styles.submitButtonDisabled]}
                onPress={handleSubmit}
                disabled={!canSubmit}>
                {submitting ? (
                  <ActivityIndicator size="small" color={Colors.text} />
                ) : (
                  <ThemedText type="smallBold" style={{ color: Colors.text }}>
                    Submit
                  </ThemedText>
                )}
              </Pressable>
            </ThemedView>

            <ThemedText type="smallBold" style={styles.sectionLabel}>
              Your Submissions
            </ThemedText>

            {loading && <ActivityIndicator style={styles.loader} />}
            {!loading && error && <ThemedText style={styles.error}>{error}</ThemedText>}
            {!loading && !error && submissions.length === 0 && (
              <ThemedText themeColor="textSecondary" style={styles.empty}>
                Nothing submitted yet.
              </ThemedText>
            )}

            {!loading &&
              !error &&
              submissions.map((submission) => {
                const expanded = expandedId === submission.id;
                return (
                  <Pressable
                    key={submission.id}
                    onPress={() => setExpandedId(expanded ? null : submission.id)}>
                    <ThemedView type="backgroundElement" style={styles.submissionCard}>
                      <View style={styles.submissionHeaderRow}>
                        <ThemedText type="smallBold" style={styles.exerciseNameText}>
                          {submission.exerciseName}
                        </ThemedText>
                        <ThemedText
                          type="small"
                          style={submission.status === 'reviewed' ? styles.reviewedBadge : styles.pendingBadge}>
                          {submission.status === 'reviewed' ? 'Reviewed' : 'Pending'}
                        </ThemedText>
                      </View>
                      <ThemedText type="small" themeColor="textSecondary">
                        {formatDate(submission.createdAt)}
                      </ThemedText>

                      {expanded && (
                        <View style={styles.expandedContent}>
                          <VideoPlayback uri={submission.videoUrl} />
                          {submission.clientNote && (
                            <ThemedText type="small" themeColor="textSecondary">
                              Your note: {submission.clientNote}
                            </ThemedText>
                          )}
                          {submission.status === 'reviewed' && (
                            <View style={styles.feedbackBlock}>
                              <ThemedText type="smallBold">Coach's Feedback</ThemedText>
                              <ThemedText type="small">{submission.feedbackText}</ThemedText>
                              {submission.feedbackVideoUrl && <VideoPlayback uri={submission.feedbackVideoUrl} />}
                            </View>
                          )}
                        </View>
                      )}
                    </ThemedView>
                  </Pressable>
                );
              })}
          </ScrollView>
        )}
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
  title: {
    marginBottom: Spacing.three,
  },
  loader: {
    marginTop: Spacing.four,
  },
  scrollContent: {
    paddingBottom: Spacing.six,
    gap: Spacing.two,
  },
  submitCard: {
    borderRadius: Spacing.two,
    padding: Spacing.three,
    gap: Spacing.two,
    marginBottom: Spacing.two,
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
  },
  noteInput: {
    minHeight: 60,
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
  error: {
    color: Accent,
  },
  sectionLabel: {
    marginTop: Spacing.two,
  },
  empty: {
    textAlign: 'center',
    marginTop: Spacing.four,
  },
  submissionCard: {
    borderRadius: Spacing.two,
    padding: Spacing.three,
    gap: Spacing.half,
  },
  submissionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  exerciseNameText: {
    flex: 1,
  },
  pendingBadge: {
    color: Colors.textSecondary,
  },
  reviewedBadge: {
    color: Colors.tealBright,
  },
  expandedContent: {
    marginTop: Spacing.two,
    gap: Spacing.two,
  },
  feedbackBlock: {
    marginTop: Spacing.two,
    gap: Spacing.one,
    paddingTop: Spacing.two,
    borderTopWidth: 1,
    borderTopColor: Colors.backgroundSelected,
  },
});
