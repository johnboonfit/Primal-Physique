import { useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Accent, Colors, Spacing } from '@/constants/theme';
import { useAuth } from '@/context/auth-context';
import { listMyAssignments, type ClientAssignmentSummary } from '@/lib/assignments';

type ViewMode = 'week' | 'month';

function toISODate(date: Date) {
  return date.toISOString().slice(0, 10);
}

function addDays(date: Date, days: number) {
  const copy = new Date(date);
  copy.setUTCDate(copy.getUTCDate() + days);
  return copy;
}

function addMonths(date: Date, months: number) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + months, 1));
}

function todayUTC() {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

/** Monday of the week containing `date` — same Monday-start week the
 * rest of the app already uses (Momentum Score, the missed-workout
 * auto-reschedule), so "this week" means the same thing everywhere. */
function startOfWeek(date: Date) {
  const day = date.getUTCDay(); // 0 = Sunday .. 6 = Saturday
  const diffToMonday = day === 0 ? -6 : 1 - day;
  return addDays(date, diffToMonday);
}

function endOfWeek(date: Date) {
  const day = date.getUTCDay();
  const diffToSunday = day === 0 ? 0 : 7 - day;
  return addDays(date, diffToSunday);
}

function startOfMonth(date: Date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
}

function endOfMonth(date: Date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0));
}

function weekdayShortLabel(date: Date) {
  return date.toLocaleDateString(undefined, { timeZone: 'UTC', weekday: 'short' });
}

function dayNumberLabel(date: Date) {
  return date.toLocaleDateString(undefined, { timeZone: 'UTC', day: 'numeric' });
}

const STATUS_LABEL: Record<ClientAssignmentSummary['status'], string> = {
  pending: 'Pending',
  completed: 'Completed',
};

export default function CalendarScreen() {
  const { session } = useAuth();

  const [assignments, setAssignments] = useState<ClientAssignmentSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [viewMode, setViewMode] = useState<ViewMode>('week');
  const [referenceDate, setReferenceDate] = useState<Date>(todayUTC());
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  const load = useCallback(() => {
    if (!session) return;
    setLoading(true);
    listMyAssignments(session.user.id)
      .then(setAssignments)
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load your calendar.'))
      .finally(() => setLoading(false));
  }, [session]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  // One query, grouped client-side by date — same "fetch once, slice
  // locally" approach the Metrics/Measure sub-tabs already use, rather
  // than re-querying every time the visible week/month changes.
  const sessionsByDate = useMemo(() => {
    const map = new Map<string, ClientAssignmentSummary[]>();
    for (const assignment of assignments) {
      const existing = map.get(assignment.assignedDate);
      if (existing) existing.push(assignment);
      else map.set(assignment.assignedDate, [assignment]);
    }
    return map;
  }, [assignments]);

  const todayISO = toISODate(todayUTC());

  const handlePrev = () => {
    setReferenceDate((current) => (viewMode === 'week' ? addDays(current, -7) : addMonths(current, -1)));
  };
  const handleNext = () => {
    setReferenceDate((current) => (viewMode === 'week' ? addDays(current, 7) : addMonths(current, 1)));
  };
  const handleToday = () => {
    setReferenceDate(todayUTC());
    setSelectedDate(null);
  };
  const handleSetViewMode = (mode: ViewMode) => {
    setViewMode(mode);
    setSelectedDate(null);
  };

  const weekStart = useMemo(() => startOfWeek(referenceDate), [referenceDate]);
  const weekDays = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)), [weekStart]);

  const monthDays = useMemo(() => {
    const gridStart = startOfWeek(startOfMonth(referenceDate));
    const gridEnd = endOfWeek(endOfMonth(referenceDate));
    const days: Date[] = [];
    let cursor = gridStart;
    while (cursor.getTime() <= gridEnd.getTime()) {
      days.push(cursor);
      cursor = addDays(cursor, 1);
    }
    return days;
  }, [referenceDate]);

  const currentMonthIndex = referenceDate.getUTCMonth();

  const headerLabel =
    viewMode === 'week'
      ? `${weekDays[0].toLocaleDateString(undefined, { timeZone: 'UTC', month: 'short', day: 'numeric' })} – ${weekDays[6].toLocaleDateString(undefined, { timeZone: 'UTC', month: 'short', day: 'numeric', year: 'numeric' })}`
      : referenceDate.toLocaleDateString(undefined, { timeZone: 'UTC', month: 'long', year: 'numeric' });

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <ScrollView contentContainerStyle={styles.scrollContent}>
          <ThemedText type="title" style={styles.title}>
            Calendar
          </ThemedText>

          <View style={styles.viewModeRow}>
            {(['week', 'month'] as ViewMode[]).map((mode) => (
              <Pressable key={mode} onPress={() => handleSetViewMode(mode)} style={styles.viewModeChipWrap}>
                <View style={[styles.viewModeChip, viewMode === mode && styles.viewModeChipActive]}>
                  <ThemedText type="small" style={viewMode === mode ? styles.viewModeChipActiveText : styles.viewModeChipText}>
                    {mode === 'week' ? 'Week' : 'Month'}
                  </ThemedText>
                </View>
              </Pressable>
            ))}
          </View>

          <View style={styles.navRow}>
            <Pressable onPress={handlePrev} style={styles.navButton}>
              <ThemedText type="smallBold" style={styles.navButtonText}>
                ‹
              </ThemedText>
            </Pressable>
            <Pressable onPress={handleToday} style={styles.navLabelWrap}>
              <ThemedText type="smallBold" style={styles.navLabel}>
                {headerLabel}
              </ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                Tap to jump to today
              </ThemedText>
            </Pressable>
            <Pressable onPress={handleNext} style={styles.navButton}>
              <ThemedText type="smallBold" style={styles.navButtonText}>
                ›
              </ThemedText>
            </Pressable>
          </View>

          {loading && <ActivityIndicator style={styles.loader} />}
          {!loading && error && <ThemedText style={styles.error}>{error}</ThemedText>}

          {!loading && !error && viewMode === 'week' && (
            <View style={styles.weekList}>
              {weekDays.map((day) => {
                const dateISO = toISODate(day);
                const daySessions = sessionsByDate.get(dateISO) ?? [];
                const isToday = dateISO === todayISO;
                return (
                  <ThemedView key={dateISO} type="backgroundElement" style={styles.weekDayCard}>
                    <View style={styles.weekDayHeader}>
                      <ThemedText type="smallBold" style={isToday ? styles.todayText : undefined}>
                        {weekdayShortLabel(day)} {dayNumberLabel(day)}
                        {isToday ? ' · Today' : ''}
                      </ThemedText>
                    </View>
                    {daySessions.length === 0 ? (
                      <ThemedText type="small" themeColor="textSecondary">
                        Nothing scheduled.
                      </ThemedText>
                    ) : (
                      daySessions.map((session) => (
                        <View key={session.id} style={styles.sessionRow}>
                          <ThemedText type="small">{session.workoutName}</ThemedText>
                          <ThemedText
                            type="small"
                            themeColor={session.status === 'completed' ? undefined : 'textSecondary'}
                            style={session.status === 'completed' ? styles.statusCompleted : undefined}>
                            {STATUS_LABEL[session.status]}
                          </ThemedText>
                        </View>
                      ))
                    )}
                  </ThemedView>
                );
              })}
            </View>
          )}

          {!loading && !error && viewMode === 'month' && (
            <>
              <View style={styles.monthWeekdayRow}>
                {weekDays.map((day) => (
                  <ThemedText key={day.getUTCDay()} type="small" themeColor="textSecondary" style={styles.monthWeekdayLabel}>
                    {weekdayShortLabel(day)}
                  </ThemedText>
                ))}
              </View>

              <View style={styles.monthGrid}>
                {monthDays.map((day) => {
                  const dateISO = toISODate(day);
                  const daySessions = sessionsByDate.get(dateISO) ?? [];
                  const isCurrentMonth = day.getUTCMonth() === currentMonthIndex;
                  const isToday = dateISO === todayISO;
                  const isSelected = dateISO === selectedDate;
                  return (
                    <Pressable
                      key={dateISO}
                      style={styles.monthCellWrap}
                      onPress={() => setSelectedDate(isSelected ? null : dateISO)}>
                      <View
                        style={[
                          styles.monthCell,
                          isToday && styles.monthCellToday,
                          isSelected && styles.monthCellSelected,
                        ]}>
                        <ThemedText
                          type="small"
                          themeColor={isCurrentMonth ? undefined : 'textSecondary'}
                          style={!isCurrentMonth ? styles.monthCellOutside : undefined}>
                          {dayNumberLabel(day)}
                        </ThemedText>
                        {daySessions.length > 0 && (
                          <View style={styles.monthDotRow}>
                            <View style={styles.monthDot} />
                            {daySessions.length > 1 && (
                              <ThemedText type="small" themeColor="textSecondary" style={styles.monthDotCount}>
                                {daySessions.length}
                              </ThemedText>
                            )}
                          </View>
                        )}
                      </View>
                    </Pressable>
                  );
                })}
              </View>

              {selectedDate && (
                <ThemedView type="backgroundElement" style={styles.selectedDayCard}>
                  <ThemedText type="smallBold">{selectedDate}</ThemedText>
                  {(sessionsByDate.get(selectedDate) ?? []).length === 0 ? (
                    <ThemedText type="small" themeColor="textSecondary">
                      Nothing scheduled.
                    </ThemedText>
                  ) : (
                    (sessionsByDate.get(selectedDate) ?? []).map((session) => (
                      <View key={session.id} style={styles.sessionRow}>
                        <ThemedText type="small">{session.workoutName}</ThemedText>
                        <ThemedText
                          type="small"
                          themeColor={session.status === 'completed' ? undefined : 'textSecondary'}
                          style={session.status === 'completed' ? styles.statusCompleted : undefined}>
                          {STATUS_LABEL[session.status]}
                        </ThemedText>
                      </View>
                    ))
                  )}
                </ThemedView>
              )}
            </>
          )}
        </ScrollView>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  safeArea: { flex: 1, paddingHorizontal: Spacing.four, paddingTop: Spacing.four },
  scrollContent: {
    gap: Spacing.two,
    paddingBottom: Spacing.four,
  },
  title: {
    marginBottom: Spacing.two,
  },
  viewModeRow: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  viewModeChipWrap: {
    flex: 1,
  },
  viewModeChip: {
    borderRadius: 999,
    paddingVertical: Spacing.one,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.backgroundElement,
  },
  viewModeChipActive: {
    backgroundColor: Accent,
  },
  viewModeChipText: {
    color: Colors.textSecondary,
  },
  viewModeChipActiveText: {
    color: Colors.text,
  },
  navRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: Spacing.two,
  },
  navButton: {
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
  },
  navButtonText: {
    fontSize: 24,
  },
  navLabelWrap: {
    flex: 1,
    alignItems: 'center',
  },
  navLabel: {
    textAlign: 'center',
  },
  loader: {
    marginTop: Spacing.four,
  },
  error: {
    color: Accent,
    textAlign: 'center',
    marginTop: Spacing.four,
  },
  weekList: {
    gap: Spacing.two,
    marginTop: Spacing.two,
  },
  weekDayCard: {
    borderRadius: Spacing.two,
    padding: Spacing.three,
    gap: Spacing.one,
  },
  weekDayHeader: {
    marginBottom: Spacing.half,
  },
  todayText: {
    color: Accent,
  },
  sessionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  statusCompleted: {
    color: Colors.tealBright,
  },
  monthWeekdayRow: {
    flexDirection: 'row',
    marginTop: Spacing.two,
  },
  monthWeekdayLabel: {
    flexBasis: '14.28%',
    textAlign: 'center',
  },
  monthGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  monthCellWrap: {
    flexBasis: '14.28%',
    aspectRatio: 1,
    padding: 2,
  },
  monthCell: {
    flex: 1,
    borderRadius: Spacing.one,
    backgroundColor: Colors.backgroundElement,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  monthCellToday: {
    borderWidth: 1,
    borderColor: Accent,
  },
  monthCellSelected: {
    backgroundColor: Colors.backgroundSelected,
  },
  monthCellOutside: {
    opacity: 0.5,
  },
  monthDotRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  monthDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: Colors.tealBright,
  },
  monthDotCount: {
    fontSize: 10,
  },
  selectedDayCard: {
    borderRadius: Spacing.two,
    padding: Spacing.three,
    gap: Spacing.one,
    marginTop: Spacing.two,
  },
});
