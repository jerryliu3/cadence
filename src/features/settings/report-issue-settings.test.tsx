import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ReportIssueSettings } from "@/features/settings/report-issue-settings";

const mocks = vi.hoisted(() => ({
  postJson: vi.fn(),
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
}));

vi.mock("@/lib/api/client", () => ({
  getApiErrorMessage: () => "Issue could not be submitted.",
  postJson: mocks.postJson,
}));

vi.mock("sonner", () => ({
  toast: {
    success: mocks.toastSuccess,
    error: mocks.toastError,
  },
}));

describe("ReportIssueSettings", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it("submits title and description through the support endpoint", async () => {
    mocks.postJson.mockResolvedValue({
      issueId: "issue-1",
      emailDelivery: "sent",
    });

    render(<ReportIssueSettings />);

    fireEvent.change(screen.getByLabelText("Issue title"), {
      target: { value: "  Calendar card title wraps incorrectly  " },
    });
    fireEvent.change(screen.getByLabelText("Issue description"), {
      target: { value: "  Steps to reproduce...\n1) Open settings  " },
    });
    fireEvent.click(screen.getByRole("button", { name: "Submit issue" }));

    await waitFor(() => {
      expect(mocks.postJson).toHaveBeenCalledWith("/api/support/issues", {
        title: "Calendar card title wraps incorrectly",
        description: "Steps to reproduce...\n1) Open settings",
      });
    });
    expect(mocks.toastSuccess).toHaveBeenCalledWith(
      "Issue submitted. Email sent to support."
    );
    expect(
      (screen.getByLabelText("Issue title") as HTMLInputElement).value
    ).toBe("");
    expect(
      (screen.getByLabelText("Issue description") as HTMLTextAreaElement).value
    ).toBe("");
  });

  it("shows an error toast when submission fails", async () => {
    mocks.postJson.mockRejectedValue(new Error("Request failed"));

    render(<ReportIssueSettings />);

    fireEvent.change(screen.getByLabelText("Issue title"), {
      target: { value: "Cannot save preferences" },
    });
    fireEvent.change(screen.getByLabelText("Issue description"), {
      target: { value: "Save button does nothing." },
    });
    fireEvent.click(screen.getByRole("button", { name: "Submit issue" }));

    await waitFor(() => {
      expect(mocks.toastError).toHaveBeenCalledWith(
        "Issue could not be submitted."
      );
    });
  });
});
