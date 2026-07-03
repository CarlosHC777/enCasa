"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { ProfileId } from "@/types/domain";

const STORAGE_KEY = "encasa.activeProfileId";

interface ProfileContextValue {
  activeProfileId: ProfileId | null;
  /** true once localStorage has been read on the client. */
  ready: boolean;
  setActiveProfileId: (id: ProfileId) => void;
  clearActiveProfile: () => void;
}

const ProfileContext = createContext<ProfileContextValue | null>(null);

export function ProfileProvider({ children }: { children: ReactNode }) {
  const [activeProfileId, setActiveProfileIdState] = useState<ProfileId | null>(
    null
  );
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    setActiveProfileIdState(stored);
    setReady(true);
  }, []);

  const setActiveProfileId = useCallback((id: ProfileId) => {
    window.localStorage.setItem(STORAGE_KEY, id);
    setActiveProfileIdState(id);
  }, []);

  const clearActiveProfile = useCallback(() => {
    window.localStorage.removeItem(STORAGE_KEY);
    setActiveProfileIdState(null);
  }, []);

  const value = useMemo(
    () => ({ activeProfileId, ready, setActiveProfileId, clearActiveProfile }),
    [activeProfileId, ready, setActiveProfileId, clearActiveProfile]
  );

  return (
    <ProfileContext.Provider value={value}>{children}</ProfileContext.Provider>
  );
}

export function useActiveProfile() {
  const ctx = useContext(ProfileContext);
  if (!ctx) {
    throw new Error("useActiveProfile debe usarse dentro de ProfileProvider");
  }
  return ctx;
}
