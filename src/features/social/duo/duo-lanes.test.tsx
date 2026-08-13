import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { DuoLanes } from "@/features/social/duo/duo-lanes";

const viewer = { id: "viewer" as const, label: "Mine", readOnly: false };
const partner = {
  id: "partner" as const,
  label: "Alex",
  userId: "22222222-2222-4222-8222-222222222222",
  readOnly: true,
};

describe("DuoLanes", () => {
  it("owns lane headers outside the me scope", () => {
    render(
      <DuoLanes
        scope="partner"
        viewer={viewer}
        partner={partner}
        renderLane={(subject) => <p>{subject.id} lane</p>}
      />
    );
    expect(screen.getByText("Alex")).toBeInTheDocument();
    expect(screen.getByText("Read-only")).toBeInTheDocument();
    expect(screen.queryByText("Mine")).not.toBeInTheDocument();
  });

  it("hides headers in the viewer-only scope", () => {
    render(
      <DuoLanes
        scope="me"
        viewer={viewer}
        partner={partner}
        renderLane={() => <p>content</p>}
      />
    );
    expect(screen.queryByText("Mine")).not.toBeInTheDocument();
    expect(screen.getByText("content")).toBeInTheDocument();
  });
});
