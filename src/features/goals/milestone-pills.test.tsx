import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { MilestonePills } from "./milestone-pills";

describe("MilestonePills", () => {
  it("renders milestone names and completion states", () => {
    render(
      <MilestonePills
        targetCount={3}
        completionDates={["2026-08-01", "2026-08-05"]}
        milestoneNames={["Kickoff", "Checkpoint", "Finish"]}
      />
    );

    expect(screen.getByText("Kickoff")).toBeInTheDocument();
    expect(screen.getByText("Checkpoint")).toBeInTheDocument();
    expect(screen.getByText("Finish")).toBeInTheDocument();
    expect(screen.getByText("2026-08-01")).toBeInTheDocument();
    expect(screen.getByText("2026-08-05")).toBeInTheDocument();
    expect(screen.getByText("Pending")).toBeInTheDocument();
  });

  it("supports maxVisible truncation with expand/collapse", async () => {
    const user = userEvent.setup();

    render(
      <MilestonePills
        targetCount={7}
        completionDates={[]}
        maxVisible={5}
      />
    );

    expect(screen.getByRole("button", { name: "Show 2 more milestones" })).toBeInTheDocument();
    expect(screen.queryByText("Milestone 6")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Show 2 more milestones" }));

    expect(screen.getByRole("button", { name: "Show fewer milestones" })).toBeInTheDocument();
    expect(screen.getByText("Milestone 6")).toBeInTheDocument();
    expect(screen.getByText("Milestone 7")).toBeInTheDocument();
  });
});
