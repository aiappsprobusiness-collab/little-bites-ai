import { createContext, useContext, useState, useEffect, useCallback, useMemo, useRef, ReactNode } from "react";
import { useMembers } from "@/hooks/useMembers";
import { useSubscription } from "@/hooks/useSubscription";
import type { MembersRow } from "@/integrations/supabase/types-v2";

const SELECTED_MEMBER_ID_KEY = "selectedMemberId";
const PRIMARY_MEMBER_ID_KEY = "primaryMemberId";

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

function readStoredPrimaryMemberId(): string | null {
  try {
    if (typeof window === "undefined") return null;
    const s = localStorage.getItem(PRIMARY_MEMBER_ID_KEY);
    return typeof s === "string" && s.length > 0 ? s : null;
  } catch {
    return null;
  }
}

function writeStoredPrimaryMemberId(id: string | null): void {
  try {
    if (typeof window === "undefined") return;
    if (id == null || id === "") {
      localStorage.removeItem(PRIMARY_MEMBER_ID_KEY);
    } else {
      localStorage.setItem(PRIMARY_MEMBER_ID_KEY, id);
    }
  } catch {
    // ignore
  }
}

/** Детерминированный primary member для Free: 1) сохранённый и валидный, 2) первый по created_at ASC, 3) первый в списке. */
function computePrimaryMemberId(
  members: MembersRow[],
  ids: Set<string>
): string | null {
  if (members.length === 0) return null;
  const stored = readStoredPrimaryMemberId();
  if (stored && ids.has(stored)) return stored;
  const sorted = [...members].sort((a, b) => {
    const ca = (a as { created_at?: string }).created_at ?? "";
    const cb = (b as { created_at?: string }).created_at ?? "";
    return ca.localeCompare(cb);
  });
  const primary = sorted[0]?.id ?? members[0]?.id ?? null;
  if (primary) writeStoredPrimaryMemberId(primary);
  return primary;
}

export interface FamilyContextType {
  selectedMemberId: string | null;
  selectedMember: MembersRow | undefined;
  setSelectedMemberId: (id: string | null) => void;
  members: MembersRow[];
  isLoading: boolean;
  formatAge: (ageMonths: number | null) => string;
  /** Для Free: единственный доступный member. Premium/Trial: null. */
  primaryMemberId: string | null;
  /** Free: нельзя менять профиль. */
  isFreeLocked: boolean;
}

const FamilyContext = createContext<FamilyContextType | undefined>(undefined);

export function FamilyProvider({ children }: { children: ReactNode }) {
  const { hasAccess } = useSubscription();
  const { members, isLoading, formatAge } = useMembers();
  const isFreeLocked = !hasAccess;

  const [selectedMemberId, setSelectedMemberIdState] = useState<string | null>(() => readStoredMemberId());
  const restoredRef = useRef(false);

  const existingIds = useMemo(() => new Set(members.map((m) => m.id)), [members]);
  const primaryMemberId = useMemo(
    () => (isFreeLocked ? computePrimaryMemberId(members, existingIds) : null),
    [isFreeLocked, members, existingIds]
  );

  const effectiveSelectedId = isFreeLocked ? primaryMemberId : selectedMemberId;

  const setSelectedMemberId = useCallback(
    (id: string | null) => {
      if (isFreeLocked) return;
      setSelectedMemberIdState(id);
      writeStoredMemberId(id);
    },
    [isFreeLocked]
  );


  useEffect(() => {
    if (isFreeLocked) return;
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
  }, [isFreeLocked, isLoading, members, selectedMemberId]);

  useEffect(() => {
    if (isFreeLocked) return;
    if (members.length > 0 && !selectedMemberId) {
      setSelectedMemberIdState(members[0].id);
    }
    if (selectedMemberId && selectedMemberId !== "family" && !existingIds.has(selectedMemberId)) {
      setSelectedMemberIdState(members.length > 0 ? members[0].id : null);
    }
    if (members.length === 0 && selectedMemberId && selectedMemberId !== "family") {
      setSelectedMemberIdState(null);
    }
  }, [isFreeLocked, members, selectedMemberId, existingIds]);

  const selectedMember =
    effectiveSelectedId && effectiveSelectedId !== "family" && existingIds.has(effectiveSelectedId)
      ? members.find((m) => m.id === effectiveSelectedId)
      : undefined;

  return (
    <FamilyContext.Provider
      value={{
        selectedMemberId: effectiveSelectedId,
        selectedMember,
        setSelectedMemberId,
        members,
        isLoading,
        formatAge: (ageMonths) => formatAge(ageMonths),
        primaryMemberId,
        isFreeLocked,
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
