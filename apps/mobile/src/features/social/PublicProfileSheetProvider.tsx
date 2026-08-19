import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react";
import { PublicProfileSheetModal } from "./PublicProfileSheetModal";

interface PublicProfileSheetContextValue {
  openPublicProfile: (subjectUserId: string) => void;
}

const PublicProfileSheetContext = createContext<PublicProfileSheetContextValue | null>(
  null
);

export function PublicProfileSheetProvider({
  children,
}: {
  children: ReactNode;
}) {
  const [subjectUserId, setSubjectUserId] = useState<string | null>(null);

  const openPublicProfile = useCallback((nextSubjectUserId: string) => {
    const normalizedSubjectUserId = nextSubjectUserId.trim();
    if (normalizedSubjectUserId.length === 0) {
      return;
    }
    setSubjectUserId(normalizedSubjectUserId);
  }, []);

  const closePublicProfile = useCallback(() => {
    setSubjectUserId(null);
  }, []);

  const value = useMemo(
    () => ({
      openPublicProfile,
    }),
    [openPublicProfile]
  );

  return (
    <PublicProfileSheetContext.Provider value={value}>
      {children}
      <PublicProfileSheetModal
        visible={subjectUserId !== null}
        subjectUserId={subjectUserId}
        onClose={closePublicProfile}
      />
    </PublicProfileSheetContext.Provider>
  );
}

export function usePublicProfileSheet(): PublicProfileSheetContextValue {
  const context = useContext(PublicProfileSheetContext);
  if (!context) {
    throw new Error("usePublicProfileSheet must be used within PublicProfileSheetProvider");
  }
  return context;
}
