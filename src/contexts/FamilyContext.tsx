import { createContext, useContext, useState, useEffect, useCallback, useMemo, useRef, ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { useMembers } from "@/hooks/useMembers";
import { useSubscription } from "@/hooks/useSubscription";
import { supabase } from "@/integrations/supabase/client";
import type { MembersRow } from "@/integrations/supabase/types-v2";
import { setLastActiveMemberProfile } from "@/utils/lastActiveMemberProfile";

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

/** Fallback: самый «ранний» member по created_at (если есть), иначе по id — не порядок сортировки по имени из запроса. */
function pickFirstMemberIdByCreatedAt(members: MembersRow[]): string | null {
  if (members.length === 0) return null;
  const sorted = [...members].sort((a, b) => {
    const ca = (a as { created_at?: string }).created_at ?? "";
    const cb = (b as { created_at?: string }).created_at ?? "";
    if (ca !== cb) return ca.localeCompare(cb);
    return a.id.localeCompare(b.id);
  });
  return sorted[0]?.id ?? members[0]?.id ?? null;
}

/** Детерминированный primary member для Free: 1) сохранённый и валидный, 2) первый по created_at / id, 3) первый в списке. */
function computePrimaryMemberId(
  members: MembersRow[],
  ids: Set<string>
): string | null {
  if (members.length === 0) return null;
  const stored = readStoredPrimaryMemberId();
  if (stored && ids.has(stored)) return stored;
  const primary = pickFirstMemberIdByCreatedAt(members);
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
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { hasAccess, lastActiveMemberId, isLoading: isProfileLoading } = useSubscription();
  const { members, isLoading: isMembersLoading, formatAge, normalizeAllergiesForFree } = useMembers();
  const isFreeLocked = !hasAccess;
  const normalizedAllergiesForFreeRef = useRef(false);

  const [selectedMemberId, setSelectedMemberIdState] = useState<string | null>(() => readStoredMemberId());
  const paidInitDoneRef = useRef(false);

  const existingIds = useMemo(() => new Set(members.map((m) => m.id)), [members]);
  useEffect(() => {
    if (!isFreeLocked || members.length === 0 || normalizedAllergiesForFreeRef.current) return;
    normalizedAllergiesForFreeRef.current = true;
    normalizeAllergiesForFree().catch(() => {});
  }, [isFreeLocked, members.length, normalizeAllergiesForFree]);

  useEffect(() => {
    if (!isFreeLocked) normalizedAllergiesForFreeRef.current = false;
  }, [isFreeLocked]);

  /** Safe downgrade (paid → free): только один профиль активен. Вызывается при логине, инициализации и смене subscriptionStatus. */
  const primaryMemberId = useMemo(
    () => (isFreeLocked ? computePrimaryMemberId(members, existingIds) : null),
    [isFreeLocked, members, existingIds]
  );

  const effectiveSelectedId = isFreeLocked ? primaryMemberId : selectedMemberId;

  const persistLastActiveToProfile = useCallback(
    async (userId: string, memberId: string | null) => {
      await setLastActiveMemberProfile(supabase, userId, memberId);
      await queryClient.invalidateQueries({ queryKey: ["profile-subscription", userId] });
    },
    [queryClient]
  );

  const setSelectedMemberId = useCallback(
    (id: string | null) => {
      if (isFreeLocked) return;
      setSelectedMemberIdState(id);
      writeStoredMemberId(id);
      const dbId = id && id !== "family" ? id : null;
      if (user?.id) {
        void persistLastActiveToProfile(user.id, dbId).catch(() => {});
      }
    },
    [isFreeLocked, user?.id, persistLastActiveToProfile]
  );

  useEffect(() => {
    paidInitDoneRef.current = false;
  }, [user?.id, isFreeLocked]);

  /**
   * Premium/Trial: после загрузки members + profiles_v2 выставить выбор по last_active_member_id,
   * иначе fallback (правила — docs/architecture/domain-map.md).
   */
  useEffect(() => {
    if (isFreeLocked || !user) return;
    if (isMembersLoading) return;

    if (members.length === 0) {
      paidInitDoneRef.current = false;
      if (selectedMemberId !== null) {
        setSelectedMemberIdState(null);
        writeStoredMemberId(null);
      }
      return;
    }

    if (isProfileLoading) return;

    if (!paidInitDoneRef.current) {
      paidInitDoneRef.current = true;
      const ids = new Set(members.map((m) => m.id));

      let target: string;
      if (lastActiveMemberId && ids.has(lastActiveMemberId)) {
        target = lastActiveMemberId;
      } else {
        const cached = readStoredMemberId();
        if (lastActiveMemberId == null && cached === "family") {
          target = "family";
        } else {
          const fb = pickFirstMemberIdByCreatedAt(members);
          if (!fb) return;
          target = fb;
          const needSync =
            lastActiveMemberId == null ||
            (lastActiveMemberId != null && !ids.has(lastActiveMemberId));
          if (needSync) {
            void persistLastActiveToProfile(user.id, fb).catch(() => {});
          }
        }
      }

      setSelectedMemberIdState(target);
      writeStoredMemberId(target);
    }
  }, [
    isFreeLocked,
    user?.id,
    isMembersLoading,
    isProfileLoading,
    members,
    lastActiveMemberId,
    selectedMemberId,
    persistLastActiveToProfile,
  ]);

  useEffect(() => {
    if (isFreeLocked || !user) return;
    if (isMembersLoading || isProfileLoading) return;
    if (!paidInitDoneRef.current) return;
    if (members.length === 0) return;

    const ids = new Set(members.map((m) => m.id));
    const fallback = pickFirstMemberIdByCreatedAt(members);
    if (!fallback) return;

    if (selectedMemberId && selectedMemberId !== "family" && !ids.has(selectedMemberId)) {
      setSelectedMemberIdState(fallback);
      writeStoredMemberId(fallback);
      void persistLastActiveToProfile(user.id, fallback).catch(() => {});
    }
  }, [
    isFreeLocked,
    user?.id,
    isMembersLoading,
    isProfileLoading,
    members,
    selectedMemberId,
    persistLastActiveToProfile,
  ]);

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
        isLoading: isMembersLoading,
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
