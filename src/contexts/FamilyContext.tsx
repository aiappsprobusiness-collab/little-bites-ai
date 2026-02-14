import { createContext, useContext, useState, useEffect, useCallback, useRef, ReactNode } from "react";
import { useMembers } from "@/hooks/useMembers";
import type { MembersRow } from "@/integrations/supabase/types-v2";

const SELECTED_MEMBER_ID_KEY = "selectedMemberId";

function readStoredMemberId(): string | null {
  try {
    if (typeof window === "undefined") return null;
    const s = localStorage.getItem(SELECTED_MEMBER_ID_KEY);
    if (s === "family" || (typeof s === "string" && s.length > 0)) return s;
    return null;
  } catch {
    return null;
  }
}

function writeStoredMemberId(id: string | null): void {
  try {
    if (typeof window === "undefined") return;
    if (id == null || id === "") {
      localStorage.removeItem(SELECTED_MEMBER_ID_KEY);
    } else {
      localStorage.setItem(SELECTED_MEMBER_ID_KEY, id);
    }
  } catch {
    // ignore (SSR / private mode / quota)
  }
}

export interface FamilyContextType {
  selectedMemberId: string | null;
  selectedMember: MembersRow | undefined;
  setSelectedMemberId: (id: string | null) => void;
  members: MembersRow[];
  isLoading: boolean;
  formatAge: (ageMonths: number | null) => string;
}

const FamilyContext = createContext<FamilyContextType | undefined>(undefined);

export function FamilyProvider({ children }: { children: ReactNode }) {
  const { members, isLoading, formatAge } = useMembers();
  const [selectedMemberId, setSelectedMemberIdState] = useState<string | null>(() => readStoredMemberId());
  const restoredRef = useRef(false);

  const setSelectedMemberId = useCallback((id: string | null) => {
    setSelectedMemberIdState(id);
    writeStoredMemberId(id);
  }, []);

  const existingIds = new Set(members.map((m) => m.id));

  // Restore from localStorage when members become available (e.g. after reload)
  useEffect(() => {
    if (isLoading || members.length === 0) return;
    const ids = new Set(members.map((m) => m.id));
    const stored = readStoredMemberId();
    if (stored === null) {
      if (!selectedMemberId) setSelectedMemberIdState(members[0].id);
      restoredRef.current = true;
      return;
    }
    if (restoredRef.current) return;
    restoredRef.current = true;
    if (stored === "family") {
      setSelectedMemberIdState("family");
      return;
    }
    if (ids.has(stored)) {
      setSelectedMemberIdState(stored);
      return;
    }
    setSelectedMemberIdState(members[0].id);
  }, [isLoading, members, selectedMemberId]);

  useEffect(() => {
    if (members.length > 0 && !selectedMemberId) {
      setSelectedMemberIdState(members[0].id);
    }
    if (selectedMemberId && selectedMemberId !== "family" && !existingIds.has(selectedMemberId)) {
      setSelectedMemberIdState(members.length > 0 ? members[0].id : null);
    }
    if (members.length === 0 && selectedMemberId && selectedMemberId !== "family") {
      setSelectedMemberIdState(null);
    }
  }, [members, selectedMemberId]);

  const selectedMember =
    selectedMemberId && selectedMemberId !== "family" && existingIds.has(selectedMemberId)
      ? members.find((m) => m.id === selectedMemberId)
      : undefined;

  return (
    <FamilyContext.Provider
      value={{
        selectedMemberId,
        selectedMember,
        setSelectedMemberId,
        members,
        isLoading,
        formatAge: (ageMonths) => formatAge(ageMonths),
      }}
    >
      {children}
    </FamilyContext.Provider>
  );
}

export function useFamily() {
  const context = useContext(FamilyContext);
  if (context === undefined) {
    throw new Error("useFamily must be used within a FamilyProvider");
  }
  return context;
}
