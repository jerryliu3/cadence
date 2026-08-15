import { describe, expect, it } from "vitest";
import { buildPasswordRecoveryRedirect } from "./password-recovery";

describe("buildPasswordRecoveryRedirect", () => {
  it("routes hosted API URLs to the secure web password form", () => {
    expect(
      buildPasswordRecoveryRedirect("https://app.example.com/api")
    ).toBe("https://app.example.com/reset-password");
  });

  it("preserves local HTTP origins for emulator development", () => {
    expect(buildPasswordRecoveryRedirect("http://10.0.2.2:3000")).toBe(
      "http://10.0.2.2:3000/reset-password"
    );
  });

  it("rejects public HTTP recovery origins", () => {
    expect(() =>
      buildPasswordRecoveryRedirect("http://app.example.com/api")
    ).toThrow("Password recovery requires HTTPS outside local development.");
  });
});
