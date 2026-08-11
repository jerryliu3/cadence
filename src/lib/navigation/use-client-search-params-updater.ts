"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { useCallback } from "react";

type HistoryMode = "push" | "replace";

export function useClientSearchParamsUpdater() {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const applySearchParams = useCallback(
    (
      update: (params: URLSearchParams) => void,
      mode: HistoryMode,
      state: Record<string, unknown> | null = null
    ) => {
      const params = new URLSearchParams(searchParams.toString());
      update(params);
      const query = params.toString();
      const nextUrl = query ? `${pathname}?${query}` : pathname;
      const currentQuery = searchParams.toString();
      const currentUrl = currentQuery ? `${pathname}?${currentQuery}` : pathname;
      if (nextUrl === currentUrl) {
        return;
      }
      if (mode === "push") {
        window.history.pushState(state, "", nextUrl);
      } else {
        window.history.replaceState(state, "", nextUrl);
      }
    },
    [pathname, searchParams]
  );

  return { applySearchParams };
}
