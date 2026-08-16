import { describe, expect, it } from "vitest";
import { resolveMobileDefaultMainPageHref } from "./navigation-preference-routes";

describe("navigation preferences", () => {
  it("maps calendar preference to the calendar tab route", () => {
    expect(resolveMobileDefaultMainPageHref("calendar")).toBe("/(tabs)/calendar");
  });

  it("maps checklist preference to the checklist tab route", () => {
    expect(resolveMobileDefaultMainPageHref("checklist")).toBe("/(tabs)/checklist");
  });

  it("maps insights preference to the insights tab route", () => {
    expect(resolveMobileDefaultMainPageHref("insights")).toBe("/(tabs)/insights");
  });
});
