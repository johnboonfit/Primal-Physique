import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { Redirect, router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Accent, Colors, Glow, Spacing } from '@/constants/theme';
import { useAuth } from '@/context/auth-context';
import { useTheme } from '@/hooks/use-theme';
import { createBulkMessageSeries, type BulkAttachmentInput, type RepeatCadence } from '@/lib/bulk-messages';
import { listCoachConversations, type CoachInboxEntry } from '@/lib/chat';

const IMAGE_PICKER_OPTIONS: ImagePicker.ImagePickerOptions = {
  mediaTypes: 'images',
  base64: true,
  quality: 0.7,
};

const CADENCE_OPTIONS: { key: RepeatCadence; label: string }[] = [
  { key: 'none', label: 'Once' },
  { key: 'daily', label: 'Daily' },
  { key: 'weekly', label: 'Weekly' },
  { key: 'monthly', label: 'Monthly' },
];

function initial(name: string) {
  return name.trim().charAt(0).toUpperCase() || '?';
}

/** Parses "YYYY-MM-DD" + "HH:MM" (24-hour, local time) into an ISO
 * timestamp — a plain pair of text fields rather than a native date
 * picker, so this whole screen (including the values a coach actually
 * typed) stays testable in a browser, not just on a real device. */
function parseScheduleDateTime(dateText: string, timeText: string): Date | null {
  const dateMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateText.trim());
  const timeMatch = /^(\d{1,2}):(\d{2})$/.exec(timeText.trim());
  if (!dateMatch || !timeMatch) return null;

  const [, year, month, day] = dateMatch;
  const [, hour, minute] = timeMatch;
  const date = new Date(
    Number(year),
    Number(month) - 1,
    Number(day),
    Number(hour),
    Number(minute),
    0,
    0
  );
  if (Number.isNaN(date.getTime())) return null;
  if (Number(hour) > 23 || Number(minute) > 59) return null;
  return date;
}

/** Coach-only, same inline-guard shape as messages/index.tsx. */
export default function SendBulkMessageScreen() {
  const theme = useTheme();
  const { session, profile, loadingProfile } = useAuth();

  const [clients, setClients] = useState<CoachInboxEntry[]>([]);
  const [loadingClients, setLoadingClients] = useState(true);
  const [selectedClientIds, setSelectedClientIds] = useState<Set<string>>(new Set());

  const [label, setLabel] = useState('');
  const [body, setBody] = useState('');

  const [attachment, setAttachment] = useState<BulkAttachmentInput | null>(null);
  const [attachmentPreviewName, setAttachmentPreviewName] = useState<string | null>(null);
  const [attachmentPreviewUri, setAttachmentPreviewUri] = useState<string | null>(null);

  const [sendMode, setSendMode] = useState<'now' | 'schedule'>('now');
  const [scheduleDate, setScheduleDate] = useState('');
  const [scheduleTime, setScheduleTime] = useState('');
  const [repeatCadence, setRepeatCadence] = useState<RepeatCadence>('none');

  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    listCoachConversations()
      .then(setClients)
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load clients.'))
      .finally(() => setLoadingClients(false));
  }, []);

  if (loadingProfile && !profile) return null;
  if (profile?.role !== 'coach') return <Redirect href="/home" />;

  const allSelected = clients.length > 0 && selectedClientIds.size === clients.length;

  const toggleClient = (clientId: string) => {
    setSelectedClientIds((current) => {
      const next = new Set(current);
      if (next.has(clientId)) next.delete(clientId);
      else next.add(clientId);
      return next;
    });
  };

  const toggleSelectAll = () => {
    setSelectedClientIds(allSelected ? new Set() : new Set(clients.map((c) => c.clientId)));
  };

  const handlePickPhoto = async () => {
    setError(null);
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      setError('Photo library access is needed to choose a photo.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync(IMAGE_PICKER_OPTIONS);
    if (result.canceled || !result.assets?.[0]?.base64) return;

    setAttachment({ kind: 'image', base64: result.assets[0].base64, mimeType: result.assets[0].mimeType ?? 'image/jpeg' });
    setAttachmentPreviewUri(result.assets[0].uri);
    setAttachmentPreviewName(null);
  };

  const handlePickDocument = async () => {
    setError(null);
    const result = await DocumentPicker.getDocumentAsync({ type: '*/*', base64: true });
    if (result.canceled || !result.assets?.[0]) return;
    const asset = result.assets[0];

    try {
      const base64 = asset.base64 ?? (await FileSystem.readAsStringAsync(asset.uri, { encoding: 'base64' }));
      setAttachment({ kind: 'file', base64, fileName: asset.name, mimeType: asset.mimeType ?? 'application/octet-stream' });
      setAttachmentPreviewUri(null);
      setAttachmentPreviewName(asset.name);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to read that document.');
    }
  };

  const clearAttachment = () => {
    setAttachment(null);
    setAttachmentPreviewUri(null);
    setAttachmentPreviewName(null);
  };

  const scheduledDateTime = useMemo(
    () => (sendMode === 'schedule' ? parseScheduleDateTime(scheduleDate, scheduleTime) : null),
    [sendMode, scheduleDate, scheduleTime]
  );

  const canSubmit =
    !sending &&
    selectedClientIds.size > 0 &&
    body.trim().length > 0 &&
    (sendMode === 'now' || (scheduledDateTime !== null && scheduledDateTime.getTime() > Date.now()));

  const handleSubmit = async () => {
    if (!session || !canSubmit) return;
    setSending(true);
    setError(null);
    try {
      await createBulkMessageSeries({
        coachId: session.user.id,
        label,
        body: body.trim(),
        clientIds: Array.from(selectedClientIds),
        attachment,
        sendAt: sendMode === 'now' ? 'now' : scheduledDateTime!.toISOString(),
        repeatCadence,
      });
      router.back();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send.');
      setSending(false);
    }
  };

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} hitSlop={8}>
            <ThemedText type="linkPrimary">Cancel</ThemedText>
          </Pressable>
          <ThemedText type="smallBold">Send Bulk Message</ThemedText>
          <View style={{ width: 50 }} />
        </View>

        <ScrollView contentContainerStyle={styles.scrollContent}>
          <View style={styles.sectionHeader}>
            <ThemedText type="smallBold">Select Clients ({selectedClientIds.size})</ThemedText>
            <Pressable onPress={toggleSelectAll}>
              <ThemedText type="small" style={styles.selectAll}>
                {allSelected ? 'Deselect All' : 'Select All'}
              </ThemedText>
            </Pressable>
          </View>

          {loadingClients && <ActivityIndicator style={styles.loader} />}

          {!loadingClients && clients.length === 0 && (
            <ThemedText themeColor="textSecondary">No clients yet.</ThemedText>
          )}

          {!loadingClients && clients.length > 0 && (
            <ThemedView type="backgroundElement" style={styles.clientList}>
              {clients.map((client) => {
                const checked = selectedClientIds.has(client.clientId);
                return (
                  <Pressable key={client.clientId} style={styles.clientRow} onPress={() => toggleClient(client.clientId)}>
                    <View style={styles.avatar}>
                      <ThemedText type="smallBold" style={{ color: Colors.text }}>
                        {initial(client.name)}
                      </ThemedText>
                    </View>
                    <ThemedText style={styles.clientName}>{client.name}</ThemedText>
                    <View style={[styles.checkbox, checked && styles.checkboxChecked]}>
                      {checked && <ThemedText style={styles.checkmark}>✓</ThemedText>}
                    </View>
                  </Pressable>
                );
              })}
            </ThemedView>
          )}

          <ThemedText type="smallBold" style={styles.fieldLabel}>
            Label (your reference only, not sent to clients)
          </ThemedText>
          <TextInput
            value={label}
            onChangeText={setLabel}
            placeholder="e.g. Weekly check-in reminder"
            placeholderTextColor={theme.textSecondary}
            style={[styles.input, { color: theme.text, borderColor: theme.backgroundSelected }]}
          />

          <ThemedText type="smallBold" style={styles.fieldLabel}>
            Message
          </ThemedText>
          <TextInput
            value={body}
            onChangeText={setBody}
            placeholder="Write what every selected client will actually see..."
            placeholderTextColor={theme.textSecondary}
            multiline
            style={[styles.input, styles.messageInput, { color: theme.text, borderColor: theme.backgroundSelected }]}
          />

          <ThemedText type="smallBold" style={styles.fieldLabel}>
            Attachment (optional)
          </ThemedText>
          {attachment ? (
            <View style={styles.attachmentPreview}>
              {attachmentPreviewUri ? (
                <Image source={{ uri: attachmentPreviewUri }} style={styles.attachmentThumbnail} contentFit="cover" />
              ) : (
                <ThemedText numberOfLines={1} style={styles.attachmentFileName}>
                  📎 {attachmentPreviewName}
                </ThemedText>
              )}
              <Pressable onPress={clearAttachment}>
                <ThemedText type="small" style={styles.removeAttachment}>
                  Remove
                </ThemedText>
              </Pressable>
            </View>
          ) : (
            <View style={styles.attachmentButtons}>
              <Pressable style={styles.attachmentPickButton} onPress={handlePickPhoto}>
                <ThemedText type="small">Add Photo</ThemedText>
              </Pressable>
              <Pressable style={styles.attachmentPickButton} onPress={handlePickDocument}>
                <ThemedText type="small">Add Document</ThemedText>
              </Pressable>
            </View>
          )}

          <ThemedText type="smallBold" style={styles.fieldLabel}>
            When to Send
          </ThemedText>
          <View style={styles.sendModeRow}>
            <Pressable
              style={[styles.sendModeButton, sendMode === 'now' && styles.sendModeButtonActive]}
              onPress={() => setSendMode('now')}>
              <ThemedText type="smallBold" style={sendMode === 'now' ? styles.sendModeTextActive : undefined}>
                ⚡ Send Now
              </ThemedText>
            </Pressable>
            <Pressable
              style={[styles.sendModeButton, sendMode === 'schedule' && styles.sendModeButtonActive]}
              onPress={() => setSendMode('schedule')}>
              <ThemedText type="smallBold" style={sendMode === 'schedule' ? styles.sendModeTextActive : undefined}>
                📅 Schedule
              </ThemedText>
            </Pressable>
          </View>

          {sendMode === 'schedule' && (
            <>
              <View style={styles.dateTimeRow}>
                <TextInput
                  value={scheduleDate}
                  onChangeText={setScheduleDate}
                  placeholder="YYYY-MM-DD"
                  placeholderTextColor={theme.textSecondary}
                  style={[styles.input, styles.dateTimeInput, { color: theme.text, borderColor: theme.backgroundSelected }]}
                />
                <TextInput
                  value={scheduleTime}
                  onChangeText={setScheduleTime}
                  placeholder="HH:MM (24h)"
                  placeholderTextColor={theme.textSecondary}
                  style={[styles.input, styles.dateTimeInput, { color: theme.text, borderColor: theme.backgroundSelected }]}
                />
              </View>

              <ThemedText type="small" themeColor="textSecondary" style={styles.repeatHint}>
                Want a recurring reminder — a weekly check-in or monthly motivation? Pick a Repeat below.
              </ThemedText>
              <View style={styles.cadenceRow}>
                {CADENCE_OPTIONS.map((option) => (
                  <Pressable
                    key={option.key}
                    style={[styles.cadencePill, repeatCadence === option.key && styles.cadencePillActive]}
                    onPress={() => setRepeatCadence(option.key)}>
                    <ThemedText type="small" style={repeatCadence === option.key ? styles.sendModeTextActive : undefined}>
                      {option.label}
                    </ThemedText>
                  </Pressable>
                ))}
              </View>
            </>
          )}

          {error && <ThemedText style={styles.error}>{error}</ThemedText>}
        </ScrollView>

        <View style={styles.footer}>
          <Pressable style={styles.cancelButton} onPress={() => router.back()}>
            <ThemedText type="smallBold">Cancel</ThemedText>
          </Pressable>
          <Pressable style={[styles.submitButton, !canSubmit && styles.submitButtonDisabled]} onPress={handleSubmit} disabled={!canSubmit}>
            {sending ? (
              <ActivityIndicator size="small" color={Colors.text} />
            ) : (
              <ThemedText type="smallBold" style={{ color: Colors.text }}>
                {sendMode === 'now' ? `Send to ${selectedClientIds.size}` : `Schedule for ${selectedClientIds.size}`}
              </ThemedText>
            )}
          </Pressable>
        </View>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  safeArea: { flex: 1 },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.two,
    paddingBottom: Spacing.three,
    borderBottomWidth: 1,
    borderBottomColor: Colors.backgroundSelected,
  },
  scrollContent: {
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.three,
    paddingBottom: Spacing.six,
    gap: Spacing.one,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.two,
  },
  selectAll: {
    color: Accent,
  },
  loader: {
    marginVertical: Spacing.four,
  },
  clientList: {
    borderRadius: Spacing.two,
    marginBottom: Spacing.four,
    maxHeight: 260,
  },
  clientRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    padding: Spacing.three,
    borderBottomWidth: 1,
    borderBottomColor: Colors.background,
  },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.tealDeep,
    alignItems: 'center',
    justifyContent: 'center',
  },
  clientName: {
    flex: 1,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: Spacing.half,
    borderWidth: 1,
    borderColor: Colors.backgroundSelected,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxChecked: {
    backgroundColor: Accent,
    borderColor: Accent,
  },
  checkmark: {
    color: Colors.text,
    fontSize: 14,
    fontWeight: '700',
  },
  fieldLabel: {
    marginTop: Spacing.three,
    marginBottom: Spacing.one,
  },
  input: {
    borderWidth: 1,
    borderRadius: Spacing.two,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    fontSize: 16,
  },
  messageInput: {
    minHeight: 90,
    textAlignVertical: 'top',
  },
  attachmentButtons: {
    flexDirection: 'row',
    gap: Spacing.three,
  },
  attachmentPickButton: {
    flex: 1,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: Colors.backgroundSelected,
    borderRadius: Spacing.two,
    paddingVertical: Spacing.four,
    alignItems: 'center',
  },
  attachmentPreview: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
  },
  attachmentThumbnail: {
    width: 60,
    height: 60,
    borderRadius: Spacing.two,
  },
  attachmentFileName: {
    flex: 1,
  },
  removeAttachment: {
    color: Accent,
  },
  sendModeRow: {
    flexDirection: 'row',
    gap: Spacing.three,
  },
  sendModeButton: {
    flex: 1,
    borderWidth: 1,
    borderColor: Colors.backgroundSelected,
    borderRadius: Spacing.two,
    paddingVertical: Spacing.three,
    alignItems: 'center',
  },
  sendModeButtonActive: {
    ...Glow.oxblood,
    backgroundColor: Accent,
    borderColor: Accent,
  },
  sendModeTextActive: {
    color: Colors.text,
  },
  dateTimeRow: {
    flexDirection: 'row',
    gap: Spacing.three,
    marginTop: Spacing.three,
  },
  dateTimeInput: {
    flex: 1,
  },
  repeatHint: {
    marginTop: Spacing.three,
  },
  cadenceRow: {
    flexDirection: 'row',
    gap: Spacing.two,
    marginTop: Spacing.two,
  },
  cadencePill: {
    borderWidth: 1,
    borderColor: Colors.backgroundSelected,
    borderRadius: 999,
    paddingVertical: Spacing.one,
    paddingHorizontal: Spacing.three,
  },
  cadencePillActive: {
    backgroundColor: Accent,
    borderColor: Accent,
  },
  error: {
    color: Accent,
    marginTop: Spacing.three,
  },
  footer: {
    flexDirection: 'row',
    gap: Spacing.three,
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.three,
    borderTopWidth: 1,
    borderTopColor: Colors.backgroundSelected,
  },
  cancelButton: {
    flex: 1,
    borderWidth: 1,
    borderColor: Colors.backgroundSelected,
    borderRadius: Spacing.two,
    paddingVertical: Spacing.three,
    alignItems: 'center',
  },
  submitButton: {
    flex: 1,
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
