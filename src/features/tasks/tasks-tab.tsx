"use client";

import { PlannerTasksPanel } from "@/features/tasks/planner-tasks-panel";

export function TasksTab() {
  return (
    <div className="space-y-5">
      <PlannerTasksPanel
        title="Tasks"
        description="Simple one-time tasks. Create, complete, and remove them without turning them into recurring goals."
        showScheduledDate
        allowDelete
      />
    </div>
  );
}
