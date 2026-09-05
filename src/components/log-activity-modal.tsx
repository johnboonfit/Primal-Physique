import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Accent, Colors, Glow, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { ACTIVITY_TYPES, addActivityLog, type ActivityType, type DistanceUnit } from '@/lib/activity-logs';

type LogActivityModalProps = {
  visible: boolean;
  clientId: string;
  onClose: () => void;
  onSaved: () => void;
};

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * The client's "Log Activity" flow — record a run/swim/ride/etc (or a
 * free-typed custom one) that isn't part of a prescribed workout. Same
 * modal/chip shape nutrition.tsx's food-add modal already established
 * (overlay + centered card, bordered chip row for the unit toggle), so
 * this fits the rest of the app rather than introducing a new pattern.
 */
export function LogActivityModal({ visible, clientId, onClose, onSaved }: LogActivityModalProps) {
  const theme = useTheme();

  const [activityType, setActivityType] = useState<ActivityType | null>(null);
  const [customLabel, setCustomLabel] = useState('');
  const [duration, setDuration] = useState('');
  const [distance, setDistance] = useState('');
  const [distanceUnit, setDistanceUnit] = useState<DistanceUnit>('km');
  const [calories, setCalories] = useState('');
  const [notes, setNotes] = useState('');

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reset = () => {
    setActivityType(null);
    setCustomLabel('');
    setDuration('');
    setDistance('');
    setDistanceUnit('km');
    setCalories('');
    setNotes('');
    setError(null);
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const parsedDuration = Number(duration);
  const hasValidDuration = duration.trim().length > 0 && Number.isFinite(parsedDuration) && parsedDuration > 0;
  const hasValidType = activityType !== null && (activityType !== 'custom' || customLabel.trim().length > 0);
  const canSave = hasValidType && hasValidDuration && !saving;

  const handleSave = async () => {
    if (!canSave || !activityType) return;
    setSaving(true);
    setError(null);
    try {
      const trimmedDistance = distance.trim();
      const parsedDistance = trimmedDistance ? Number(trimmedDistance) : null;
      if (trimmedDistance && (!Number.isFinite(parsedDistance) || (parsedDistance as number) < 0)) {
        setError('Distance must be a number of 0 or more.');
        setSaving(false);
        return;
      }
      const trimmedCalories = calories.trim();
      const parsedCalories = trimmedCalories ? Number(trimmedCalories) : null;
      if (trimmedCalories && (!Number.isInteger(parsedCalories) || (parsedCalories as number) < 0)) {
        setError('Calories must be a whole number of 0 or more.');
        setSaving(false);
        return;
      }

      await addActivityLog(clientId, {
        logDate: todayIso(),
        activityType,
        customLabel: activityType === 'custom' ? customLabel.trim() : null,
        durationMinutes: Math.round(parsedDuration),
        distance: parsedDistance,
        distanceUnit: parsedDistance !== null ? distanceUnit : null,
        calories: parsedCalories,
        notes: notes.trim() || null,
      });
      reset();
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to log that activity.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={handleClose}>
      <View style={styles.modalOverlay}>
        <ThemedView type="backgroundElement" style={styles.modalCard}>
          <ThemedText type="title" style={styles.modalTitle}>
            Log Activity
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary" style={styles.modalSubtitle}>
            Record a run, swim, ride and more
          </ThemedText>

          <ScrollView style={styles.scrollArea} keyboardShouldPersistTaps="handled">
          <ThemedText type="smallBold" style={styles.sectionLabel}>
            Activity type
          </ThemedText>
          <View style={styles.typeGrid}>
            {ACTIVITY_TYPES.map((type) => {
              const selected = activityType === type.key;
              return (
                <Pressable
                  key={type.key}
                  onPress={() => setActivityType(type.key)}
                  style={[styles.typeChip, { borderColor: theme.backgroundSelected }, selected && styles.typeChipSelected]}>
                  <Ionicons name={type.icon} size={16} color={selected ? Accent : theme.textSecondary} />
                  <ThemedText type="smallBold" style={selected ? styles.typeChipTextSelected : undefined}>
                    {type.label}
                  </ThemedText>
                </Pressable>
              );
            })}
            <Pressable
              onPress={() => setActivityType('custom')}
              style={[styles.typeChip, styles.customChip, activityType === 'custom' && styles.typeChipSelected]}>
              <ThemedText type="smallBold" style={styles.customChipText}>
                + Custom
              </ThemedText>
            </Pressable>
          </View>

          {activityType === 'custom' && (
            <TextInput
              value={customLabel}
              onChangeText={setCustomLabel}
              placeholder="e.g. Kickboxing"
              placeholderTextColor={theme.textSecondary}
              style={[styles.input, { color: theme.text, borderColor: theme.backgroundSelected }]}
            />
          )}

          <ThemedText type="smallBold" style={styles.sectionLabel}>
            Duration (minutes)
          </ThemedText>
          <TextInput
            value={duration}
            onChangeText={setDuration}
            placeholder="e.g. 45"
            placeholderTextColor={theme.textSecondary}
            keyboardType="number-pad"
            style={[styles.input, { color: theme.text, borderColor: theme.backgroundSelected }]}
          />

          <ThemedText type="smallBold" style={styles.sectionLabel}>
            Distance (optional)
          </ThemedText>
          <View style={styles.distanceRow}>
            <TextInput
              value={distance}
              onChangeText={setDistance}
              placeholder="e.g. 5.0"
              placeholderTextColor={theme.textSecondary}
              keyboardType="decimal-pad"
              style={[styles.input, styles.distanceInput, { color: theme.text, borderColor: theme.backgroundSelected }]}
            />
            <View style={styles.unitToggle}>
              <Pressable
                onPress={() => setDistanceUnit('km')}
                style={[styles.unitOption, distanceUnit === 'km' && styles.unitOptionActive]}>
                <ThemedText type="small" style={distanceUnit === 'km' ? styles.unitOptionTextActive : undefined}>
                  km
                </ThemedText>
              </Pressable>
              <Pressable
                onPress={() => setDistanceUnit('mi')}
                style={[styles.unitOption, distanceUnit === 'mi' && styles.unitOptionActive]}>
                <ThemedText type="small" style={distanceUnit === 'mi' ? styles.unitOptionTextActive : undefined}>
                  mi
                </ThemedText>
              </Pressable>
            </View>
          </View>

          <ThemedText type="smallBold" style={styles.sectionLabel}>
            Calories (optional)
          </ThemedText>
          <TextInput
            value={calories}
            onChangeText={setCalories}
            placeholder="e.g. 320"
            placeholderTextColor={theme.textSecondary}
            keyboardType="number-pad"
            style={[styles.input, { color: theme.text, borderColor: theme.backgroundSelected }]}
          />

          <ThemedText type="smallBold" style={styles.sectionLabel}>
            Notes (optional)
          </ThemedText>
          <TextInput
            value={notes}
            onChangeText={setNotes}
            placeholder="How did it go?"
            placeholderTextColor={theme.textSecondary}
            multiline
            style={[styles.input, styles.notesInput, { color: theme.text, borderColor: theme.backgroundSelected }]}
          />

          {error && <ThemedText style={styles.error}>{error}</ThemedText>}
          </ScrollView>

          <View style={styles.footer}>
            <Pressable style={styles.cancelButton} onPress={handleClose} disabled={saving}>
              <ThemedText themeColor="textSecondary">Cancel</ThemedText>
            </Pressable>
            <Pressable
              style={({ pressed }) => [styles.primaryButton, !canSave && styles.primaryButtonDisabled, pressed && styles.pressed]}
              onPress={handleSave}
              disabled={!canSave}>
              {saving ? (
                <ActivityIndicator color={Colors.text} />
              ) : (
                <ThemedText type="smallBold" style={styles.primaryButtonText}>
                  Save activity
                </ThemedText>
              )}
            </Pressable>
          </View>
        </ThemedView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: Spacing.four,
  },
  modalCard: {
    width: '100%',
    maxWidth: 400,
    maxHeight: '85%',
    borderRadius: Spacing.four,
    padding: Spacing.four,
    gap: Spacing.two,
  },
  scrollArea: {
    flex: 1,
  },
  modalTitle: {
    marginBottom: Spacing.half,
  },
  modalSubtitle: {
    marginBottom: Spacing.one,
  },
  sectionLabel: {
    marginTop: Spacing.two,
  },
  typeGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  typeChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
    borderWidth: 1,
    borderRadius: Spacing.two,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
  },
  typeChipSelected: {
    borderColor: Accent,
    backgroundColor: Colors.backgroundSelected,
  },
  typeChipTextSelected: {
    color: Accent,
  },
  customChip: {
    borderColor: Accent,
    borderStyle: 'dashed',
  },
  customChipText: {
    color: Accent,
  },
  distanceRow: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  distanceInput: {
    flex: 1,
  },
  unitToggle: {
    flexDirection: 'row',
    borderRadius: Spacing.two,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: Colors.backgroundSelected,
  },
  unitOption: {
    paddingHorizontal: Spacing.three,
    justifyContent: 'center',
  },
  unitOptionActive: {
    backgroundColor: Accent,
  },
  unitOptionTextActive: {
    color: Colors.text,
    fontWeight: '700',
  },
  input: {
    borderWidth: 1,
    borderRadius: Spacing.two,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.three,
    fontSize: 16,
  },
  notesInput: {
    minHeight: 70,
    textAlignVertical: 'top',
  },
  error: {
    color: Accent,
    textAlign: 'center',
    marginTop: Spacing.two,
  },
  footer: {
    flexDirection: 'row',
    gap: Spacing.three,
    marginTop: Spacing.three,
  },
  cancelButton: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing.three,
  },
  primaryButton: {
    flex: 1,
    ...Glow.oxblood,
    backgroundColor: Accent,
    borderRadius: Spacing.two,
    paddingVertical: Spacing.three,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryButtonDisabled: {
    opacity: 0.5,
  },
  pressed: {
    opacity: 0.85,
  },
  primaryButtonText: {
    color: Colors.text,
  },
});
