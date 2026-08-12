import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { TabKeepaliveHost } from "@/components/layout/tab-keepalive-host";

vi.mock("@/features/planner/calendar-page-shell", () => ({
  CalendarPageShell: () => <div>Calendar Tab Content</div>,
}));

vi.mock("@/features/today/checklist-shell", () => ({
  ChecklistShell: () => <div>Checklist Tab Content</div>,
}));

vi.mock("@/features/insights/insights-tab", () => ({
  InsightsTab: () => <div>Insights Tab Content</div>,
}));

vi.mock("@/features/social/social-surface", () => ({
  SocialSurface: () => <div>Social Tab Content</div>,
}));

describe("TabKeepaliveHost", () => {
  it("keeps previously mounted tab sections in the DOM", async () => {
    const { rerender } = render(
      <TabKeepaliveHost activePath="/calendar" socialEnabled />
    );

    expect(screen.getByText("Calendar Tab Content")).toBeInTheDocument();
    expect(screen.queryByText("Insights Tab Content")).not.toBeInTheDocument();

    rerender(<TabKeepaliveHost activePath="/insights" socialEnabled />);

    expect(screen.getByText("Calendar Tab Content")).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByText("Insights Tab Content")).toBeInTheDocument();
    });
  });

  it("renders social disabled fallback when social flag is off", () => {
    render(<TabKeepaliveHost activePath="/social" socialEnabled={false} />);

    expect(screen.getByText("Social is not enabled yet")).toBeInTheDocument();
  });
});
