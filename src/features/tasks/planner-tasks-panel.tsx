"use client";

import { CheckCircle2, Circle, Loader2, Plus, Trash2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { createClient } from "@/lib/supabase/client";

interface PlannerTaskRow {
  task_id: string;
  title: string;
  scheduled_date: string;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
}

interface PlannerTasksPanelProps {
  title?: string;
  description?: string;
  scheduledDate?: string | null;
  showScheduledDate?: boolean;
  allowCreate?: boolean;
  allowDelete?: boolean;
}

export function PlannerTasksPanel({
  title = "To-Do",
  description = "Track one-off tasks alongside your planner schedule.",
  scheduledDate = null,
  showScheduledDate = false,
  allowCreate = true,
  allowDelete = false,
}: PlannerTasksPanelProps) {
  const supabase = useMemo(() => createClient(), []);
  const [tasks, setTasks] = useState<PlannerTaskRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [adding, setAdding] = useState(false);
  const [togglingTaskId, setTogglingTaskId] = useState<string | null>(null);
  const [deletingTaskId, setDeletingTaskId] = useState<string | null>(null);
  const [confirmingDeleteTask, setConfirmingDeleteTask] = useState<PlannerTaskRow | null>(null);
  const [newTaskTitle, setNewTaskTitle] = useState("");
  const scheduledDateRef = useRef<string | null>(scheduledDate);
  const requestVersionRef = useRef(0);

  const loadTasks = useCallback(async (forDate: string | null = scheduledDateRef.current) => {
    const requestVersion = ++requestVersionRef.current;
    setLoading(true);
    const { data, error } = await supabase.rpc("list_planner_tasks", {
      p_for_date: forDate ?? undefined,
    });
    if (requestVersion !== requestVersionRef.current) {
      return;
    }
    if (error) {
      toast.error(error.message || "Could not load tasks.");
      setLoading(false);
      return;
    }
    setTasks((data ?? []) as PlannerTaskRow[]);
    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    scheduledDateRef.current = scheduledDate;
    void loadTasks(scheduledDate);
  }, [loadTasks, scheduledDate]);

  useEffect(
    () => () => {
      requestVersionRef.current += 1;
    },
    []
  );

  const addTask = useCallback(async () => {
    if (!allowCreate) {
      return;
    }
    const title = newTaskTitle.trim();
    if (!title) {
      return;
    }
    setAdding(true);
    try {
      const { error } = await supabase.rpc("create_planner_task", {
        p_title: title,
        p_scheduled_date: scheduledDateRef.current ?? undefined,
      });
      if (error) {
        toast.error(error.message || "Task could not be created.");
        return;
      }
      setNewTaskTitle("");
      await loadTasks(scheduledDateRef.current);
    } finally {
      setAdding(false);
    }
  }, [allowCreate, loadTasks, newTaskTitle, supabase]);

  const toggleTask = useCallback(
    async (task: PlannerTaskRow) => {
      setTogglingTaskId(task.task_id);
      try {
        const { error } = await supabase.rpc("set_planner_task_completion", {
          p_task_id: task.task_id,
          p_completed: task.completed_at == null,
        });
        if (error) {
          toast.error(error.message || "Task completion could not be updated.");
          return;
        }
        await loadTasks(scheduledDateRef.current);
      } finally {
        setTogglingTaskId(null);
      }
    },
    [loadTasks, supabase]
  );

  const deleteTask = useCallback(
    async (task: PlannerTaskRow) => {
      if (!allowDelete) {
        return;
      }
      setDeletingTaskId(task.task_id);
      try {
        const { error } = await supabase.rpc("delete_planner_task", {
          p_task_id: task.task_id,
        });
        if (error) {
          toast.error(error.message || "Task could not be deleted.");
          return;
        }
        await loadTasks(scheduledDateRef.current);
      } finally {
        setDeletingTaskId(null);
      }
    },
    [allowDelete, loadTasks, supabase]
  );

  const requestDeleteTask = useCallback(
    (task: PlannerTaskRow) => {
      if (!allowDelete) {
        return;
      }
      setConfirmingDeleteTask(task);
    },
    [allowDelete]
  );

  return (
    <Card className="shadow-sm">
      <CardHeader className="space-y-2">
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
        {allowCreate ? (
          <div className="flex gap-2">
            <Input
              value={newTaskTitle}
              onChange={(event) => setNewTaskTitle(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  void addTask();
                }
              }}
              placeholder="Add a task..."
              maxLength={200}
            />
            <Button type="button" onClick={() => void addTask()} disabled={adding}>
              {adding ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
              Add
            </Button>
          </div>
        ) : null}
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" />
            Loading tasks...
          </div>
        ) : tasks.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {allowCreate
              ? "No tasks yet. Add one to keep your planner focused."
              : "No tasks scheduled for this day yet."}
          </p>
        ) : (
          <ul className="space-y-2">
            {tasks.map((task) => {
              const complete = task.completed_at != null;
              const toggling = togglingTaskId === task.task_id;
              const deleting = deletingTaskId === task.task_id;
              const busy = toggling || deleting;
              return (
                <li
                  key={task.task_id}
                  className="flex items-center justify-between gap-3 rounded-md border px-3 py-2"
                >
                  <button
                    type="button"
                    className="flex min-w-0 flex-1 items-center gap-2 text-left"
                    onClick={() => void toggleTask(task)}
                    disabled={busy}
                  >
                    {toggling ? (
                      <Loader2 className="size-4 shrink-0 animate-spin text-muted-foreground" />
                    ) : complete ? (
                      <CheckCircle2 className="size-4 shrink-0 text-emerald-600" />
                    ) : (
                      <Circle className="size-4 shrink-0 text-muted-foreground" />
                    )}
                    <span className={complete ? "text-muted-foreground line-through" : ""}>
                      {task.title}
                    </span>
                  </button>
                  {showScheduledDate ? (
                    <Badge variant="outline">{task.scheduled_date}</Badge>
                  ) : null}
                  {allowDelete ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      aria-label={`Delete task ${task.title}`}
                      title="Delete task"
                      onClick={() => requestDeleteTask(task)}
                      disabled={busy}
                    >
                      {deleting ? (
                        <Loader2 className="size-4 animate-spin text-destructive" />
                      ) : (
                        <Trash2 className="size-4 text-destructive" />
                      )}
                    </Button>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
      <Dialog
        open={confirmingDeleteTask !== null}
        onOpenChange={(open) => {
          if (deletingTaskId) {
            return;
          }
          if (!open) {
            setConfirmingDeleteTask(null);
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete task?</DialogTitle>
            <DialogDescription>
              {confirmingDeleteTask
                ? `This permanently deletes "${confirmingDeleteTask.title}".`
                : "This permanently deletes this task."}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setConfirmingDeleteTask(null)}
              disabled={Boolean(deletingTaskId)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={!confirmingDeleteTask || Boolean(deletingTaskId)}
              onClick={() => {
                if (!confirmingDeleteTask) {
                  return;
                }
                void deleteTask(confirmingDeleteTask).then(() => {
                  setConfirmingDeleteTask(null);
                });
              }}
            >
              {deletingTaskId ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Trash2 className="size-4" />
              )}
              Delete task
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
