import { afterEach, describe, expect, it } from "vitest";
import {
  readTabDataCache,
  resetTabDataCacheForTests,
  setTabDataCacheScope,
  writeTabDataCache,
} from "@/lib/cache/tab-data-cache";

describe("tab-data-cache scope isolation", () => {
  afterEach(() => {
    resetTabDataCacheForTests();
    window.sessionStorage.clear();
  });

  it("isolates cached values and purges prior scopes on user switch", () => {
    setTabDataCacheScope("user-a");
    writeTabDataCache("progress-context:test", { value: "A" });
    expect(readTabDataCache<{ value: string }>("progress-context:test")).toEqual({
      value: "A",
    });

    setTabDataCacheScope("user-b");
    expect(
      readTabDataCache<{ value: string }>("progress-context:test")
    ).toBeNull();
    const storageKeysAfterSwitch = Array.from(
      { length: window.sessionStorage.length },
      (_, index) => window.sessionStorage.key(index) ?? ""
    );
    expect(storageKeysAfterSwitch.some((key) => key.includes(":user-a:"))).toBe(false);

    writeTabDataCache("progress-context:test", { value: "B" });
    expect(readTabDataCache<{ value: string }>("progress-context:test")).toEqual({
      value: "B",
    });

    setTabDataCacheScope("user-a");
    expect(readTabDataCache<{ value: string }>("progress-context:test")).toBeNull();
  });
});
