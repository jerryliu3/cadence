import { addDays, format, parseISO } from "date-fns";
import { useMemo, useRef, useState } from "react";
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
import { api } from "../../lib/api";
import { useForceUpgradeRequired } from "../../lib/runtime-config";
import { useCalendarStore } from "../../store/calendar-state";
import { getMobileTheme } from "../../theme";
import { PrimaryButton } from "../../ui/button";
import { LoadingScreen, Screen } from "../../ui/screen";
import { CoachPanel } from "./CoachPanel";
import { DraftMoveError, previewDraftMove } from "./draft-moves";
import { DraggableSession } from "./DraggableSession";
import {
  hitTestDropTarget,
  type DayDropTarget,
  type SessionDropTarget,
} from "./drop-targets";
import {
  buildMonthCells,
  shiftMonth,
  usePlannerContext,
  type MobilePlannerWorkUnit,
} from "./use-planner-context";

const VIEW_MODES = ["month", "week", "three_day", "day"] as const;

export function CalendarScreen() {
  const theme = getMobileTheme();
  const { month, day, viewMode, apply } = useCalendarStore();
  const scopeMonth = month ?? format(new Date(), "yyyy-MM");
  const selectedDay = day ?? `${scopeMonth}-01`;
  const planner = usePlannerContext(scopeMonth);
  const { flags } = useForceUpgradeRequired();
  const crossMonthMovesEnabled = Boolean(
    flags?.crossMonthMovesEnabled || planner.data?.capabilities?.crossMonthMovesEnabled
  );
  const [moveUnit, setMoveUnit] = useState<MobilePlannerWorkUnit | null>(null);
  const [moveDate, setMoveDate] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [orderByDay, setOrderByDay] = useState<Record<string, string[]>>({});
  const dayTargets = useRef<Map<string, DayDropTarget>>(new Map());
  const sessionTargets = useRef<Map<string, SessionDropTarget>>(new Map());

  const unitsByDate = useMemo(() => {
    const map = new Map<string, MobilePlannerWorkUnit[]>();
    for (const unit of planner.data?.preview?.workUnits ?? []) {
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
        .filter((unit): unit is MobilePlannerWorkUnit => Boolean(unit));
      const remaining = units.filter(
        (unit) => !order.includes(unitEntryKey(unit))
      );
      map.set(date, [...ordered, ...remaining]);
    }
    return map;
  }, [orderByDay, planner.data]);

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
      const mondayOffset = (start.getDay() + 6) % 7;
      const weekStart = addDays(start, -mondayOffset);
      return Array.from({ length: 7 }, (_, index) =>
        format(addDays(weekStart, index), "yyyy-MM-dd")
      );
    }
    return buildMonthCells(scopeMonth)
      .filter((cell) => cell.inMonth)
      .map((cell) => cell.date);
  }, [scopeMonth, selectedDay, viewMode]);

  const digest = planner.data?.revisions.scheduleDigest ?? null;

  const applyMove = async (unit: MobilePlannerWorkUnit, nextDate: string) => {
    if (!planner.data) {
      return;
    }
    setBusy(true);
    try {
      const result = await previewDraftMove({
        context: planner.data,
        unit,
        nextDate,
        crossMonthMovesEnabled,
      });
      if (result.crossMonth) {
        apply({ month: result.scopeMonth, day: result.scheduledDate });
      }
      await planner.refresh();
      setMoveUnit(null);
      setMessage(
        result.crossMonth
          ? `Moved into ${result.scopeMonth}. Review that month before saving.`
          : "Draft move previewed. Long-press still has a Move-to sheet fallback."
      );
    } catch (error) {
      setMessage(
        error instanceof DraftMoveError
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
    unit: MobilePlannerWorkUnit;
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

  if (planner.isLoading) {
    return <LoadingScreen />;
  }

  const sessionLabel = (unit: MobilePlannerWorkUnit) =>
    planner.data?.goalTitles[unit.originalGoalId] ?? unit.label ?? unit.unitKey;

  return (
    <Screen title="Calendar">
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
      {viewMode === "month" ? (
        <View style={styles.grid}>
          {buildMonthCells(scopeMonth).map((cell) => (
            <Pressable
              key={cell.date}
              onPress={() => apply({ day: cell.date, viewMode: "day" })}
              onLayout={(event) => {
                const node = event.target as unknown as {
                  measureInWindow?: (
                    callback: (
                      x: number,
                      y: number,
                      width: number,
                      height: number
                    ) => void
                  ) => void;
                };
                node.measureInWindow?.((x, y, width, height) => {
                  dayTargets.current.set(cell.date, {
                    day: cell.date,
                    inMonth: cell.inMonth,
                    rect: { x, y, width, height },
                  });
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
              <Text style={{ color: theme.colors.foreground, fontSize: 12 }}>
                {cell.date.slice(8)}
              </Text>
              <Text style={{ color: theme.colors.mutedForeground, fontSize: 10 }}>
                {unitsByDate.get(cell.date)?.length ?? 0}
              </Text>
            </Pressable>
          ))}
        </View>
      ) : (
        visibleDays.map((visibleDay) => (
          <View
            key={visibleDay}
            onLayout={(event) => {
              const node = event.target as unknown as {
                measureInWindow?: (
                  callback: (
                    x: number,
                    y: number,
                    width: number,
                    height: number
                  ) => void
                ) => void;
              };
              node.measureInWindow?.((x, y, width, height) => {
                dayTargets.current.set(visibleDay, {
                  day: visibleDay,
                  inMonth: visibleDay.slice(0, 7) === scopeMonth,
                  rect: { x, y, width, height },
                });
              });
            }}
            style={[styles.dayCard, { borderColor: theme.colors.border }]}
          >
            <Text style={{ color: theme.colors.foreground, fontWeight: "700" }}>
              {visibleDay}
            </Text>
            {(unitsByDate.get(visibleDay) ?? []).map((unit) => (
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
            ))}
          </View>
        ))
      )}
      <View style={styles.row}>
        <PrimaryButton
          disabled={busy || !digest}
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
      {message ? <Text style={{ color: theme.colors.foreground }}>{message}</Text> : null}
      {planner.data ? (
        <CoachPanel context={planner.data} onApplied={() => planner.refresh()} />
      ) : null}
      <Text style={{ color: theme.colors.mutedForeground }}>
        Long-press a session to drag it onto another day, including faded out-of-month
        cells when cross-month moves are enabled. Tap a session to use the Move-to sheet.
      </Text>
      <Modal visible={Boolean(moveUnit)} animationType="slide" transparent>
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
              disabled={busy || !moveUnit}
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
  grid: { flexDirection: "row", flexWrap: "wrap" },
  cell: {
    width: "14.28%",
    aspectRatio: 1,
    borderWidth: 1,
    padding: 4,
  },
  dayCard: { borderWidth: 1, borderRadius: 12, padding: 12, gap: 6 },
  sheetBackdrop: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(0,0,0,0.4)",
  },
  sheet: { padding: 20, gap: 12, borderTopLeftRadius: 16, borderTopRightRadius: 16 },
  input: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10 },
});
