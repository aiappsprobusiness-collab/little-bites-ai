import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { useChildren } from '@/hooks/useChildren';
import type { Tables } from '@/integrations/supabase/types';

type Child = Tables<'children'>;

interface SelectedChildContextType {
  selectedChildId: string | null;
  selectedChild: Child | undefined;
  setSelectedChildId: (id: string | null) => void;
  children: Child[];
  isLoading: boolean;
  formatAge: (birthDate: string) => string;
}

const SelectedChildContext = createContext<SelectedChildContextType | undefined>(undefined);

export function SelectedChildProvider({ children: childrenProp }: { children: ReactNode }) {
  const { children, isLoading, formatAge } = useChildren();
  const [selectedChildId, setSelectedChildId] = useState<string | null>(null);

  // Auto-select first child when children load
  useEffect(() => {
    if (children.length > 0 && !selectedChildId) {
      setSelectedChildId(children[0].id);
    }
    // If selected child was deleted, select first available ("family" is never a child id)
    if (selectedChildId && selectedChildId !== "family" && children.length > 0 && !children.find(c => c.id === selectedChildId)) {
      setSelectedChildId(children[0].id);
    }
  }, [children, selectedChildId]);

  const selectedChild = children.find(c => c.id === selectedChildId);

  return (
    <SelectedChildContext.Provider
      value={{
        selectedChildId,
        selectedChild,
        setSelectedChildId,
        children,
        isLoading,
        formatAge,
      }}
    >
      {childrenProp}
    </SelectedChildContext.Provider>
  );
}

export function useSelectedChild() {
  const context = useContext(SelectedChildContext);
  if (context === undefined) {
    throw new Error('useSelectedChild must be used within a SelectedChildProvider');
  }
  return context;
}
