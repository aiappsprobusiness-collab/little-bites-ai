import { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { useMembers } from "@/hooks/useMembers";
import type { MembersRow } from "@/integrations/supabase/types-v2";

/** В контексте под "children" отдаём список members (V2) для совместимости с чатом и планами. */
interface SelectedChildContextType {
  selectedChildId: string | null;
  selectedChild: MembersRow | undefined;
  setSelectedChildId: (id: string | null) => void;
  children: MembersRow[];
  isLoading: boolean;
  formatAge: (ageMonths: number | null) => string;
}

const SelectedChildContext = createContext<SelectedChildContextType | undefined>(undefined);

export function SelectedChildProvider({ children: childrenProp }: { children: ReactNode }) {
  const { members, isLoading, formatAge } = useMembers();
  const [selectedChildId, setSelectedChildId] = useState<string | null>(null);

  const existingIds = new Set(members.map((m) => m.id));

  useEffect(() => {
    if (members.length > 0 && !selectedChildId) {
      setSelectedChildId(members[0].id);
    }
    if (selectedChildId && selectedChildId !== "family" && !existingIds.has(selectedChildId)) {
      setSelectedChildId(members.length > 0 ? members[0].id : null);
    }
    if (members.length === 0 && selectedChildId && selectedChildId !== "family") {
      setSelectedChildId(null);
    }
  }, [members, selectedChildId]);

  const selectedChild =
    selectedChildId && selectedChildId !== "family" && existingIds.has(selectedChildId)
      ? members.find((m) => m.id === selectedChildId)
      : undefined;

  return (
    <SelectedChildContext.Provider
      value={{
        selectedChildId,
        selectedChild,
        setSelectedChildId,
        children: members,
        isLoading,
        formatAge: (ageMonths) => formatAge(ageMonths),
      }}
    >
      {childrenProp}
    </SelectedChildContext.Provider>
  );
}

export function useSelectedChild() {
  const context = useContext(SelectedChildContext);
  if (context === undefined) {
    throw new Error("useSelectedChild must be used within a SelectedChildProvider");
  }
  return context;
}
