import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { supabase } from "../../lib/supabase";
import { useSession } from "../../lib/session";
import { useTheme } from "../../theme";
import { PrimaryButton } from "../../ui/button";
import { Screen } from "../../ui/screen";

interface PlannerTaskRow {
  task_id: string;
  title: string;
  scheduled_date: string;
  completed_at: string | null;
}

export function TasksScreen() {
  const theme = useTheme();
  const { userId } = useSession();
  const queryClient = useQueryClient();
  const [newTaskTitle, setNewTaskTitle] = useState("");
  const [saving, setSaving] = useState(false);
  const [togglingTaskId, setTogglingTaskId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const tasksQuery = useQuery({
    queryKey: ["mobile-planner-tasks", userId],
    enabled: Boolean(userId),
    queryFn: async () => {
      if (!userId) {
        return [];
      }
      const { data, error } = await supabase.rpc("list_planner_tasks", {
        p_for_date: undefined,
      });
      if (error) {
        throw error;
      }
      return (data ?? []) as PlannerTaskRow[];
    },
  });

  const tasks = useMemo(() => tasksQuery.data ?? [], [tasksQuery.data]);
  const tasksErrorMessage =
    tasksQuery.error instanceof Error
      ? tasksQuery.error.message
      : "Could not load tasks.";

  return (
    <Screen title="To-Do">
      <Text style={{ color: theme.colors.mutedForeground }}>
        Completed tasks stay visible through today and hide the day after.
      </Text>
      <View style={styles.inputRow}>
        <TextInput
          value={newTaskTitle}
          onChangeText={setNewTaskTitle}
          placeholder="Add a task..."
          placeholderTextColor={theme.colors.mutedForeground}
          style={[
            styles.input,
            {
              borderColor: theme.colors.border,
              color: theme.colors.foreground,
              backgroundColor: theme.colors.card,
            },
          ]}
          maxLength={200}
        />
      </View>
      <PrimaryButton
        label={saving ? "Adding..." : "Add task"}
        disabled={saving}
        onPress={async () => {
          if (!userId) {
            setMessage("Sign in to manage tasks.");
            return;
          }
          const title = newTaskTitle.trim();
          if (!title) {
            setMessage("Task title is required.");
            return;
          }
          setSaving(true);
          const { error } = await supabase.rpc("create_planner_task", {
            p_title: title,
            p_scheduled_date: undefined,
          });
          if (error) {
            setMessage(error.message);
          } else {
            setNewTaskTitle("");
            setMessage("Task added.");
            await queryClient.invalidateQueries({
              queryKey: ["mobile-planner-tasks", userId],
            });
          }
          setSaving(false);
        }}
      />
      {tasksQuery.isLoading ? (
        <Text style={{ color: theme.colors.mutedForeground }}>Loading tasks...</Text>
      ) : tasksQuery.isError ? (
        <Text style={{ color: theme.colors.foreground }}>
          Could not load tasks. {tasksErrorMessage}
        </Text>
      ) : tasks.length === 0 ? (
        <Text style={{ color: theme.colors.mutedForeground }}>
          No tasks yet. Add one above.
        </Text>
      ) : (
        tasks.map((task) => {
          const complete = task.completed_at !== null;
          const busy = togglingTaskId === task.task_id;
          return (
            <Pressable
              key={task.task_id}
              style={[
                styles.taskRow,
                { borderColor: theme.colors.border, backgroundColor: theme.colors.card },
              ]}
              onPress={async () => {
                if (!userId) {
                  setMessage("Sign in to manage tasks.");
                  return;
                }
                setTogglingTaskId(task.task_id);
                const { error } = await supabase.rpc("set_planner_task_completion", {
                  p_task_id: task.task_id,
                  p_completed: !complete,
                });
                if (error) {
                  setMessage(error.message);
                } else {
                  await queryClient.invalidateQueries({
                    queryKey: ["mobile-planner-tasks", userId],
                  });
                }
                setTogglingTaskId(null);
              }}
              disabled={busy}
            >
              <View style={styles.taskLeft}>
                <Text style={{ color: complete ? theme.colors.primary : theme.colors.mutedForeground }}>
                  {complete ? "●" : "○"}
                </Text>
                <Text
                  style={{
                    color: complete ? theme.colors.mutedForeground : theme.colors.foreground,
                    textDecorationLine: complete ? "line-through" : "none",
                    flexShrink: 1,
                  }}
                >
                  {task.title}
                </Text>
              </View>
              <Text style={{ color: theme.colors.mutedForeground, fontSize: 12 }}>
                {task.scheduled_date}
              </Text>
            </Pressable>
          );
        })
      )}
      {message ? <Text style={{ color: theme.colors.foreground }}>{message}</Text> : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  inputRow: {
    gap: 8,
  },
  input: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  taskRow: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  taskLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flexShrink: 1,
  },
});
