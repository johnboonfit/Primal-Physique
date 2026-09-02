import { router, useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { runOnJS, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Accent, Colors, Spacing } from '@/constants/theme';
import { listMyAssignments, rescheduleAssignment, type ClientAssignmentSummary } from '@/lib/assignments';
import { getPhaseForDate, listClientPhases, type ClientPhaseSummary } from '@/lib/programmes';

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

// Four visual states, derived from the same two pieces of data every
// screen already has (status + assigned_date) rather than a new column:
// "missed" isn't stored anywhere — it's just a still-pending session
// whose date has already passed, the identical definition the
// missed-workout auto-reschedule already uses for "overdue."
type VisualStatus = 'completed' | 'missed' | 'upcoming';

function getSessionVisualStatus(session: ClientAssignmentSummary, todayISO: string): VisualStatus {
  if (session.status === 'completed') return 'completed';
  return session.assignedDate < todayISO ? 'missed' : 'upcoming';
}

/** A day can hold more than one session — this picks the single state
 * worth flagging at a glance: a missed session anywhere that day wins
 * (most actionable), then an upcoming one, and only if every session
 * that day is done does the day read as fully completed. */
function getDayVisualStatus(daySessions: ClientAssignmentSummary[], todayISO: string): VisualStatus | 'rest' {
  if (daySessions.length === 0) return 'rest';
  const statuses = daySessions.map((s) => getSessionVisualStatus(s, todayISO));
  if (statuses.includes('missed')) return 'missed';
  if (statuses.includes('upcoming')) return 'upcoming';
  return 'completed';
}

// Upcoming gets no glyph at all — a plain, neutral session is the
// common case and shouldn't compete visually with the two states that
// actually need attention (or a quiet nod that something's done).
const STATUS_GLYPH: Record<VisualStatus, string | null> = {
  completed: '✓',
  missed: '⚑',
  upcoming: null,
};

const STATUS_GLYPH_COLOR: Record<VisualStatus, string> = {
  completed: Colors.tealBright,
  missed: Accent,
  upcoming: Colors.text,
};

const STATUS_TEXT_LABEL: Record<VisualStatus, string> = {
  completed: 'Completed',
  missed: 'Missed',
  upcoming: 'Upcoming',
};

function SessionLabel({ session, todayISO }: { session: ClientAssignmentSummary; todayISO: string }) {
  const status = getSessionVisualStatus(session, todayISO);
  const glyph = STATUS_GLYPH[status];
  return (
    <>
      <ThemedText type="small">
        {glyph && (
          <ThemedText type="small" style={{ color: STATUS_GLYPH_COLOR[status] }}>
            {glyph}{' '}
          </ThemedText>
        )}
        {session.workoutName}
      </ThemedText>
      <ThemedText
        type="small"
        themeColor={status === 'upcoming' ? 'textSecondary' : undefined}
        style={status === 'completed' ? styles.statusCompleted : status === 'missed' ? styles.statusMissed : undefined}>
        {STATUS_TEXT_LABEL[status]}
      </ThemedText>
    </>
  );
}

// Expo Router's typed routes need a literal pathname it can statically
// check, not an arbitrary interpolated string.
type DetailHref = { pathname: '/assigned/[id]' | '/assignments/[id]'; params: { id: string } };

type DraggableSessionRowProps = {
  session: ClientAssignmentSummary;
  originIndex: number;
  weekDays: Date[];
  dayRowRefs: React.RefObject<(View | null)[]>;
  todayISO: string;
  detailHref: (assignmentId: string) => DetailHref;
  onDragStateChange: (dayIndex: number | null) => void;
  onReschedule: (assignmentId: string, newDate: string) => void;
};

/** Long-press-then-drag, not a plain drag from touch-down — this is what
 * lets a normal vertical scroll of the week list coexist with dragging a
 * card, rather than every scroll attempt accidentally picking one up. A
 * quick tap (released before the long-press threshold) opens the
 * session's detail screen instead — Gesture.Race lets whichever gesture
 * actually activates first win, so the two never fight over the touch. */
function DraggableSessionRow({
  session,
  originIndex,
  weekDays,
  dayRowRefs,
  todayISO,
  detailHref,
  onDragStateChange,
  onReschedule,
}: DraggableSessionRowProps) {
  const translateY = useSharedValue(0);

  const handleDragStart = useCallback(() => {
    onDragStateChange(originIndex);
  }, [onDragStateChange, originIndex]);

  const handleDragEnd = useCallback(
    (absoluteY: number) => {
      const refs = dayRowRefs.current;
      Promise.all(
        refs.map(
          (node) =>
            new Promise<{ top: number; bottom: number } | null>((resolve) => {
              if (!node) {
                resolve(null);
                return;
              }
              node.measureInWindow((_x, y, _width, height) => resolve({ top: y, bottom: y + height }));
            })
        )
      ).then((bounds) => {
        const targetIndex = bounds.findIndex((b) => b !== null && absoluteY >= b.top && absoluteY < b.bottom);
        if (targetIndex !== -1 && targetIndex !== originIndex) {
          onReschedule(session.id, toISODate(weekDays[targetIndex]));
        }
        onDragStateChange(null);
      });
    },
    [dayRowRefs, originIndex, onReschedule, session.id, weekDays, onDragStateChange]
  );

  const handleOpenDetail = useCallback(() => {
    router.push(detailHref(session.id));
  }, [detailHref, session.id]);

  const pan = Gesture.Pan()
    .activateAfterLongPress(350)
    .onStart(() => {
      runOnJS(handleDragStart)();
    })
    .onUpdate((event) => {
      translateY.value = event.translationY;
    })
    .onEnd((event) => {
      runOnJS(handleDragEnd)(event.absoluteY);
    })
    .onFinalize(() => {
      translateY.value = withTiming(0, { duration: 200 });
    });

  const tap = Gesture.Tap().onEnd((_event, success) => {
    if (success) runOnJS(handleOpenDetail)();
  });

  const composedGesture = Gesture.Race(pan, tap);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
    zIndex: translateY.value !== 0 ? 10 : 0,
    shadowOpacity: translateY.value !== 0 ? 0.35 : 0,
  }));

  return (
    <GestureDetector gesture={composedGesture}>
      <Animated.View style={[styles.sessionRow, styles.draggableSessionRow, animatedStyle]}>
        <SessionLabel session={session} todayISO={todayISO} />
      </Animated.View>
    </GestureDetector>
  );
}

export type SessionCalendarProps = {
  /** Whose assignments this shows — the client's own id, whether the
   * viewer is that client themselves or a coach looking in. */
  clientId: string;
  /** Decides only which detail screen a tapped session opens: the
   * client's own logging flow (/assigned/[id]) or the coach's read-only
   * prescribed-vs-actual view (/assignments/[id]). Everything else —
   * the data, the drag/tap-to-move logic, the visual states — is
   * identical regardless of who's looking. */
  role: 'client' | 'coach';
};

/**
 * The real Week/Month calendar, reused as-is by both the client's own
 * Calendar tab and the coach's Programme Builder — same component, same
 * queries, same rescheduling function, just pointed at whichever
 * clientId the caller supplies. No screen chrome (title, SafeAreaView,
 * outer ScrollView) — that's the calling screen's job, so this can drop
 * into an existing scrollable page without nesting scroll containers.
 */
export function SessionCalendar({ clientId, role }: SessionCalendarProps) {
  const [assignments, setAssignments] = useState<ClientAssignmentSummary[]>([]);
  const [phases, setPhases] = useState<ClientPhaseSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [viewMode, setViewMode] = useState<ViewMode>('week');
  const [referenceDate, setReferenceDate] = useState<Date>(todayUTC());
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [activeDragDayIndex, setActiveDragDayIndex] = useState<number | null>(null);
  const [movingSession, setMovingSession] = useState<{ id: string; workoutName: string; fromDate: string } | null>(
    null
  );

  const dayRowRefs = useRef<(View | null)[]>([null, null, null, null, null, null, null]);

  // Expo Router's typed routes want a literal pathname it can statically
  // check, not an arbitrary interpolated string — the {pathname, params}
  // object form is the type-safe way to build a dynamic route href.
  const detailHref = useCallback(
    (assignmentId: string) =>
      role === 'client'
        ? ({ pathname: '/assigned/[id]', params: { id: assignmentId } } as const)
        : ({ pathname: '/assignments/[id]', params: { id: assignmentId } } as const),
    [role]
  );

  const load = useCallback(() => {
    setLoading(true);
    Promise.all([listMyAssignments(clientId), listClientPhases(clientId)])
      .then(([assignmentData, phaseData]) => {
        setAssignments(assignmentData);
        setPhases(phaseData);
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load this calendar.'))
      .finally(() => setLoading(false));
  }, [clientId]);

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

  /**
   * Updates local state immediately so the calendar reflects the move
   * without waiting on the network, then persists it — this is the same
   * function both week-view drag and month-view tap-to-move call, so
   * there's exactly one place that decides what "moving a session"
   * means. If the save fails, reloads from the server so the screen
   * never keeps showing a move that didn't actually stick.
   */
  const handleReschedule = useCallback(
    (assignmentId: string, newDate: string) => {
      setAssignments((current) =>
        current.map((a) => (a.id === assignmentId ? { ...a, assignedDate: newDate } : a))
      );
      rescheduleAssignment(assignmentId, newDate).catch((err) => {
        setError(err instanceof Error ? err.message : 'Failed to move that session — reloading.');
        load();
      });
    },
    [load]
  );

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
    setMovingSession(null);
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

  // referenceDate always sits inside whichever period is currently
  // shown (it's what weekDays/monthDays are derived from), so it's the
  // one consistent point to ask "which phase covers this?" regardless
  // of view mode — this is what makes the label update correctly as
  // the client (or coach) navigates through weeks or months.
  const phaseInfo = useMemo(() => getPhaseForDate(phases, toISODate(referenceDate)), [phases, referenceDate]);

  const headerLabel =
    viewMode === 'week'
      ? `${weekDays[0].toLocaleDateString(undefined, { timeZone: 'UTC', month: 'short', day: 'numeric' })} – ${weekDays[6].toLocaleDateString(undefined, { timeZone: 'UTC', month: 'short', day: 'numeric', year: 'numeric' })}`
      : referenceDate.toLocaleDateString(undefined, { timeZone: 'UTC', month: 'long', year: 'numeric' });

  const handleMonthCellPress = (dateISO: string) => {
    if (movingSession) {
      if (dateISO !== movingSession.fromDate) {
        handleReschedule(movingSession.id, dateISO);
        setSelectedDate(dateISO);
      }
      setMovingSession(null);
      return;
    }
    setSelectedDate((current) => (current === dateISO ? null : dateISO));
  };

  return (
    <View style={styles.root}>
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

      {phaseInfo && (
        <ThemedText type="smallBold" style={styles.phaseLabel}>
          Phase {phaseInfo.phaseNumber} — Week {phaseInfo.weekNumber}/{phaseInfo.durationWeeks}
        </ThemedText>
      )}

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
        <>
          <ThemedText type="small" themeColor="textSecondary" style={styles.dragHint}>
            Tap a session to view it, or press and hold to drag it to a different day.
          </ThemedText>
          <View style={styles.weekList}>
            {weekDays.map((day, dayIndex) => {
              const dateISO = toISODate(day);
              const daySessions = sessionsByDate.get(dateISO) ?? [];
              const isToday = dateISO === todayISO;
              return (
                <ThemedView
                  key={dateISO}
                  ref={(node) => {
                    dayRowRefs.current[dayIndex] = node;
                  }}
                  type="backgroundElement"
                  style={[styles.weekDayCard, activeDragDayIndex === dayIndex && styles.weekDayCardElevated]}>
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
                    daySessions.map((sessionItem) => (
                      <DraggableSessionRow
                        key={sessionItem.id}
                        session={sessionItem}
                        originIndex={dayIndex}
                        weekDays={weekDays}
                        dayRowRefs={dayRowRefs}
                        todayISO={todayISO}
                        detailHref={detailHref}
                        onDragStateChange={setActiveDragDayIndex}
                        onReschedule={handleReschedule}
                      />
                    ))
                  )}
                </ThemedView>
              );
            })}
          </View>
        </>
      )}

      {!loading && !error && viewMode === 'month' && (
        <>
          {movingSession && (
            <View style={styles.movingBanner}>
              <ThemedText type="small" style={styles.movingBannerText}>
                Moving "{movingSession.workoutName}" — tap a day to move it there.
              </ThemedText>
              <Pressable onPress={() => setMovingSession(null)}>
                <ThemedText type="smallBold" style={styles.movingBannerCancel}>
                  Cancel
                </ThemedText>
              </Pressable>
            </View>
          )}

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
              const dayStatus = getDayVisualStatus(daySessions, todayISO);
              const dayGlyph = dayStatus === 'rest' ? null : STATUS_GLYPH[dayStatus];
              const isCurrentMonth = day.getUTCMonth() === currentMonthIndex;
              const isToday = dateISO === todayISO;
              const isSelected = dateISO === selectedDate;
              return (
                <Pressable key={dateISO} style={styles.monthCellWrap} onPress={() => handleMonthCellPress(dateISO)}>
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
                    {dayGlyph && (
                      <ThemedText
                        type="small"
                        style={[styles.monthStatusGlyph, { color: STATUS_GLYPH_COLOR[dayStatus as VisualStatus] }]}>
                        {dayGlyph}
                      </ThemedText>
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
                (sessionsByDate.get(selectedDate) ?? []).map((sessionItem) => (
                  <View key={sessionItem.id} style={styles.sessionRow}>
                    <Pressable style={styles.sessionLabelWrap} onPress={() => router.push(detailHref(sessionItem.id))}>
                      <SessionLabel session={sessionItem} todayISO={todayISO} />
                    </Pressable>
                    <Pressable
                      onPress={() =>
                        setMovingSession({
                          id: sessionItem.id,
                          workoutName: sessionItem.workoutName,
                          fromDate: selectedDate,
                        })
                      }
                      style={styles.moveLink}>
                      <ThemedText type="small" style={styles.moveLinkText}>
                        Move
                      </ThemedText>
                    </Pressable>
                  </View>
                ))
              )}
            </ThemedView>
          )}
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    gap: Spacing.two,
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
  phaseLabel: {
    textAlign: 'center',
  },
  navRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: Spacing.one,
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
  dragHint: {
    textAlign: 'center',
    marginTop: Spacing.two,
  },
  weekList: {
    gap: Spacing.two,
    marginTop: Spacing.one,
  },
  weekDayCard: {
    borderRadius: Spacing.two,
    padding: Spacing.three,
    gap: Spacing.one,
  },
  weekDayCardElevated: {
    zIndex: 20,
    elevation: 20,
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
  draggableSessionRow: {
    backgroundColor: Colors.backgroundElement,
    borderRadius: Spacing.one,
    paddingHorizontal: Spacing.one,
    paddingVertical: 2,
    shadowColor: Colors.oxblood,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 8,
  },
  statusCompleted: {
    color: Colors.tealBright,
  },
  statusMissed: {
    color: Accent,
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
  monthStatusGlyph: {
    fontSize: 12,
    lineHeight: 14,
  },
  selectedDayCard: {
    borderRadius: Spacing.two,
    padding: Spacing.three,
    gap: Spacing.one,
    marginTop: Spacing.two,
  },
  sessionLabelWrap: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  moveLink: {
    paddingLeft: Spacing.two,
  },
  moveLinkText: {
    color: Accent,
  },
  movingBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: Colors.backgroundSelected,
    borderRadius: Spacing.two,
    padding: Spacing.three,
    marginTop: Spacing.two,
    gap: Spacing.two,
  },
  movingBannerText: {
    flex: 1,
  },
  movingBannerCancel: {
    color: Accent,
  },
});
