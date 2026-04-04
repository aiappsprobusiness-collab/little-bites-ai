/**
 * Локальная диагностика React Query: логи invalidate/refetch и стартов fetch по query.
 * Включается только в DEV и при `?rqDebug=1` в URL (перезагрузить страницу с параметром).
 * В production-бандле компонент не монтируется из App.
 */
import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";

function isRqDebugUrl(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return new URLSearchParams(window.location.search).get("rqDebug") === "1";
  } catch {
    return false;
  }
}

export function ReactQueryDiag() {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!import.meta.env.DEV || !isRqDebugUrl()) return;

    const qc = queryClient;
    const origInvalidate = qc.invalidateQueries.bind(qc);
    const origRefetch = qc.refetchQueries.bind(qc);

    qc.invalidateQueries = ((filters) => {
      console.warn("[rqDebug] invalidateQueries", filters);
      return origInvalidate(filters);
    }) as typeof qc.invalidateQueries;

    qc.refetchQueries = ((filters) => {
      console.warn("[rqDebug] refetchQueries", filters);
      return origRefetch(filters);
    }) as typeof qc.refetchQueries;

    const cache = qc.getQueryCache();
    const unsub = cache.subscribe((event) => {
      if (event.type !== "updated") return;
      const q = event.query;
      if (q.state.fetchStatus !== "fetching") return;
      console.log("[rqDebug] query fetching", q.queryHash, q.queryKey);
    });

    console.info("[rqDebug] enabled: logs invalidate/refetch + query fetch starts. Reload without ?rqDebug=1 to disable.");

    return () => {
      qc.invalidateQueries = origInvalidate;
      qc.refetchQueries = origRefetch;
      unsub();
    };
  }, [queryClient]);

  return null;
}
