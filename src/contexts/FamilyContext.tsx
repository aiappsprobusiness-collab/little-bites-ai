import { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { useMembers } from "@/hooks/useMembers";
import type { MembersRow } from "@/integrations/supabase/types-v2";

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
  const [selectedMemberId, setSelectedMemberId] = useState<string | null>(null);

  const existingIds = new Set(members.map((m) => m.id));

  useEffect(() => {
    if (members.length > 0 && !selectedMemberId) {
      setSelectedMemberId(members[0].id);
    }
    if (selectedMemberId && selectedMemberId !== "family" && !existingIds.has(selectedMemberId)) {
      setSelectedMemberId(members.length > 0 ? members[0].id : null);
    }
    if (members.length === 0 && selectedMemberId && selectedMemberId !== "family") {
      setSelectedMemberId(null);
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
