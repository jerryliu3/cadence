"use client";

import { PlannerTasksPanel } from "@/features/tasks/planner-tasks-panel";

export function TasksTab() {
  return (
    <div className="space-y-5">
      <PlannerTasksPanel
        title="To-Do"
        description="Create tasks, mark them done, and hard-delete tasks you no longer need."
        showScheduledDate
        allowDelete
      />
    </div>
  );
}
