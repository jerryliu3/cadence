import { useCallback, useState } from "react";

export function usePlannerDayDetailSelectionState() {
  const [dayDetailDay, setDayDetailDayState] = useState<string | null>(null);
  const [selectedEventEntryKey, setSelectedEventEntryKey] = useState<string | null>(
    null
  );
  const setDayDetailDay = useCallback((day: string) => {
    setDayDetailDayState(day);
    setSelectedEventEntryKey(null);
  }, []);

  const closeDayDetails = useCallback(() => {
    setSelectedEventEntryKey(null);
    setDayDetailDayState(null);
  }, []);

  const closeEventDetails = useCallback(() => {
    setSelectedEventEntryKey(null);
  }, []);

  const selectEventEntry = useCallback((entryKey: string) => {
    setSelectedEventEntryKey(entryKey);
  }, []);

  return {
    dayDetailDay,
    selectedEventEntryKey,
    setDayDetailDay,
    closeDayDetails,
    closeEventDetails,
    selectEventEntry,
  };
}
