import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "./dialog";

describe("Dialog", () => {
  it("uses modal behavior by default", async () => {
    render(
      <>
        <div data-testid="background">Background content</div>
        <Dialog open>
          <DialogContent>
            <DialogTitle>Modal dialog</DialogTitle>
            <DialogDescription>Dialog details</DialogDescription>
          </DialogContent>
        </Dialog>
      </>
    );

    await waitFor(() => {
      expect(screen.getByTestId("background").parentElement).toHaveAttribute(
        "aria-hidden",
        "true"
      );
    });
  });
});
