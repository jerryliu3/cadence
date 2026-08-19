const PUBLIC_PROFILE_OPEN_EVENT = "social:open-public-profile";

interface OpenPublicProfileDetail {
  subjectUserId: string;
}

export function emitOpenPublicProfile(subjectUserId: string) {
  if (typeof window === "undefined") {
    return;
  }
  window.dispatchEvent(
    new CustomEvent<OpenPublicProfileDetail>(PUBLIC_PROFILE_OPEN_EVENT, {
      detail: { subjectUserId },
    })
  );
}

export function subscribeOpenPublicProfile(
  onOpen: (subjectUserId: string) => void
) {
  if (typeof window === "undefined") {
    return () => undefined;
  }
  const listener = (event: Event) => {
    const detail = (event as CustomEvent<OpenPublicProfileDetail>).detail;
    if (!detail || typeof detail.subjectUserId !== "string") {
      return;
    }
    const normalized = detail.subjectUserId.trim();
    if (!normalized) {
      return;
    }
    onOpen(normalized);
  };
  window.addEventListener(PUBLIC_PROFILE_OPEN_EVENT, listener as EventListener);
  return () => {
    window.removeEventListener(PUBLIC_PROFILE_OPEN_EVENT, listener as EventListener);
  };
}
