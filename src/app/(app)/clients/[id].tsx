import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Accent, Colors, Spacing } from '@/constants/theme';
import { getClient, type ClientSummary } from '@/lib/clients';
import { deleteFoodLog, listFoodLogHistory, type DailyFoodLog } from '@/lib/food-logs';
import { listClientFormAssignments, type ClientFormAssignment } from '@/lib/form-assignments';
import { getClientProgramme, GOAL_TYPES, SCHEDULED_DAYS, type ClientProgrammeView } from '@/lib/programmes';
import { getCalorieTarget, type CalorieTarget } from '@/lib/tdee';

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
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const load = useCallback(() => {
    if (!id) return;
    setLoading(true);
    Promise.all([
      getClient(id),
      listFoodLogHistory(id, HISTORY_DAYS),
      getCalorieTarget(id),
      getClientProgramme(id),
      listClientFormAssignments(id),
    ])
      .then(([clientData, historyData, targetData, programmeData, formAssignmentData]) => {
        setClient(clientData);
        setHistory(historyData);
        setTarget(targetData);
        setProgramme(programmeData);
        setFormAssignments(formAssignmentData);
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
                </ThemedView>
              ))
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
