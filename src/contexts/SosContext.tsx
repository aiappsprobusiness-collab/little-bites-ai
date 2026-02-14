import { createContext, useCallback, useContext, useState, type ReactNode } from "react";

export interface SosMessage {
  role: "user" | "assistant";
  content: string;
}

interface SosContextValue {
  messagesByScenario: Record<string, SosMessage[]>;
  appendMessage: (scenarioKey: string, message: SosMessage) => void;
}

const SosContext = createContext<SosContextValue | null>(null);

export function SosProvider({ children }: { children: ReactNode }) {
  const [messagesByScenario, setMessagesByScenario] = useState<Record<string, SosMessage[]>>({});

  const appendMessage = useCallback((scenarioKey: string, message: SosMessage) => {
    setMessagesByScenario((prev) => {
      const list = prev[scenarioKey] ?? [];
      return { ...prev, [scenarioKey]: [...list, message] };
    });
  }, []);

  return (
    <SosContext.Provider value={{ messagesByScenario, appendMessage }}>
      {children}
    </SosContext.Provider>
  );
}

export function useSosContext(): SosContextValue {
  const ctx = useContext(SosContext);
  if (!ctx) throw new Error("useSosContext must be used within SosProvider");
  return ctx;
}
