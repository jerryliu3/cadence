import { after } from "next/server";

export function runAfterResponse(task: () => Promise<unknown> | unknown) {
  try {
    after(async () => {
      await task();
    });
  } catch {
    void Promise.resolve(task());
  }
}
