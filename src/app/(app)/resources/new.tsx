import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Accent, Colors, Glow, Spacing } from '@/constants/theme';
import { useAuth } from '@/context/auth-context';
import { useTheme } from '@/hooks/use-theme';
import { listClients, type ClientSummary } from '@/lib/clients';
import { createResourceFolder, createResourceLink, listResourceFolders, uploadResourceFile, type ResourceFolder } from '@/lib/resources';

type ItemType = 'link' | 'file';

function initial(name: string) {
  return name.trim().charAt(0).toUpperCase() || '?';
}

/** Coach-only — same inline-guard shape as challenges/new.tsx. Folder
 * picking reuses the same chip-row idea audience uses below it, plus a
 * "+ New Folder" chip that reveals a one-line text input; confirming it
 * creates the folder immediately (folders are cheap and harmless to
 * create eagerly — there's no separate "manage folders" screen to do it
 * from otherwise) and selects it. "Specific clients" reuses the exact
 * checkbox + Select All picker challenges/new.tsx already established. */
export default function NewResourceScreen() {
  const theme = useTheme();
  const { session, profile, loadingProfile } = useAuth();

  const [type, setType] = useState<ItemType>('link');
  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  const [pickedFile, setPickedFile] = useState<{ base64: string; fileName: string; mimeType: string } | null>(null);
  const [picking, setPicking] = useState(false);

  const [folders, setFolders] = useState<ResourceFolder[]>([]);
  const [loadingFolders, setLoadingFolders] = useState(true);
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);
  const [addingFolder, setAddingFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');

  const [audience, setAudience] = useState<'all' | 'specific'>('all');
  const [clients, setClients] = useState<ClientSummary[]>([]);
  const [loadingClients, setLoadingClients] = useState(true);
  const [selectedClientIds, setSelectedClientIds] = useState<Set<string>>(new Set());

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!session) return;
    listResourceFolders(session.user.id)
      .then(setFolders)
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load folders.'))
      .finally(() => setLoadingFolders(false));
    listClients()
      .then(setClients)
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load clients.'))
      .finally(() => setLoadingClients(false));
  }, [session]);

  if (loadingProfile && !profile) return null;
  if (profile?.role !== 'coach') return null;

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
    setSelectedClientIds(allSelected ? new Set() : new Set(clients.map((c) => c.id)));
  };

  const handleAddFolder = async () => {
    if (!session || !newFolderName.trim()) return;
    try {
      const folder = await createResourceFolder(session.user.id, newFolderName.trim());
      setFolders((current) => [...current, folder].sort((a, b) => a.name.localeCompare(b.name)));
      setSelectedFolderId(folder.id);
      setNewFolderName('');
      setAddingFolder(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create that folder.');
    }
  };

  const handlePickFile = async () => {
    setError(null);
    setPicking(true);
    try {
      const result = await DocumentPicker.getDocumentAsync({ type: '*/*', base64: true });
      if (result.canceled || !result.assets?.[0]) return;
      const asset = result.assets[0];
      const base64 = asset.base64 ?? (await FileSystem.readAsStringAsync(asset.uri, { encoding: 'base64' }));
      setPickedFile({ base64, fileName: asset.name, mimeType: asset.mimeType ?? 'application/octet-stream' });
      if (!name.trim()) setName(asset.name);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to pick that file.');
    } finally {
      setPicking(false);
    }
  };

  const canSubmit =
    !saving &&
    name.trim().length > 0 &&
    (type === 'link' ? url.trim().length > 0 : pickedFile !== null) &&
    (audience === 'all' || selectedClientIds.size > 0);

  const handleSubmit = async () => {
    if (!session || !canSubmit) return;
    setSaving(true);
    setError(null);
    try {
      if (type === 'link') {
        await createResourceLink({
          coachId: session.user.id,
          name: name.trim(),
          folderId: selectedFolderId,
          url: url.trim(),
          openToAll: audience === 'all',
          eligibleClientIds: audience === 'all' ? [] : Array.from(selectedClientIds),
        });
      } else if (pickedFile) {
        await uploadResourceFile({
          coachId: session.user.id,
          name: name.trim(),
          folderId: selectedFolderId,
          base64: pickedFile.base64,
          fileName: pickedFile.fileName,
          mimeType: pickedFile.mimeType,
          openToAll: audience === 'all',
          eligibleClientIds: audience === 'all' ? [] : Array.from(selectedClientIds),
        });
      }
      router.back();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add that resource.');
      setSaving(false);
    }
  };

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} hitSlop={8}>
            <ThemedText type="linkPrimary">Cancel</ThemedText>
          </Pressable>
          <ThemedText type="smallBold">New Resource</ThemedText>
          <View style={{ width: 50 }} />
        </View>

        <ScrollView contentContainerStyle={styles.scrollContent}>
          <ThemedText type="smallBold" style={styles.fieldLabel}>
            Type
          </ThemedText>
          <View style={styles.typeRow}>
            <Pressable style={[styles.typePill, type === 'link' && styles.typePillActive]} onPress={() => setType('link')}>
              <ThemedText type="smallBold" style={type === 'link' ? styles.typePillTextActive : undefined}>
                🔗 Link
              </ThemedText>
            </Pressable>
            <Pressable style={[styles.typePill, type === 'file' && styles.typePillActive]} onPress={() => setType('file')}>
              <ThemedText type="smallBold" style={type === 'file' ? styles.typePillTextActive : undefined}>
                📄 Upload File
              </ThemedText>
            </Pressable>
          </View>

          <ThemedText type="smallBold" style={styles.fieldLabel}>
            Name
          </ThemedText>
          <TextInput
            value={name}
            onChangeText={setName}
            placeholder="e.g. Mobility Warm-Up Guide"
            placeholderTextColor={theme.textSecondary}
            style={[styles.input, { color: theme.text, borderColor: theme.backgroundSelected }]}
          />

          {type === 'link' ? (
            <>
              <ThemedText type="smallBold" style={styles.fieldLabel}>
                URL
              </ThemedText>
              <TextInput
                value={url}
                onChangeText={setUrl}
                placeholder="https://..."
                autoCapitalize="none"
                keyboardType="url"
                placeholderTextColor={theme.textSecondary}
                style={[styles.input, { color: theme.text, borderColor: theme.backgroundSelected }]}
              />
            </>
          ) : (
            <>
              <ThemedText type="smallBold" style={styles.fieldLabel}>
                File
              </ThemedText>
              <Pressable style={styles.pickButton} onPress={handlePickFile} disabled={picking}>
                {picking ? (
                  <ActivityIndicator size="small" />
                ) : (
                  <ThemedText type="smallBold" style={styles.pickButtonText}>
                    {pickedFile ? pickedFile.fileName : 'Choose a file…'}
                  </ThemedText>
                )}
              </Pressable>
            </>
          )}

          <ThemedText type="smallBold" style={styles.fieldLabel}>
            Folder
          </ThemedText>
          {loadingFolders ? (
            <ActivityIndicator size="small" style={styles.loader} />
          ) : (
            <View style={styles.folderRow}>
              <Pressable
                style={[styles.folderChip, selectedFolderId === null && styles.folderChipActive]}
                onPress={() => setSelectedFolderId(null)}>
                <ThemedText type="small" style={selectedFolderId === null ? styles.folderChipTextActive : undefined}>
                  Uncategorized
                </ThemedText>
              </Pressable>
              {folders.map((folder) => (
                <Pressable
                  key={folder.id}
                  style={[styles.folderChip, selectedFolderId === folder.id && styles.folderChipActive]}
                  onPress={() => setSelectedFolderId(folder.id)}>
                  <ThemedText type="small" style={selectedFolderId === folder.id ? styles.folderChipTextActive : undefined}>
                    {folder.name}
                  </ThemedText>
                </Pressable>
              ))}
              {!addingFolder && (
                <Pressable style={styles.folderChip} onPress={() => setAddingFolder(true)}>
                  <ThemedText type="small" style={styles.newFolderText}>
                    + New Folder
                  </ThemedText>
                </Pressable>
              )}
            </View>
          )}
          {addingFolder && (
            <View style={styles.newFolderRow}>
              <TextInput
                value={newFolderName}
                onChangeText={setNewFolderName}
                placeholder="Folder name"
                placeholderTextColor={theme.textSecondary}
                style={[styles.input, styles.newFolderInput, { color: theme.text, borderColor: theme.backgroundSelected }]}
                autoFocus
              />
              <Pressable style={styles.addFolderButton} onPress={handleAddFolder}>
                <ThemedText type="smallBold" style={{ color: Colors.text }}>
                  Add
                </ThemedText>
              </Pressable>
            </View>
          )}

          <ThemedText type="smallBold" style={styles.fieldLabel}>
            Who can see this
          </ThemedText>
          <View style={styles.audienceRow}>
            <Pressable
              style={[styles.audienceButton, audience === 'all' && styles.audienceButtonActive]}
              onPress={() => setAudience('all')}>
              <ThemedText type="smallBold" style={audience === 'all' ? styles.audienceTextActive : undefined}>
                All Clients
              </ThemedText>
            </Pressable>
            <Pressable
              style={[styles.audienceButton, audience === 'specific' && styles.audienceButtonActive]}
              onPress={() => setAudience('specific')}>
              <ThemedText type="smallBold" style={audience === 'specific' ? styles.audienceTextActive : undefined}>
                Specific Clients
              </ThemedText>
            </Pressable>
          </View>

          {audience === 'specific' && (
            <>
              <View style={styles.sectionHeader}>
                <ThemedText type="small" themeColor="textSecondary">
                  Select Clients ({selectedClientIds.size})
                </ThemedText>
                <Pressable onPress={toggleSelectAll}>
                  <ThemedText type="small" style={styles.selectAll}>
                    {allSelected ? 'Deselect All' : 'Select All'}
                  </ThemedText>
                </Pressable>
              </View>

              {loadingClients && <ActivityIndicator style={styles.loader} />}

              {!loadingClients && clients.length > 0 && (
                <ThemedView type="backgroundElement" style={styles.clientList}>
                  {clients.map((client) => {
                    const checked = selectedClientIds.has(client.id);
                    const label = client.fullName || client.email.split('@')[0];
                    return (
                      <Pressable key={client.id} style={styles.clientRow} onPress={() => toggleClient(client.id)}>
                        <View style={styles.avatar}>
                          <ThemedText type="smallBold" style={{ color: Colors.text }}>
                            {initial(label)}
                          </ThemedText>
                        </View>
                        <ThemedText style={styles.clientName}>{label}</ThemedText>
                        <View style={[styles.checkbox, checked && styles.checkboxChecked]}>
                          {checked && <ThemedText style={styles.checkmark}>✓</ThemedText>}
                        </View>
                      </Pressable>
                    );
                  })}
                </ThemedView>
              )}
            </>
          )}

          {error && <ThemedText style={styles.error}>{error}</ThemedText>}
        </ScrollView>

        <View style={styles.footer}>
          <Pressable style={styles.cancelButton} onPress={() => router.back()}>
            <ThemedText type="smallBold">Cancel</ThemedText>
          </Pressable>
          <Pressable
            style={[styles.submitButton, !canSubmit && styles.submitButtonDisabled]}
            onPress={handleSubmit}
            disabled={!canSubmit}>
            {saving ? (
              <ActivityIndicator size="small" color={Colors.text} />
            ) : (
              <ThemedText type="smallBold" style={{ color: Colors.text }}>
                Add to Library
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
  typeRow: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  typePill: {
    borderWidth: 1,
    borderColor: Colors.backgroundSelected,
    borderRadius: 999,
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.four,
  },
  typePillActive: {
    backgroundColor: Accent,
    borderColor: Accent,
  },
  typePillTextActive: {
    color: Colors.text,
  },
  pickButton: {
    borderWidth: 1,
    borderColor: Colors.backgroundSelected,
    borderRadius: Spacing.two,
    paddingVertical: Spacing.three,
    alignItems: 'center',
  },
  pickButtonText: {
    color: Colors.tealBright,
  },
  loader: {
    marginVertical: Spacing.two,
  },
  folderRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  folderChip: {
    borderWidth: 1,
    borderColor: Colors.backgroundSelected,
    borderRadius: 999,
    paddingVertical: Spacing.one,
    paddingHorizontal: Spacing.three,
  },
  folderChipActive: {
    backgroundColor: Accent,
    borderColor: Accent,
  },
  folderChipTextActive: {
    color: Colors.text,
  },
  newFolderText: {
    color: Colors.tealBright,
  },
  newFolderRow: {
    flexDirection: 'row',
    gap: Spacing.two,
    marginTop: Spacing.two,
  },
  newFolderInput: {
    flex: 1,
  },
  addFolderButton: {
    backgroundColor: Accent,
    borderRadius: Spacing.two,
    paddingHorizontal: Spacing.four,
    justifyContent: 'center',
  },
  audienceRow: {
    flexDirection: 'row',
    gap: Spacing.three,
  },
  audienceButton: {
    flex: 1,
    borderWidth: 1,
    borderColor: Colors.backgroundSelected,
    borderRadius: Spacing.two,
    paddingVertical: Spacing.three,
    alignItems: 'center',
  },
  audienceButtonActive: {
    ...Glow.oxblood,
    backgroundColor: Accent,
    borderColor: Accent,
  },
  audienceTextActive: {
    color: Colors.text,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: Spacing.three,
    marginBottom: Spacing.two,
  },
  selectAll: {
    color: Accent,
  },
  clientList: {
    borderRadius: Spacing.two,
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
