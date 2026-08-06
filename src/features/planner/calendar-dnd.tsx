"use client";

import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragStartEvent,
  type DragOverEvent,
  type DragEndEvent,
  type DragCancelEvent,
  type DraggableAttributes,
  type DraggableSyntheticListeners,
  type UniqueIdentifier,
} from "@dnd-kit/core";
import { sortableKeyboardCoordinates } from "@dnd-kit/sortable";
import {
  useMemo,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";

const ENTRY_ID_PREFIX = "planner-entry:";
const PREVIEW_ENTRY_DRAG_ID_PREFIX = "planner-entry-preview:";
const DAY_ID_PREFIX = "planner-day:";
const PREVIEW_ENTRY_DROP_ID_PREFIX = "planner-preview-entry:";
const MOUSE_PRESS_TO_DRAG_DELAY_MS = 120;
const MOUSE_PRESS_TO_DRAG_TOLERANCE_PX = 24;
const TOUCH_PRESS_TO_DRAG_DELAY_MS = 180;
const TOUCH_PRESS_TO_DRAG_TOLERANCE_PX = 10;

export function plannerEntryDragId(entryKey: string) {
  return `${ENTRY_ID_PREFIX}${entryKey}`;
}

export function plannerPreviewEntryDragId(day: string, entryKey: string) {
  return `${PREVIEW_ENTRY_DRAG_ID_PREFIX}${day}::${entryKey}`;
}

export function plannerDayDropId(day: string) {
  return `${DAY_ID_PREFIX}${day}`;
}

export function plannerPreviewEntryDropId(day: string, entryKey: string) {
  return `${PREVIEW_ENTRY_DROP_ID_PREFIX}${day}::${entryKey}`;
}

function parsePlannerEntryDragId(id: UniqueIdentifier) {
  if (typeof id !== "string") {
    return null;
  }
  if (id.startsWith(ENTRY_ID_PREFIX)) {
    return id.slice(ENTRY_ID_PREFIX.length);
  }
  if (id.startsWith(PREVIEW_ENTRY_DRAG_ID_PREFIX)) {
    const parsed = id.slice(PREVIEW_ENTRY_DRAG_ID_PREFIX.length);
    const separatorIndex = parsed.indexOf("::");
    if (separatorIndex < 0) {
      return null;
    }
    return parsed.slice(separatorIndex + 2);
  }
  return null;
}

function parsePlannerDayDropId(id: UniqueIdentifier) {
  if (typeof id !== "string" || !id.startsWith(DAY_ID_PREFIX)) {
    return null;
  }
  return id.slice(DAY_ID_PREFIX.length);
}

function parsePlannerPreviewEntryDropId(id: UniqueIdentifier) {
  if (
    typeof id !== "string" ||
    !id.startsWith(PREVIEW_ENTRY_DROP_ID_PREFIX)
  ) {
    return null;
  }
  const parsed = id.slice(PREVIEW_ENTRY_DROP_ID_PREFIX.length);
  const separatorIndex = parsed.indexOf("::");
  if (separatorIndex < 0) {
    return null;
  }
  return {
    day: parsed.slice(0, separatorIndex),
    entryKey: parsed.slice(separatorIndex + 2),
  };
}

export type PlannerDragTarget =
  | { type: "day"; day: string }
  | { type: "preview_entry"; day: string; entryKey: string }
  | null;

function parsePlannerDragTarget(id: UniqueIdentifier): PlannerDragTarget {
  const day = parsePlannerDayDropId(id);
  if (day) {
    return { type: "day", day };
  }
  const previewEntry = parsePlannerPreviewEntryDropId(id);
  if (previewEntry) {
    return {
      type: "preview_entry",
      day: previewEntry.day,
      entryKey: previewEntry.entryKey,
    };
  }
  return null;
}

interface PlannerDndProviderProps {
  children: ReactNode;
  getEntryLabel: (entryKey: string) => string;
  getDayLabel: (day: string) => string;
  renderDragOverlay?: (entryKey: string) => ReactNode;
  onEntryDragStart: (entryKey: string) => void;
  onEntryDragOverTarget?: (
    entryKey: string,
    target: PlannerDragTarget
  ) => void;
  onEntryDragEnd: (entryKey: string, target: PlannerDragTarget) => void;
  onEntryDragCancel: (entryKey: string | null) => void;
}

export function PlannerDndProvider({
  children,
  getEntryLabel,
  getDayLabel,
  renderDragOverlay,
  onEntryDragStart,
  onEntryDragOverTarget,
  onEntryDragEnd,
  onEntryDragCancel,
}: PlannerDndProviderProps) {
  const [activeEntryKey, setActiveEntryKey] = useState<string | null>(null);
  const sensors = useSensors(
    useSensor(MouseSensor, {
      activationConstraint: {
        delay: MOUSE_PRESS_TO_DRAG_DELAY_MS,
        tolerance: MOUSE_PRESS_TO_DRAG_TOLERANCE_PX,
      },
    }),
    useSensor(TouchSensor, {
      activationConstraint: {
        delay: TOUCH_PRESS_TO_DRAG_DELAY_MS,
        tolerance: TOUCH_PRESS_TO_DRAG_TOLERANCE_PX,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const announcements = useMemo(
    () => ({
      onDragStart({ active }: DragStartEvent) {
        const entryKey = parsePlannerEntryDragId(active.id);
        return entryKey
          ? `Picked up ${getEntryLabel(entryKey)}.`
          : "Picked up planner session.";
      },
      onDragOver({ active, over }: DragOverEvent) {
        const entryKey = parsePlannerEntryDragId(active.id);
        if (!entryKey) {
          return;
        }
        const target = over ? parsePlannerDragTarget(over.id) : null;
        if (!target) {
          return `${getEntryLabel(entryKey)} is not over a valid target.`;
        }
        if (target.type === "day") {
          return `${getEntryLabel(entryKey)} over ${getDayLabel(target.day)}.`;
        }
        return `${getEntryLabel(entryKey)} over ${getEntryLabel(target.entryKey)} in popup list.`;
      },
      onDragEnd({ active, over }: DragEndEvent) {
        const entryKey = parsePlannerEntryDragId(active.id);
        if (!entryKey) {
          return;
        }
        const target = over ? parsePlannerDragTarget(over.id) : null;
        if (!target) {
          return `Dropped ${getEntryLabel(entryKey)} outside a valid target.`;
        }
        if (target.type === "day") {
          return `Dropped ${getEntryLabel(entryKey)} on ${getDayLabel(target.day)}.`;
        }
        return `Dropped ${getEntryLabel(entryKey)} near ${getEntryLabel(target.entryKey)} in popup list.`;
      },
      onDragCancel({ active }: DragCancelEvent) {
        const entryKey = parsePlannerEntryDragId(active.id);
        return entryKey
          ? `Cancelled drag for ${getEntryLabel(entryKey)}.`
          : "Cancelled drag.";
      },
    }),
    [getDayLabel, getEntryLabel]
  );

  const handleDragStart = ({ active }: DragStartEvent) => {
    const entryKey = parsePlannerEntryDragId(active.id);
    if (!entryKey) {
      return;
    }
    setActiveEntryKey(entryKey);
    onEntryDragStart(entryKey);
  };

  const handleDragOver = ({ active, over }: DragOverEvent) => {
    const entryKey = parsePlannerEntryDragId(active.id);
    if (!entryKey) {
      return;
    }
    const target = over ? parsePlannerDragTarget(over.id) : null;
    onEntryDragOverTarget?.(entryKey, target);
  };

  const handleDragEnd = ({ active, over }: DragEndEvent) => {
    const entryKey = parsePlannerEntryDragId(active.id);
    setActiveEntryKey(null);
    if (!entryKey) {
      onEntryDragCancel(null);
      return;
    }
    const target = over ? parsePlannerDragTarget(over.id) : null;
    onEntryDragEnd(entryKey, target);
  };

  return (
    <DndContext
      sensors={sensors}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
      onDragCancel={({ active }) => {
        setActiveEntryKey(null);
        onEntryDragCancel(parsePlannerEntryDragId(active.id));
      }}
      accessibility={{
        announcements,
        screenReaderInstructions: {
          draggable:
            "Press space to pick up, use arrow keys to move between calendar days, then press space again to drop.",
        },
      }}
    >
      {children}
      <DragOverlay zIndex={4000}>
        {activeEntryKey && renderDragOverlay
          ? renderDragOverlay(activeEntryKey)
          : null}
      </DragOverlay>
    </DndContext>
  );
}

interface PlannerDraggableEntryRenderProps {
  setNodeRef: (node: HTMLElement | null) => void;
  attributes: DraggableAttributes;
  listeners: DraggableSyntheticListeners | undefined;
  style: CSSProperties;
  isDragging: boolean;
}

interface PlannerDraggableEntryProps {
  entryKey: string;
  disabled?: boolean;
  children: (props: PlannerDraggableEntryRenderProps) => ReactNode;
}

export function PlannerDraggableEntry({
  entryKey,
  disabled = false,
  children,
}: PlannerDraggableEntryProps) {
  const { attributes, listeners, setNodeRef, transform, isDragging } =
    useDraggable({
      id: plannerEntryDragId(entryKey),
      data: { entryKey },
      disabled,
    });
  const style: CSSProperties = transform
    ? {
        transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`,
        touchAction: "none",
      }
    : { touchAction: "none" };
  return children({
    setNodeRef,
    attributes,
    listeners,
    style,
    isDragging,
  });
}

interface PlannerDroppableDayProps {
  day: string;
  children: (props: {
    setNodeRef: (node: HTMLElement | null) => void;
    isOver: boolean;
  }) => ReactNode;
}

export function PlannerDroppableDay({
  day,
  children,
}: PlannerDroppableDayProps) {
  const { setNodeRef, isOver } = useDroppable({
    id: plannerDayDropId(day),
    data: { day },
  });
  return children({ setNodeRef, isOver });
}

interface PlannerDraggablePreviewEntryProps {
  day: string;
  entryKey: string;
  disabled?: boolean;
  children: (props: PlannerDraggableEntryRenderProps & { isOver: boolean }) => ReactNode;
}

export function PlannerDraggablePreviewEntry({
  day,
  entryKey,
  disabled = false,
  children,
}: PlannerDraggablePreviewEntryProps) {
  const {
    attributes,
    listeners,
    setNodeRef: setDragNodeRef,
    transform,
    isDragging,
  } = useDraggable({
    id: plannerPreviewEntryDragId(day, entryKey),
    data: { entryKey, day },
    disabled,
  });
  const { setNodeRef: setDropNodeRef, isOver } = useDroppable({
    id: plannerPreviewEntryDropId(day, entryKey),
    data: { day, entryKey },
  });
  const setNodeRef = (node: HTMLElement | null) => {
    setDragNodeRef(node);
    setDropNodeRef(node);
  };
  const style: CSSProperties = transform
    ? {
        transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`,
        touchAction: "none",
      }
    : { touchAction: "none" };
  return children({
    setNodeRef,
    attributes,
    listeners,
    style,
    isDragging,
    isOver,
  });
}

