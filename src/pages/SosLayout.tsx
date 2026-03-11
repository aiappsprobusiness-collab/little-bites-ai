import { Outlet } from "react-router-dom";
import { SosProvider } from "@/contexts/SosContext";
import { ErrorBoundary } from "@/components/ErrorBoundary";

/**
 * Layout для /sos: хранит историю сообщений по сценариям и рендерит дочерний роут.
 * Index => плитки (SosTiles), :scenarioKey => полноэкранный диалог (SosScenarioScreen).
 * Плитки и экран сценария не рендерятся одновременно — только один через Outlet.
 */
export default function SosLayout() {
  return (
    <SosProvider>
      <ErrorBoundary>
        <Outlet />
      </ErrorBoundary>
    </SosProvider>
  );
}
