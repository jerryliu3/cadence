import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";
import { MilestonePills } from "@/features/goals/milestone-pills";

afterEach(() => {
  cleanup();
});

describe("MilestonePills", () => {
  it("renders a pill per target with default names and pending state", () => {
    render(<MilestonePills targetCount={3} completionDates={[]} />);

    expect(screen.getByText("Milestone 1")).toBeInTheDocument();
    expect(screen.getByText("Milestone 2")).toBeInTheDocument();
    expect(screen.getByText("Milestone 3")).toBeInTheDocument();
    expect(screen.getAllByText("Pending")).toHaveLength(3);
  });

  it("marks milestones complete when a completion date exists at that index", () => {
    render(
      <MilestonePills targetCount={2} completionDates={["2026-08-01"]} />
    );

    expect(screen.getByText("2026-08-01")).toBeInTheDocument();
    expect(screen.getAllByText("Pending")).toHaveLength(1);
  });

  it("uses provided milestone names over the default numbering", () => {
    render(
      <MilestonePills
        targetCount={2}
        completionDates={[]}
        milestoneNames={["5k run", "10k run"]}
      />
    );

    expect(screen.getByText("5k run")).toBeInTheDocument();
    expect(screen.getByText("10k run")).toBeInTheDocument();
  });

  it("falls back to the default name when a milestone name is blank", () => {
    render(
      <MilestonePills targetCount={2} completionDates={[]} milestoneNames={["Custom"]} />
    );

    expect(screen.getByText("Custom")).toBeInTheDocument();
    expect(screen.getByText("Milestone 2")).toBeInTheDocument();
  });

  it("clamps targetCount below 1 to a single milestone", () => {
    render(<MilestonePills targetCount={0} completionDates={[]} />);

    expect(screen.getByText("Milestone 1")).toBeInTheDocument();
  });

  it("uses a custom label when provided", () => {
    render(<MilestonePills targetCount={1} completionDates={[]} label="Steps" />);

    expect(screen.getByText("Steps")).toBeInTheDocument();
  });

  it("does not render a collapse toggle when maxVisible is not exceeded", () => {
    render(<MilestonePills targetCount={2} completionDates={[]} maxVisible={5} />);

    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("collapses beyond maxVisible and expands on click", async () => {
    const user = userEvent.setup();
    render(<MilestonePills targetCount={5} completionDates={[]} maxVisible={2} />);

    expect(screen.getByText("Milestone 1")).toBeInTheDocument();
    expect(screen.getByText("Milestone 2")).toBeInTheDocument();
    expect(screen.queryByText("Milestone 3")).not.toBeInTheDocument();

    const toggle = screen.getByRole("button", { name: "Show 3 more milestones" });
    await user.click(toggle);

    expect(screen.getByText("Milestone 3")).toBeInTheDocument();
    expect(screen.getByText("Milestone 5")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Show fewer milestones" })).toBeInTheDocument();
  });

  it("uses singular copy when exactly one milestone is hidden", () => {
    render(<MilestonePills targetCount={3} completionDates={[]} maxVisible={2} />);

    expect(screen.getByRole("button", { name: "Show 1 more milestone" })).toBeInTheDocument();
  });
});
