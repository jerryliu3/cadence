import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { BulkGoalInputCard } from "@/features/today/bulk-goal-input-card";

afterEach(() => {
  cleanup();
});

function baseProps(overrides: Partial<Parameters<typeof BulkGoalInputCard>[0]> = {}) {
  return {
    inputMode: "natural_language" as const,
    onInputModeChange: vi.fn(),
    naturalLanguageInput: "",
    onNaturalLanguageInputChange: vi.fn(),
    csvInput: "",
    onCsvInputChange: vi.fn(),
    csvExample: "title,category\nRun 5k,health",
    onUseCsvExample: vi.fn(),
    parsing: false,
    onParseNaturalLanguage: vi.fn(),
    onParseCsv: vi.fn(),
    onFileChange: vi.fn(),
    onParseUploadedFile: vi.fn(),
    uploadedFileName: null,
    ...overrides,
  };
}

describe("BulkGoalInputCard", () => {
  it("renders the natural-language textarea in natural_language mode", () => {
    render(<BulkGoalInputCard {...baseProps()} />);

    expect(screen.getByLabelText("Describe goals in natural language")).toBeInTheDocument();
    expect(screen.queryByLabelText("Paste CSV content")).not.toBeInTheDocument();
  });

  it("renders CSV paste and file upload sections in csv mode", () => {
    render(<BulkGoalInputCard {...baseProps({ inputMode: "csv" })} />);

    expect(screen.getByLabelText("Paste CSV content")).toBeInTheDocument();
    expect(screen.getByLabelText("Upload file")).toBeInTheDocument();
    expect(
      screen.queryByLabelText("Describe goals in natural language")
    ).not.toBeInTheDocument();
  });

  it("shows the csv example content and calls onUseCsvExample", async () => {
    const onUseCsvExample = vi.fn();
    const user = userEvent.setup();
    render(
      <BulkGoalInputCard
        {...baseProps({ inputMode: "csv", onUseCsvExample })}
      />
    );

    expect(screen.getByText(/title,category/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Use this example" }));
    expect(onUseCsvExample).toHaveBeenCalledTimes(1);
  });

  it("switches modes when the mode toggle buttons are clicked", async () => {
    const onInputModeChange = vi.fn();
    const user = userEvent.setup();
    render(<BulkGoalInputCard {...baseProps({ onInputModeChange })} />);

    await user.click(screen.getByRole("button", { name: "CSV" }));
    expect(onInputModeChange).toHaveBeenCalledWith("csv");
  });

  it("calls onNaturalLanguageInputChange as the textarea changes", async () => {
    const onNaturalLanguageInputChange = vi.fn();
    const user = userEvent.setup();
    render(
      <BulkGoalInputCard
        {...baseProps({ onNaturalLanguageInputChange })}
      />
    );

    await user.type(
      screen.getByLabelText("Describe goals in natural language"),
      "x"
    );
    expect(onNaturalLanguageInputChange).toHaveBeenCalled();
  });

  it("calls onParseNaturalLanguage when the parse button is clicked", async () => {
    const onParseNaturalLanguage = vi.fn();
    const user = userEvent.setup();
    render(
      <BulkGoalInputCard {...baseProps({ onParseNaturalLanguage })} />
    );

    await user.click(screen.getByRole("button", { name: /parse natural language/i }));
    expect(onParseNaturalLanguage).toHaveBeenCalledTimes(1);
  });

  it("disables the parse buttons while parsing", () => {
    render(<BulkGoalInputCard {...baseProps({ parsing: true })} />);

    expect(screen.getByRole("button", { name: /parse natural language/i })).toBeDisabled();
  });

  it("disables the csv parse buttons while parsing in csv mode", () => {
    render(
      <BulkGoalInputCard {...baseProps({ inputMode: "csv", parsing: true })} />
    );

    expect(screen.getByRole("button", { name: /parse pasted csv/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: /parse uploaded file/i })).toBeDisabled();
  });

  it("calls onFileChange and onParseUploadedFile for the upload flow", async () => {
    const onFileChange = vi.fn();
    const onParseUploadedFile = vi.fn();
    const user = userEvent.setup();
    render(
      <BulkGoalInputCard
        {...baseProps({ inputMode: "csv", onFileChange, onParseUploadedFile })}
      />
    );

    const file = new File(["title\nRun"], "goals.csv", { type: "text/csv" });
    const input = screen.getByLabelText("Upload file");
    await user.upload(input, file);
    expect(onFileChange).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole("button", { name: /parse uploaded file/i }));
    expect(onParseUploadedFile).toHaveBeenCalledTimes(1);
  });

  it("shows the uploaded file name badge once a file has been selected", () => {
    render(
      <BulkGoalInputCard
        {...baseProps({ inputMode: "csv", uploadedFileName: "goals.csv" })}
      />
    );

    expect(screen.getByText("goals.csv")).toBeInTheDocument();
  });

  it("does not show a file name badge when no file has been uploaded", () => {
    render(<BulkGoalInputCard {...baseProps({ inputMode: "csv" })} />);

    expect(screen.queryByText(/\.csv|\.xlsx/)).not.toBeInTheDocument();
  });
});
