import {
  RecordingPresets,
  requestRecordingPermissionsAsync,
  useAudioPlayer,
  useAudioPlayerStatus,
  useAudioRecorder,
  useAudioRecorderState,
} from 'expo-audio';
import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Modal, Pressable, StyleSheet, TextInput, View } from 'react-native';

import { ConfirmDialog } from '@/components/confirm-dialog';
import { EmojiPicker } from '@/components/emoji-picker';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Accent, Colors, Glow, Spacing } from '@/constants/theme';
import { useAuth } from '@/context/auth-context';
import { useTheme } from '@/hooks/use-theme';
import {
  MAX_VOICE_MESSAGE_SECONDS,
  canDeleteForEveryone,
  deleteMessageForEveryone,
  deleteMessageForMe,
  editMessage,
  getLastSeen,
  isOnline,
  listMessages,
  sendTextMessage,
  sendVoiceMessage,
  subscribeToConversation,
  updateLastSeen,
  type ChatMessage,
} from '@/lib/chat';

function formatDuration(totalSeconds: number) {
  const clamped = Math.max(0, Math.round(totalSeconds));
  const minutes = Math.floor(clamped / 60);
  const seconds = clamped % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

function formatTimestamp(iso: string) {
  const date = new Date(iso);
  const now = new Date();
  const sameDay = date.toDateString() === now.toDateString();
  const time = date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  return sameDay ? time : `${date.toLocaleDateString([], { month: 'short', day: 'numeric' })} · ${time}`;
}

function VoiceBubbleContent({ url, durationSeconds }: { url: string; durationSeconds: number | null }) {
  const player = useAudioPlayer(url);
  const status = useAudioPlayerStatus(player);
  const total = status.duration || durationSeconds || 0;
  const progress = total > 0 ? Math.min(1, status.currentTime / total) : 0;

  return (
    <Pressable style={styles.voiceRow} onPress={() => (status.playing ? player.pause() : player.play())}>
      <ThemedText type="smallBold">{status.playing ? '⏸' : '▶️'}</ThemedText>
      <View style={styles.voiceTrack}>
        <View style={[styles.voiceFill, { width: `${progress * 100}%` }]} />
      </View>
      <ThemedText type="small" themeColor="textSecondary">
        {formatDuration(status.playing || status.currentTime > 0 ? status.currentTime : total)}
      </ThemedText>
    </Pressable>
  );
}

type ChatThreadProps = {
  conversationId: string;
  otherPartyId: string;
  otherPartyName: string;
};

/**
 * The shared conversation view — message list, composer, voice
 * recording, emoji picker, and edit/delete actions. Used identically
 * by the client's Chat tab (talking to "the coach") and the coach's
 * per-client thread screen; the only thing that differs between them
 * is which otherParty gets passed in.
 */
export function ChatThread({ conversationId, otherPartyId, otherPartyName }: ChatThreadProps) {
  const theme = useTheme();
  const { session } = useAuth();
  const currentUserId = session?.user.id ?? '';

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [otherOnline, setOtherOnline] = useState(false);

  const [composerText, setComposerText] = useState('');
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  const [emojiOpen, setEmojiOpen] = useState(false);
  const [actionsFor, setActionsFor] = useState<ChatMessage | null>(null);
  const [pendingDelete, setPendingDelete] = useState<{ message: ChatMessage; mode: 'me' | 'everyone' } | null>(null);
  const [deleting, setDeleting] = useState(false);

  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const recorderState = useAudioRecorderState(recorder, 200);
  const [recordingActive, setRecordingActive] = useState(false);
  const wasRecordingRef = useRef(false);
  const discardNextRef = useRef(false);

  const load = useCallback(() => {
    if (!currentUserId) return;
    listMessages(conversationId, currentUserId)
      .then(setMessages)
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load messages.'))
      .finally(() => setLoading(false));
  }, [conversationId, currentUserId]);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      load();
      const unsubscribe = subscribeToConversation(conversationId, load);
      return unsubscribe;
    }, [conversationId, load])
  );

  // Presence: write our own heartbeat, and poll the other party's,
  // both only while this screen is actually open — no background job.
  useFocusEffect(
    useCallback(() => {
      if (!currentUserId) return;

      const heartbeat = () => updateLastSeen(currentUserId).catch((err) => console.error('Failed to update presence:', err));
      const checkOther = () =>
        getLastSeen(otherPartyId)
          .then((lastSeen) => setOtherOnline(isOnline(lastSeen)))
          .catch((err) => console.error('Failed to check presence:', err));

      heartbeat();
      checkOther();
      const heartbeatInterval = setInterval(heartbeat, 45000);
      const checkInterval = setInterval(checkOther, 20000);

      return () => {
        clearInterval(heartbeatInterval);
        clearInterval(checkInterval);
      };
    }, [currentUserId, otherPartyId])
  );

  useEffect(() => {
    if (wasRecordingRef.current && !recorderState.isRecording && recordingActive) {
      setRecordingActive(false);
      const uri = recorder.uri;
      const durationSeconds = recorderState.durationMillis / 1000;
      if (!discardNextRef.current && uri && currentUserId) {
        setSending(true);
        sendVoiceMessage(conversationId, currentUserId, uri, durationSeconds)
          .then(load)
          .catch((err) => setError(err instanceof Error ? err.message : 'Failed to send voice message.'))
          .finally(() => setSending(false));
      }
      discardNextRef.current = false;
    }
    wasRecordingRef.current = recorderState.isRecording;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recorderState.isRecording]);

  const handleStartRecording = async () => {
    setError(null);
    const permission = await requestRecordingPermissionsAsync();
    if (!permission.granted) {
      setError('Microphone access is needed to record a voice message.');
      return;
    }
    await recorder.prepareToRecordAsync();
    discardNextRef.current = false;
    recorder.record({ forDuration: MAX_VOICE_MESSAGE_SECONDS });
    setRecordingActive(true);
  };

  const handleStopRecording = async () => {
    await recorder.stop();
  };

  const handleCancelRecording = async () => {
    discardNextRef.current = true;
    await recorder.stop();
  };

  const handleSend = async () => {
    if (!currentUserId) return;
    const text = composerText.trim();
    if (!text) return;

    setSending(true);
    setError(null);
    try {
      if (editingMessageId) {
        await editMessage(editingMessageId, text);
        setEditingMessageId(null);
      } else {
        await sendTextMessage(conversationId, currentUserId, text);
      }
      setComposerText('');
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send that.');
    } finally {
      setSending(false);
    }
  };

  const handleEdit = (message: ChatMessage) => {
    setEditingMessageId(message.id);
    setComposerText(message.body ?? '');
    setActionsFor(null);
  };

  const handleCancelEdit = () => {
    setEditingMessageId(null);
    setComposerText('');
  };

  const handleConfirmDelete = async () => {
    if (!pendingDelete || !currentUserId) return;
    setDeleting(true);
    try {
      if (pendingDelete.mode === 'everyone') {
        await deleteMessageForEveryone(pendingDelete.message.id);
      } else {
        await deleteMessageForMe(pendingDelete.message.id, currentUserId);
      }
      setPendingDelete(null);
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete that message.');
    } finally {
      setDeleting(false);
    }
  };

  const remainingSeconds = MAX_VOICE_MESSAGE_SECONDS - recorderState.durationMillis / 1000;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <ThemedText type="smallBold">{otherPartyName}</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          {otherOnline ? '🟢 Online' : 'Offline'}
        </ThemedText>
      </View>

      {loading && <ActivityIndicator style={styles.loader} />}

      {!loading && error && <ThemedText style={styles.error}>{error}</ThemedText>}

      {!loading && !error && messages.length === 0 && (
        <ThemedText themeColor="textSecondary" style={styles.empty}>
          No messages yet — say hello.
        </ThemedText>
      )}

      {!loading && !error && messages.length > 0 && (
        <FlatList
          data={messages}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          renderItem={({ item }) => {
            const isOwn = item.senderId === currentUserId;
            return (
              <Pressable
                onLongPress={() => !item.deletedForEveryone && setActionsFor(item)}
                style={[styles.bubbleRow, isOwn && styles.bubbleRowOwn]}>
                <ThemedView type={isOwn ? 'tealDeep' : 'backgroundElement'} style={styles.bubble}>
                  {item.deletedForEveryone ? (
                    <ThemedText type="small" themeColor="textSecondary" style={styles.tombstone}>
                      This message was deleted
                    </ThemedText>
                  ) : item.kind === 'voice' && item.audioUrl ? (
                    <VoiceBubbleContent url={item.audioUrl} durationSeconds={item.audioDurationSeconds} />
                  ) : (
                    <ThemedText>{item.body}</ThemedText>
                  )}
                  <View style={styles.bubbleFooter}>
                    {item.editedAt && !item.deletedForEveryone && (
                      <ThemedText type="small" themeColor="textSecondary" style={styles.editedLabel}>
                        edited
                      </ThemedText>
                    )}
                    <ThemedText type="small" themeColor="textSecondary">
                      {formatTimestamp(item.createdAt)}
                    </ThemedText>
                  </View>
                </ThemedView>
              </Pressable>
            );
          }}
        />
      )}

      {recordingActive ? (
        <View style={styles.recordingBar}>
          <ThemedText type="smallBold" style={styles.recordingDot}>
            ●
          </ThemedText>
          <ThemedText type="smallBold">
            {formatDuration(recorderState.durationMillis / 1000)} / {formatDuration(MAX_VOICE_MESSAGE_SECONDS)}
          </ThemedText>
          {remainingSeconds <= 30 && (
            <ThemedText type="small" style={styles.error}>
              Auto-stopping soon
            </ThemedText>
          )}
          <View style={styles.recordingActions}>
            <Pressable onPress={handleCancelRecording}>
              <ThemedText themeColor="textSecondary">Cancel</ThemedText>
            </Pressable>
            <Pressable onPress={handleStopRecording} style={styles.stopButton}>
              <ThemedText type="smallBold" style={{ color: Colors.text }}>
                Stop &amp; send
              </ThemedText>
            </Pressable>
          </View>
        </View>
      ) : (
        <>
          {editingMessageId && (
            <View style={styles.editingBanner}>
              <ThemedText type="small" themeColor="textSecondary">
                Editing message
              </ThemedText>
              <Pressable onPress={handleCancelEdit}>
                <ThemedText type="small" style={styles.editedLabel}>
                  Cancel
                </ThemedText>
              </Pressable>
            </View>
          )}
          <View style={styles.composerRow}>
            <Pressable onPress={() => setEmojiOpen(true)} style={styles.iconButton}>
              <ThemedText style={styles.iconText}>😊</ThemedText>
            </Pressable>
            <TextInput
              value={composerText}
              onChangeText={setComposerText}
              placeholder="Message..."
              placeholderTextColor={theme.textSecondary}
              multiline
              style={[styles.input, { color: theme.text, borderColor: theme.backgroundSelected }]}
            />
            {composerText.trim().length > 0 ? (
              <Pressable onPress={handleSend} disabled={sending} style={styles.sendButton}>
                {sending ? (
                  <ActivityIndicator size="small" color={Colors.text} />
                ) : (
                  <ThemedText type="smallBold" style={{ color: Colors.text }}>
                    {editingMessageId ? 'Save' : 'Send'}
                  </ThemedText>
                )}
              </Pressable>
            ) : (
              <Pressable onPress={handleStartRecording} disabled={sending} style={styles.iconButton}>
                <ThemedText style={styles.iconText}>🎤</ThemedText>
              </Pressable>
            )}
          </View>
        </>
      )}

      <EmojiPicker
        visible={emojiOpen}
        onSelect={(emoji) => setComposerText((current) => current + emoji)}
        onClose={() => setEmojiOpen(false)}
      />

      <Modal visible={actionsFor !== null} transparent animationType="fade" onRequestClose={() => setActionsFor(null)}>
        <View style={styles.actionsOverlay}>
          <ThemedView type="backgroundElement" style={styles.actionsCard}>
            {actionsFor?.senderId === currentUserId && actionsFor.kind === 'text' && (
              <Pressable style={styles.actionRow} onPress={() => actionsFor && handleEdit(actionsFor)}>
                <ThemedText type="smallBold">Edit</ThemedText>
              </Pressable>
            )}
            {actionsFor?.senderId === currentUserId && canDeleteForEveryone(actionsFor.createdAt) && (
              <Pressable
                style={styles.actionRow}
                onPress={() => {
                  if (actionsFor) setPendingDelete({ message: actionsFor, mode: 'everyone' });
                  setActionsFor(null);
                }}>
                <ThemedText type="smallBold" style={styles.deleteText}>
                  Delete for everyone
                </ThemedText>
              </Pressable>
            )}
            <Pressable
              style={styles.actionRow}
              onPress={() => {
                if (actionsFor) setPendingDelete({ message: actionsFor, mode: 'me' });
                setActionsFor(null);
              }}>
              <ThemedText type="smallBold" style={styles.deleteText}>
                Delete for me
              </ThemedText>
            </Pressable>
            <Pressable style={styles.actionRow} onPress={() => setActionsFor(null)}>
              <ThemedText themeColor="textSecondary">Cancel</ThemedText>
            </Pressable>
          </ThemedView>
        </View>
      </Modal>

      <ConfirmDialog
        visible={pendingDelete !== null}
        title={pendingDelete?.mode === 'everyone' ? 'Delete for everyone?' : 'Delete for me?'}
        message={
          pendingDelete?.mode === 'everyone'
            ? 'This removes the message for both of you, permanently.'
            : 'This only removes the message from your own view — the other person still sees it.'
        }
        confirmLabel="Delete"
        busy={deleting}
        onConfirm={handleConfirmDelete}
        onCancel={() => setPendingDelete(null)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingBottom: Spacing.two,
    borderBottomWidth: 1,
    borderBottomColor: Colors.backgroundSelected,
    marginBottom: Spacing.two,
  },
  loader: {
    marginTop: Spacing.five,
  },
  error: {
    color: Accent,
  },
  empty: {
    textAlign: 'center',
    marginTop: Spacing.five,
  },
  listContent: {
    gap: Spacing.two,
    paddingBottom: Spacing.two,
  },
  bubbleRow: {
    flexDirection: 'row',
    justifyContent: 'flex-start',
  },
  bubbleRowOwn: {
    justifyContent: 'flex-end',
  },
  bubble: {
    maxWidth: '80%',
    borderRadius: Spacing.two,
    padding: Spacing.three,
    gap: Spacing.half,
  },
  bubbleFooter: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: Spacing.two,
    marginTop: Spacing.half,
  },
  editedLabel: {
    fontStyle: 'italic',
  },
  tombstone: {
    fontStyle: 'italic',
  },
  voiceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    minWidth: 160,
  },
  voiceTrack: {
    flex: 1,
    height: 4,
    borderRadius: 999,
    backgroundColor: 'rgba(0,0,0,0.3)',
    overflow: 'hidden',
  },
  voiceFill: {
    height: '100%',
    borderRadius: 999,
    backgroundColor: Colors.tealBright,
  },
  recordingBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    borderRadius: Spacing.two,
    padding: Spacing.three,
    backgroundColor: Colors.backgroundElement,
  },
  recordingDot: {
    color: Accent,
  },
  recordingActions: {
    flexDirection: 'row',
    gap: Spacing.three,
    marginLeft: 'auto',
    alignItems: 'center',
  },
  stopButton: {
    ...Glow.oxblood,
    backgroundColor: Accent,
    borderRadius: Spacing.two,
    paddingVertical: Spacing.one,
    paddingHorizontal: Spacing.three,
  },
  editingBanner: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing.one,
    paddingBottom: Spacing.one,
  },
  composerRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: Spacing.two,
  },
  iconButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconText: {
    fontSize: 20,
  },
  input: {
    flex: 1,
    borderWidth: 1,
    borderRadius: Spacing.four,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    fontSize: 16,
    maxHeight: 100,
  },
  sendButton: {
    ...Glow.oxblood,
    backgroundColor: Accent,
    borderRadius: 999,
    width: 60,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionsOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'flex-end',
  },
  actionsCard: {
    borderTopLeftRadius: Spacing.four,
    borderTopRightRadius: Spacing.four,
    paddingTop: Spacing.two,
    paddingBottom: Spacing.four,
  },
  actionRow: {
    paddingVertical: Spacing.three,
    paddingHorizontal: Spacing.four,
  },
  deleteText: {
    color: Accent,
  },
});
