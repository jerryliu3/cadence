import { addDays, format, parseISO } from "date-fns";
import { useMemo, useState } from "react";
import {
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { getApiErrorMessage } from "@cadence/shared/api-client";
import { api } from "../../lib/api";
import { useCalendarStore } from "../../store/calendar-state";
import { getMobileTheme } from "../../theme";
import { PrimaryButton } from "../../ui/button";
import { LoadingScreen, Screen } from "../../ui/screen";
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
  const [moveUnit, setMoveUnit] = useState<MobilePlannerWorkUnit | null>(null);
  const [moveDate, setMoveDate] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

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
    return map;
  }, [planner.data]);

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
    return buildMonthCells(scopeMonth).filter((cell) => cell.inMonth).map((cell) => cell.date);
  }, [scopeMonth, selectedDay, viewMode]);

  const digest = planner.data?.revisions.scheduleDigest ?? null;

  if (planner.isLoading) {
    return <LoadingScreen />;
  }

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
          <View key={visibleDay} style={[styles.dayCard, { borderColor: theme.colors.border }]}>
            <Text style={{ color: theme.colors.foreground, fontWeight: "700" }}>{visibleDay}</Text>
            {(unitsByDate.get(visibleDay) ?? []).map((unit) => (
              <Pressable
                key={`${unit.originalGoalId}:${unit.unitKey}`}
                onPress={() => {
                  setMoveUnit(unit);
                  setMoveDate(visibleDay);
                }}
              >
                <Text style={{ color: theme.colors.foreground }}>
                  {planner.data?.goalTitles[unit.originalGoalId] ?? unit.label ?? unit.unitKey}
                </Text>
              </Pressable>
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
      <Text style={{ color: theme.colors.mutedForeground }}>
        Drag is deferred; tap a session in week/day view to move it with the sheet. Coach and
        cross-month advanced moves follow in later polish.
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
              onPress={async () => {
                if (!moveUnit || !planner.data) {
                  return;
                }
                setBusy(true);
                try {
                  await api.postJson("/api/planner/context", {
                    scopeMonth,
                    timezone: planner.data.timezone,
                    policy: planner.data.preferences?.defaultPolicy,
                    source: planner.data.activePlan ? "update" : "manual",
                    solveIntent: "stable",
                    draftCommands: [
                      {
                        kind: "move_item",
                        goalId: moveUnit.originalGoalId,
                        unitKey: moveUnit.unitKey,
                        scheduledDate: moveDate,
                      },
                    ],
                  });
                  await planner.refresh();
                  setMoveUnit(null);
                  setMessage("Draft move previewed. Save from web or a follow-up save slice if hashes are required.");
                } catch (error) {
                  setMessage(getApiErrorMessage(error, "Move failed."));
                } finally {
                  setBusy(false);
                }
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
