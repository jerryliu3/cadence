/** Ask shell XP UI (e.g. XpLevelBadge) to refetch after ledger-changing writes. */
export function requestXpRefresh() {
  if (typeof window === "undefined") {
    return;
  }
  window.dispatchEvent(new CustomEvent("xp:refresh-requested"));
}
