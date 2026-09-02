import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ConfirmDialog } from '@/components/confirm-dialog';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Accent, Colors, Spacing } from '@/constants/theme';
import { getClient, type ClientSummary } from '@/lib/clients';
import { deleteFoodLog, listFoodLogHistory, type DailyFoodLog } from '@/lib/food-logs';
import { archiveFormAssignment, listClientFormAssignments, type ClientFormAssignment } from '@/lib/form-assignments';
import {
  archiveOrDeleteCheckIn,
  listClientCheckInInstances,
  type ClientCheckInInstance,
} from '@/lib/form-check-ins';
import { getClientProgramme, GOAL_TYPES, SCHEDULED_DAYS, type ClientProgrammeView } from '@/lib/programmes';
import { getCalorieTarget, type CalorieTarget } from '@/lib/tdee';

type PendingAction =
  | { kind: 'cancel-schedule'; id: string; formName: string }
  | { kind: 'remove-checkin'; id: string; formName: string; scheduledDate: string; status: ClientCheckInInstance['status'] };

const CHECK_IN_STATUS_LABEL: Record<ClientCheckInInstance['status'], string> = {
  pending: 'Pending',
  completed: 'Completed',
  missed: 'Missed',
};

const HISTORY_DAYS = 14;

function round(value: number) {
  return Math.round(value * 10) / 10;
}

function goalLabel(goalType: CalorieTarget['goalType']) {
  if (!goalType) return 'Maintenance';
  return GOAL_TYPES.find((g) => g.key === goalType)?.label ?? goalType;
}

function dayLabel(day: ClientFormAssignment['recurrenceDay']) {
  return SCHEDULED_DAYS.find((d) => d.key === day)?.label ?? day;
}

function targetDeltaLabel(totalCalories: number, targetCalories: number) {
  const delta = Math.round(targetCalories - totalCalories);
  if (delta === 0) return 'right on target';
  return delta > 0 ? `${delta} under target` : `${Math.abs(delta)} over target`;
}

export default function ClientDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();

  const [client, setClient] = useState<ClientSummary | null>(null);
  const [history, setHistory] = useState<DailyFoodLog[]>([]);
  const [target, setTarget] = useState<CalorieTarget | null>(null);
  const [programme, setProgramme] = useState<ClientProgrammeView | null>(null);
  const [formAssignments, setFormAssignments] = useState<ClientFormAssignment[]>([]);
  const [checkInInstances, setCheckInInstances] = useState<ClientCheckInInstance[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const [pendingAction, setPendingAction] = useState<PendingAction | null>(null);
  const [actioning, setActioning] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const load = useCallback(() => {
    if (!id) return;
    setLoading(true);
    Promise.all([
      getClient(id),
      listFoodLogHistory(id, HISTORY_DAYS),
      getCalorieTarget(id),
      getClientProgramme(id),
      listClientFormAssignments(id),
      listClientCheckInInstances(id),
    ])
      .then(([clientData, historyData, targetData, programmeData, formAssignmentData, checkInInstanceData]) => {
        setClient(clientData);
        setHistory(historyData);
        setTarget(targetData);
        setProgramme(programmeData);
        setFormAssignments(formAssignmentData);
        setCheckInInstances(checkInInstanceData);
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load this client's details."))
      .finally(() => setLoading(false));
  }, [id]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const handleDelete = async (logId: string) => {
    setDeletingId(logId);
    try {
      await deleteFoodLog(logId);
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete that entry.');
    } finally {
      setDeletingId(null);
    }
  };

  const handleConfirmAction = async () => {
    if (!pendingAction) return;
    setActionError(null);
    setActioning(true);
    try {
      if (pendingAction.kind === 'cancel-schedule') {
        await archiveFormAssignment(pendingAction.id);
      } else {
        await archiveOrDeleteCheckIn(pendingAction.id);
      }
      setPendingAction(null);
      load();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Something went wrong.');
    } finally {
      setActioning(false);
    }
  };

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <Pressable onPress={() => router.back()} style={styles.backButton}>
          <ThemedText type="linkPrimary">Back</ThemedText>
        </Pressable>

        {loading && <ActivityIndicator style={styles.loader} />}
        {!loading && error && <ThemedText style={styles.error}>{error}</ThemedText>}

        {!loading && !error && client && (
          <ScrollView contentContainerStyle={styles.scrollContent}>
            <ThemedText type="title" style={styles.title}>
              {client.fullName || client.email}
            </ThemedText>
            {client.fullName && (
              <ThemedText type="small" themeColor="textSecondary">
                {client.email}
              </ThemedText>
            )}

            <ThemedText type="smallBold" style={styles.sectionLabel}>
              Programme
            </ThemedText>

            {programme ? (
              <Pressable onPress={() => router.push(`/programmes/${programme.id}`)}>
                <ThemedView type="backgroundElement" style={styles.programmeCard}>
                  <ThemedText type="smallBold">{programme.name}</ThemedText>
                  <ThemedText type="small" themeColor="textSecondary">
                    Week {programme.currentWeekNumber}/{programme.durationWeeks} · View programme &amp; calendar →
                  </ThemedText>
                </ThemedView>
              </Pressable>
            ) : (
              <ThemedText type="small" themeColor="textSecondary">
                No programme assigned yet.
              </ThemedText>
            )}

            <ThemedText type="smallBold" style={styles.sectionLabel}>
              Check-in Schedule
            </ThemedText>

            {actionError && <ThemedText style={styles.error}>{actionError}</ThemedText>}

            {formAssignments.length === 0 ? (
              <ThemedText type="small" themeColor="textSecondary">
                No recurring check-ins assigned yet.
              </ThemedText>
            ) : (
              formAssignments.map((assignment) => (
                <ThemedView key={assignment.id} type="backgroundElement" style={styles.scheduleCard}>
                  <ThemedText type="smallBold">{assignment.formName}</ThemedText>
                  <ThemedText type="small" themeColor="textSecondary">
                    Weekly on {dayLabel(assignment.recurrenceDay)} · due within {assignment.dueWindowHours}h
                  </ThemedText>
                  <View style={styles.cardActions}>
                    <Pressable
                      onPress={() =>
                        setPendingAction({ kind: 'cancel-schedule', id: assignment.id, formName: assignment.formName })
                      }>
                      <ThemedText type="small" style={styles.removeText}>
                        Cancel schedule
                      </ThemedText>
                    </Pressable>
                  </View>
                </ThemedView>
              ))
            )}

            {checkInInstances.length > 0 && (
              <>
                <ThemedText type="small" themeColor="textSecondary" style={styles.checkInInstancesLabel}>
                  Individual check-ins
                </ThemedText>
                {checkInInstances.map((instance) => (
                  <ThemedView key={instance.id} type="backgroundElement" style={styles.checkInInstanceCard}>
                    <View style={styles.checkInInstanceInfo}>
                      <ThemedText type="small">{instance.formName}</ThemedText>
                      <ThemedText type="small" themeColor="textSecondary">
                        {instance.scheduledDate} · {CHECK_IN_STATUS_LABEL[instance.status]}
                      </ThemedText>
                    </View>
                    <Pressable
                      onPress={() =>
                        setPendingAction({
                          kind: 'remove-checkin',
                          id: instance.id,
                          formName: instance.formName,
                          scheduledDate: instance.scheduledDate,
                          status: instance.status,
                        })
                      }>
                      <ThemedText type="small" style={styles.removeText}>
                        Remove
                      </ThemedText>
                    </Pressable>
                  </ThemedView>
                ))}
              </>
            )}

            <ThemedText type="smallBold" style={styles.sectionLabel}>
              Nutrition
            </ThemedText>

            <ThemedView type="backgroundElement" style={styles.targetCard}>
              {target ? (
                <>
                  <ThemedText type="smallBold">Current target: {Math.round(target.targetCalories)} kcal/day</ThemedText>
                  <ThemedText type="small" themeColor="textSecondary">
                    {goalLabel(target.goalType)}
                    {target.goalType && target.modifierPercent !== 0
                      ? ` (${target.modifierPercent > 0 ? '+' : ''}${round(target.modifierPercent)}% of TDEE)`
                      : ''}
                    {' · TDEE '}
                    {Math.round(target.estimatedTdee)} kcal · calculated {target.calculatedDate}
                  </ThemedText>
                </>
              ) : (
                <ThemedText type="small" themeColor="textSecondary">
                  No TDEE estimate yet — needs at least 7 of the last 14 days logged for both weight and food.
                </ThemedText>
              )}
            </ThemedView>

            {history.length === 0 && (
              <ThemedText themeColor="textSecondary" style={styles.empty}>
                No food logged in the last {HISTORY_DAYS} days.
              </ThemedText>
            )}

            {history.map((day) => (
              <ThemedView key={day.logDate} type="backgroundElement" style={styles.dayCard}>
                <ThemedView style={styles.dayHeader}>
                  <ThemedText type="smallBold">{day.logDate}</ThemedText>
                  <ThemedText type="small" themeColor="textSecondary">
                    {Math.round(day.totalCalories)} kcal
                    {target ? ` · ${targetDeltaLabel(day.totalCalories, target.targetCalories)}` : ''}
                  </ThemedText>
                </ThemedView>
                <ThemedText type="small" themeColor="textSecondary">
                  {round(day.totalProtein)}g protein · {round(day.totalCarbs)}g carbs · {round(day.totalFat)}g fat
                </ThemedText>

                {day.entries.map((entry) => (
                  <ThemedView key={entry.id} style={styles.entryRow}>
                    <ThemedView style={styles.entryInfo}>
                      <ThemedText type="small">{entry.foodName}</ThemedText>
                      <ThemedText type="small" themeColor="textSecondary">
                        {round(entry.quantityGrams)}g · {Math.round(entry.calories)} cal
                      </ThemedText>
                    </ThemedView>
                    <Pressable onPress={() => handleDelete(entry.id)} disabled={deletingId === entry.id}>
                      {deletingId === entry.id ? (
                        <ActivityIndicator size="small" color={Accent} />
                      ) : (
                        <ThemedText type="small" style={styles.deleteText}>
                          Delete
                        </ThemedText>
                      )}
                    </Pressable>
                  </ThemedView>
                ))}
              </ThemedView>
            ))}
          </ScrollView>
        )}
      </SafeAreaView>

      <ConfirmDialog
        visible={pendingAction !== null}
        title={pendingAction?.kind === 'cancel-schedule' ? 'Cancel this schedule?' : 'Remove this check-in?'}
        message={
          pendingAction?.kind === 'cancel-schedule'
            ? `Stops new weekly check-ins for "${pendingAction.formName}" from being created. Any check-ins already generated aren't affected.`
            : pendingAction?.kind === 'remove-checkin'
              ? pendingAction.status === 'pending'
                ? `"${pendingAction.formName}" (${pendingAction.scheduledDate}) hasn't been submitted yet, so it will be permanently deleted.`
                : `"${pendingAction.formName}" (${pendingAction.scheduledDate}) is already ${CHECK_IN_STATUS_LABEL[pendingAction.status].toLowerCase()} — it will be archived, not deleted, so it still counts toward Compliance Score / On Time-Late tracking.`
              : ''
        }
        confirmLabel={pendingAction?.kind === 'cancel-schedule' ? 'Cancel schedule' : 'Remove'}
        busy={actioning}
        onConfirm={handleConfirmAction}
        onCancel={() => setPendingAction(null)}
      />
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  safeArea: { flex: 1, paddingHorizontal: Spacing.four, paddingTop: Spacing.four },
  backButton: {
    marginBottom: Spacing.two,
  },
  loader: {
    marginTop: Spacing.five,
  },
  error: {
    color: Accent,
    textAlign: 'center',
    marginTop: Spacing.five,
  },
  scrollContent: {
    gap: Spacing.two,
    paddingBottom: Spacing.four,
  },
  title: {
    fontSize: 32,
    lineHeight: 38,
  },
  sectionLabel: {
    marginTop: Spacing.three,
  },
  programmeCard: {
    borderRadius: Spacing.two,
    padding: Spacing.three,
    gap: Spacing.half,
  },
  scheduleCard: {
    borderRadius: Spacing.two,
    padding: Spacing.three,
    gap: Spacing.half,
    marginTop: Spacing.half,
  },
  cardActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
  },
  removeText: {
    color: Colors.textSecondary,
  },
  checkInInstancesLabel: {
    marginTop: Spacing.two,
  },
  checkInInstanceCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderRadius: Spacing.two,
    padding: Spacing.three,
    marginTop: Spacing.half,
    gap: Spacing.two,
  },
  checkInInstanceInfo: {
    flex: 1,
    gap: Spacing.half,
  },
  targetCard: {
    borderRadius: Spacing.two,
    padding: Spacing.three,
    gap: Spacing.half,
  },
  empty: {
    textAlign: 'center',
    marginTop: Spacing.three,
  },
  dayCard: {
    borderRadius: Spacing.two,
    padding: Spacing.three,
    gap: Spacing.half,
  },
  dayHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: 'transparent',
  },
  entryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: Spacing.half,
    backgroundColor: 'transparent',
  },
  entryInfo: {
    flex: 1,
    gap: Spacing.half,
    backgroundColor: 'transparent',
  },
  deleteText: {
    color: Colors.textSecondary,
  },
});
