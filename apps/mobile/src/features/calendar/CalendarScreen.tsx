import { addDays, format, parseISO } from "date-fns";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import {
  reorderPreviewEntryKeys,
  unitEntryKey,
} from "@cadence/shared/planner/reorder-preview-entries";
import { getApiErrorMessage } from "@cadence/shared/api-client";
import { normalizeWeekStartsOn } from "@cadence/shared/dates/week-start";
import { buildMonthCells } from "@cadence/shared/planner/month-cells";
import type { PlannerWorkUnit } from "@cadence/shared/planner/context";
import { api } from "../../lib/api";
import { useCalendarStore } from "../../store/calendar-state";
import { useTheme } from "../../theme";
import { PrimaryButton } from "../../ui/button";
import { LoadingScreen, Screen } from "../../ui/screen";
import { CoachPanel } from "./CoachPanel";
import { CalendarPartnerReadOnlySection } from "./CalendarPartnerReadOnlySection";
import { useDuo, useDuoSurfaceScope } from "../duo/DuoProvider";
import { DuoScopeSegmentedControl } from "../duo/DuoScopeSegmentedControl";
import { useReportMobileDuoScopeViewed } from "../duo/telemetry";
import {
  buildCalendarMonthCellAccessibilityLabel,
  buildCalendarMonthMarkerModel,
  buildPartnerMarkerAccessibilityLabel,
  resolveCalendarReadOnlyState,
} from "./calendar-duo";
import { DraftMoveError, planMobileDraftMove } from "./draft-moves";
import { DraggableSession } from "./DraggableSession";
import {
  hitTestDropTarget,
  measureNodeInWindow,
  type DayDropTarget,
  type LayoutRect,
  type SessionDropTarget,
} from "./drop-targets";
import {
  createEmptyMobilePlannerDraft,
  MobilePlannerDraftError,
  previewMobilePlannerDraft,
  publishMobilePlannerDraft,
} from "./mobile-planner-draft";
import { useCalendarPartnerOverlay } from "./use-calendar-partner-overlay";
import { shiftMonth, usePlannerContext } from "./use-planner-context";

const VIEW_MODES = ["month", "week", "three_day", "day"] as const;

function MeasureableDay({
  onRect,
  children,
  style,
}: {
  onRect: (rect: LayoutRect) => void;
  children: ReactNode;
  style?: object;
}) {
  const viewRef = useRef<View>(null);
  return (
    <View
      ref={viewRef}
      onLayout={() => {
        measureNodeInWindow(viewRef.current, onRect);
      }}
      style={style}
    >
      {children}
    </View>
  );
}

export function CalendarScreen() {
  const theme = useTheme();
  const { month, day, viewMode, apply } = useCalendarStore();
  const { scope, hasActivePartner } = useDuoSurfaceScope("calendar");
  const { state } = useDuo();
  const activePartner = hasActivePartner ? state.activePartner : null;
  const readOnlyState = resolveCalendarReadOnlyState(scope);
  const scopeMonth = month ?? format(new Date(), "yyyy-MM");
  const selectedDay = day ?? `${scopeMonth}-01`;
  const planner = usePlannerContext(scopeMonth);
  const partnerOverlay = useCalendarPartnerOverlay({
    enabled: Boolean(activePartner) && (scope === "partner" || scope === "both"),
    partnerId: activePartner?.partnerId ?? null,
    month: scopeMonth,
  });
  useReportMobileDuoScopeViewed({
    surface: "calendar",
    scope,
    hasPartner: Boolean(activePartner),
  });
  const weekStartsOn = normalizeWeekStartsOn(
    planner.data?.preferences?.defaultPolicy.weekStartsOn
  );
  const overlayActive =
    Boolean(activePartner) && (scope === "partner" || scope === "both");
  const [moveUnit, setMoveUnit] = useState<PlannerWorkUnit | null>(null);
  const [moveDate, setMoveDate] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [orderByDay, setOrderByDay] = useState<Record<string, string[]>>({});
  const [draft, setDraft] = useState(createEmptyMobilePlannerDraft);
  const dayTargets = useRef<Map<string, DayDropTarget>>(new Map());
  const sessionTargets = useRef<Map<string, SessionDropTarget>>(new Map());
  const previousScope = useRef(scope);
  useEffect(() => {
    if (scope === "partner" && previousScope.current !== "partner") {
      setMoveUnit(null);
      setMoveDate("");
      setOrderByDay({});
      dayTargets.current.clear();
      sessionTargets.current.clear();
    }
    previousScope.current = scope;
  }, [scope]);
  const effectivePreview = draft.preview ?? planner.data?.preview ?? null;
  const confirmationRequired =
    draft.preview?.solver?.confirmationRequired === true;

  const unitsByDate = useMemo(() => {
    const map = new Map<string, PlannerWorkUnit[]>();
    for (const unit of effectivePreview?.workUnits ?? []) {
      if (!unit.scheduledDate) {
        continue;
      }
      const list = map.get(unit.scheduledDate) ?? [];
      list.push(unit);
      map.set(unit.scheduledDate, list);
    }
    for (const [date, units] of map.entries()) {
      const order = orderByDay[date];
      if (!order) {
        continue;
      }
      const byKey = new Map(units.map((unit) => [unitEntryKey(unit), unit]));
      const ordered = order
        .map((key) => byKey.get(key))
        .filter((unit): unit is PlannerWorkUnit => Boolean(unit));
      const remaining = units.filter(
        (unit) => !order.includes(unitEntryKey(unit))
      );
      map.set(date, [...ordered, ...remaining]);
    }
    return map;
  }, [effectivePreview, orderByDay]);

  const visibleDays = useMemo(() => {
    if (viewMode === "day") {
      return [selectedDay];
    }
    if (viewMode === "three_day") {
      const start = parseISO(selectedDay);
      return [0, 1, 2].map((offset) => format(addDays(start, offset), "yyyy-MM-dd"));
    }
    if (viewMode === "week") {
      const start = parseISO(selectedDay);
      const weekStartOffset = (start.getDay() - weekStartsOn + 7) % 7;
      const weekStart = addDays(start, -weekStartOffset);
      return Array.from({ length: 7 }, (_, index) =>
        format(addDays(weekStart, index), "yyyy-MM-dd")
      );
    }
    return buildMonthCells(scopeMonth, weekStartsOn)
      .filter((cell) => cell.inMonth)
      .map((cell) => cell.date);
  }, [scopeMonth, selectedDay, viewMode, weekStartsOn]);

  const digest = planner.data?.revisions.scheduleDigest ?? null;

  const applyMove = async (unit: PlannerWorkUnit, nextDate: string) => {
    if (!planner.data) {
      return;
    }
    setBusy(true);
    try {
      const planned = planMobileDraftMove({
        state: draft,
        currentMonth: scopeMonth,
        unit,
        nextDate,
      });
      const previewed = await previewMobilePlannerDraft({
        client: {
          postJson: (path, body) => api.postJson(path, body),
        },
        context: planner.data,
        currentMonth: scopeMonth,
        state: planned.state,
      });
      setDraft(previewed);
      if (planned.crossMonth) {
        apply({
          month: planned.targetMonth,
          day: planned.scheduledDate,
        });
      }
      setMoveUnit(null);
      setMessage(
        planned.crossMonth
          ? `Move added across months. Review ${planned.targetMonth}, then save the draft.`
          : "Move added to the draft. Save to publish it."
      );
    } catch (error) {
      setMessage(
        error instanceof DraftMoveError ||
          error instanceof MobilePlannerDraftError
          ? error.message
          : getApiErrorMessage(error, "Move failed.")
      );
    } finally {
      setBusy(false);
    }
  };

  const handleDrop = ({
    unit,
    sourceDay,
    x,
    y,
  }: {
    unit: PlannerWorkUnit;
    sourceDay: string;
    x: number;
    y: number;
  }) => {
    const hit = hitTestDropTarget({
      x,
      y,
      days: Array.from(dayTargets.current.values()),
      sessions: Array.from(sessionTargets.current.values()),
    });
    if (!hit) {
      return;
    }
    const activeKey = unitEntryKey(unit);
    if (hit.type === "session" && hit.day === sourceDay) {
      const entries = unitsByDate.get(sourceDay) ?? [];
      const incompleteKeys = entries
        .filter((entry) => entry.creditState === "uncredited")
        .map(unitEntryKey);
      const completedKeys = entries
        .filter((entry) => entry.creditState !== "uncredited")
        .map(unitEntryKey);
      const next = reorderPreviewEntryKeys({
        incompleteKeys,
        completedKeys,
        activeEntryKey: activeKey,
        overEntryKey: hit.entryKey,
        existingOrder: orderByDay[sourceDay],
      });
      if (next) {
        setOrderByDay((previous) => ({ ...previous, [sourceDay]: next }));
      }
      return;
    }
    const targetDay = hit.day;
    if (targetDay === sourceDay) {
      return;
    }
    void applyMove(unit, targetDay);
  };

  if (
    planner.isLoading &&
    readOnlyState.showViewerSessions &&
    !draft.preview
  ) {
    return <LoadingScreen />;
  }

  const sessionLabel = (unit: PlannerWorkUnit) =>
    planner.data?.goalTitles[unit.originalGoalId] ?? unit.label ?? unit.unitKey;

  return (
    <Screen title="Calendar">
      <DuoScopeSegmentedControl surface="calendar" />
      {readOnlyState.banner && (readOnlyState.allowMutations || viewMode === "month") ? (
        <View
          style={[
            styles.readOnlyBanner,
            { borderColor: theme.colors.border, backgroundColor: theme.colors.card },
          ]}
        >
          <Text style={{ color: theme.colors.foreground, fontWeight: "700" }}>
            {readOnlyState.banner}
          </Text>
        </View>
      ) : null}
      <View style={styles.row}>
        <Pressable onPress={() => apply({ month: shiftMonth(scopeMonth, -1) })}>
          <Text style={{ color: theme.colors.primary }}>Prev</Text>
        </Pressable>
        <Text style={{ color: theme.colors.foreground, fontWeight: "700" }}>{scopeMonth}</Text>
        <Pressable onPress={() => apply({ month: shiftMonth(scopeMonth, 1) })}>
          <Text style={{ color: theme.colors.primary }}>Next</Text>
        </Pressable>
      </View>
      <View style={styles.row}>
        {VIEW_MODES.map((mode) => (
          <Pressable key={mode} onPress={() => apply({ viewMode: mode, day: selectedDay })}>
            <Text
              style={{
                color: mode === viewMode ? theme.colors.primary : theme.colors.mutedForeground,
                fontWeight: mode === viewMode ? "700" : "500",
              }}
            >
              {mode}
            </Text>
          </Pressable>
        ))}
      </View>
      {partnerOverlay.error ? (
        <Text style={{ color: theme.colors.mutedForeground }}>{partnerOverlay.error}</Text>
      ) : null}
      {!readOnlyState.allowMutations && viewMode === "month" && partnerOverlay.loading ? (
        <Text style={{ color: theme.colors.mutedForeground }}>
          Loading partner completions...
        </Text>
      ) : null}
      {viewMode === "month" ? (
        <View style={styles.grid}>
          {buildMonthCells(scopeMonth, weekStartsOn).map((cell) => {
            const viewerSessionCount = readOnlyState.showViewerSessions
              ? (unitsByDate.get(cell.date)?.length ?? 0)
              : 0;
            const partnerMarkers = partnerOverlay.markersByDate.get(cell.date) ?? [];
            const markerModel = buildCalendarMonthMarkerModel({
              markers: partnerMarkers,
              maxVisible: 2,
            });
            const accessibilityLabel = buildCalendarMonthCellAccessibilityLabel({
              day: cell.date,
              includeViewerSessionClause: readOnlyState.showViewerSessions,
              viewerSessionCount,
              overlayActive,
              partnerMarkers: markerModel.visibleMarkers,
              partnerOverflowCount: markerModel.overflowCount,
            });
            return (
              <MeasureableDay
                key={cell.date}
                onRect={(rect) => {
                  dayTargets.current.set(cell.date, {
                    day: cell.date,
                    inMonth: cell.inMonth,
                    rect,
                  });
                }}
                style={[
                  styles.cell,
                  {
                    opacity: cell.inMonth ? 1 : 0.4,
                    borderColor: theme.colors.border,
                    backgroundColor:
                      cell.date === selectedDay ? theme.colors.accent : theme.colors.card,
                  },
                ]}
              >
                <Pressable
                  onPress={() => apply({ day: cell.date, viewMode: "day" })}
                  style={styles.cellPress}
                  accessibilityLabel={accessibilityLabel}
                >
                  <Text style={{ color: theme.colors.foreground, fontSize: 12 }}>
                    {cell.date.slice(8)}
                  </Text>
                  {readOnlyState.showViewerSessions ? (
                    <Text
                      style={{
                        color: theme.colors.mutedForeground,
                        fontSize: 10,
                      }}
                    >
                      {viewerSessionCount}
                    </Text>
                  ) : null}
                  {markerModel.visibleMarkers.map((marker) => (
                    <View
                      key={marker.key}
                      accessible={false}
                      style={[
                        styles.partnerDot,
                        { backgroundColor: theme.colors.primary },
                      ]}
                    />
                  ))}
                  {markerModel.overflowCount > 0 ? (
                    <Text
                      style={{
                        color: theme.colors.primary,
                        fontSize: 10,
                        fontWeight: "700",
                      }}
                    >
                      +{markerModel.overflowCount}
                    </Text>
                  ) : null}
                </Pressable>
              </MeasureableDay>
            );
          })}
        </View>
      ) : !readOnlyState.allowMutations ? (
        <CalendarPartnerReadOnlySection
          visibleDays={visibleDays}
          markersByDate={partnerOverlay.markersByDate}
          loading={partnerOverlay.loading}
        />
      ) : (
        visibleDays.map((visibleDay) => (
          <MeasureableDay
            key={visibleDay}
            onRect={(rect) => {
              dayTargets.current.set(visibleDay, {
                day: visibleDay,
                inMonth: visibleDay.slice(0, 7) === scopeMonth,
                rect,
              });
            }}
            style={[styles.dayCard, { borderColor: theme.colors.border }]}
          >
            <Text style={{ color: theme.colors.foreground, fontWeight: "700" }}>
              {visibleDay}
            </Text>
            {readOnlyState.showViewerSessions
              ? (unitsByDate.get(visibleDay) ?? []).map((unit) => (
                  <DraggableSession
                    key={unitEntryKey(unit)}
                    unit={unit}
                    day={visibleDay}
                    label={sessionLabel(unit)}
                    onPress={() => {
                      setMoveUnit(unit);
                      setMoveDate(visibleDay);
                    }}
                    onDrop={handleDrop}
                    onLayoutWindow={(entryKey, sessionDay, rect) => {
                      sessionTargets.current.set(entryKey, {
                        day: sessionDay,
                        entryKey,
                        rect,
                      });
                    }}
                  />
                ))
              : null}
            {(partnerOverlay.markersByDate.get(visibleDay) ?? []).map((marker) => (
              <View
                key={marker.key}
                accessible
                accessibilityRole="text"
                accessibilityLabel={buildPartnerMarkerAccessibilityLabel(marker.goalTitle)}
                style={[
                  styles.partnerMarker,
                  {
                    borderColor: theme.colors.border,
                    backgroundColor: theme.colors.secondary,
                  },
                ]}
              >
                <Text style={{ color: theme.colors.foreground, fontWeight: "600" }}>
                  Partner done: {marker.goalTitle}
                </Text>
              </View>
            ))}
          </MeasureableDay>
        ))
      )}
      {readOnlyState.allowMutations && draft.dirty ? (
        <>
          <Text style={{ color: theme.colors.mutedForeground }}>
            Draft window: {draft.previewWindow?.start ?? "refresh required"} to{" "}
            {draft.previewWindow?.end ?? "refresh required"}
          </Text>
          {confirmationRequired ? (
            <Text style={{ color: theme.colors.foreground }}>
              This preview could not place every session. Confirm to save the
              partial plan.
            </Text>
          ) : null}
          <View style={styles.row}>
            <PrimaryButton
              disabled={busy || !planner.data || !draft.preview}
              label={
                confirmationRequired ? "Confirm partial plan" : "Save draft"
              }
              onPress={async () => {
                if (!planner.data) {
                  return;
                }
                setBusy(true);
                try {
                  await publishMobilePlannerDraft({
                    client: {
                      postJson: (path, body) => api.postJson(path, body),
                    },
                    context: planner.data,
                    state: draft,
                    confirmationApproved: confirmationRequired,
                  });
                  setDraft(createEmptyMobilePlannerDraft());
                  setOrderByDay({});
                  await planner.forcePrepare();
                  setMessage("Planner draft saved.");
                } catch (error) {
                  setMessage(
                    error instanceof MobilePlannerDraftError
                      ? error.message
                      : getApiErrorMessage(error, "Planner draft could not be saved.")
                  );
                } finally {
                  setBusy(false);
                }
              }}
            />
            <PrimaryButton
              disabled={busy}
              label="Discard draft"
              onPress={() => {
                setDraft(createEmptyMobilePlannerDraft());
                setOrderByDay({});
                setMessage("Planner draft discarded.");
              }}
            />
          </View>
        </>
      ) : null}
      {readOnlyState.allowMutations ? (
        <View style={styles.row}>
          <PrimaryButton
            disabled={busy || !digest || draft.dirty}
            label="Reset locks"
            onPress={async () => {
              if (!digest) {
                return;
              }
              setBusy(true);
              try {
                await api.postJson("/api/planner/reset", {
                  scopeMonth,
                  expectedDigest: digest,
                });
                await planner.refresh();
                setMessage("Reset complete.");
              } catch (error) {
                setMessage(getApiErrorMessage(error, "Reset failed."));
              } finally {
                setBusy(false);
              }
            }}
          />
        </View>
      ) : null}
      {message ? <Text style={{ color: theme.colors.foreground }}>{message}</Text> : null}
      {readOnlyState.allowMutations && planner.data ? (
        <CoachPanel
          context={planner.data}
          currentMonth={scopeMonth}
          draft={draft}
          onDraftChange={setDraft}
        />
      ) : null}
      {readOnlyState.allowMutations ? (
        <Text style={{ color: theme.colors.mutedForeground }}>
          Long-press a session to drag it onto another day, or tap it to use the
          Move-to sheet. Cross-month moves stay in one draft until you save or
          discard it.
        </Text>
      ) : null}
      <Modal
        visible={readOnlyState.allowMutations && Boolean(moveUnit)}
        animationType="slide"
        transparent
      >
        <View style={styles.sheetBackdrop}>
          <View style={[styles.sheet, { backgroundColor: theme.colors.card }]}>
            <Text style={{ color: theme.colors.foreground, fontWeight: "700" }}>Move to…</Text>
            <TextInput
              value={moveDate}
              onChangeText={setMoveDate}
              placeholder="YYYY-MM-DD"
              placeholderTextColor={theme.colors.mutedForeground}
              style={[styles.input, { color: theme.colors.foreground, borderColor: theme.colors.border }]}
            />
            <PrimaryButton
              disabled={busy || !moveUnit}
              label="Apply move"
              onPress={() => {
                if (!moveUnit) {
                  return;
                }
                void applyMove(moveUnit, moveDate);
              }}
            />
            <PrimaryButton
              disabled={busy || !moveUnit || draft.dirty}
              label="Toggle lock"
              onPress={async () => {
                const item = planner.data?.activePlan?.items.find(
                  (candidate) => candidate.unit_key === moveUnit?.unitKey
                );
                if (!item || !digest) {
                  setMessage("Lock needs an active plan item and digest.");
                  return;
                }
                setBusy(true);
                try {
                  await api.postJson("/api/planner/items/lock", {
                    itemId: item.id,
                    locked: !item.locked,
                    expectedDigest: digest,
                  });
                  await planner.refresh();
                  setMoveUnit(null);
                } catch (error) {
                  setMessage(getApiErrorMessage(error, "Lock failed."));
                } finally {
                  setBusy(false);
                }
              }}
            />
            <Pressable onPress={() => setMoveUnit(null)}>
              <Text style={{ color: theme.colors.primary, textAlign: "center" }}>Close</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", justifyContent: "space-between", gap: 8, alignItems: "center" },
  readOnlyBanner: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  grid: { flexDirection: "row", flexWrap: "wrap" },
  cell: {
    width: "14.28%",
    aspectRatio: 1,
    borderWidth: 1,
    padding: 4,
  },
  cellPress: { flex: 1 },
  partnerDot: {
    width: 8,
    height: 8,
    borderRadius: 99,
    marginTop: 4,
  },
  dayCard: { borderWidth: 1, borderRadius: 12, padding: 12, gap: 6 },
  partnerMarker: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  sheetBackdrop: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(0,0,0,0.4)",
  },
  sheet: { padding: 20, gap: 12, borderTopLeftRadius: 16, borderTopRightRadius: 16 },
  input: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10 },
});
