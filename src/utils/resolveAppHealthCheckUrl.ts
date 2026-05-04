/** Минимальный набор env для резолва URL проверки (удобно тестировать без import.meta). */
export type HealthCheckEnv = {
  readonly VITE_APP_HEALTH_URL?: string;
  readonly VITE_SUPABASE_URL?: string;
};

/**
 * URL для HEAD/GET проверки доступности бэкенда.
 * Приоритет: `VITE_APP_HEALTH_URL`, иначе публичный health Supabase Auth.
 */
export function resolveAppHealthCheckUrlFromEnv(env: HealthCheckEnv): string | null {
  const custom = env.VITE_APP_HEALTH_URL?.trim();
  if (custom) return custom;
  const base = env.VITE_SUPABASE_URL?.replace(/\/+$/, "");
  if (base) return `${base}/auth/v1/health`;
  return null;
}

export function resolveAppHealthCheckUrl(): string | null {
  return resolveAppHealthCheckUrlFromEnv(import.meta.env);
}
