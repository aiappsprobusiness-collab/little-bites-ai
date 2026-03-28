import { FF_UNIFIED_PAYWALL } from "@/config/featureFlags";
import { LegacyPaywall, type PaywallSharedProps } from "./LegacyPaywall";
import { UnifiedPaywall } from "./UnifiedPaywall";

export type { PaywallSharedProps };

/**
 * Точка входа для paywall в приложении.
 *
 * **По умолчанию:** `UnifiedPaywall` — один layout и копирайт (`src/utils/unifiedPaywallCopy.ts`).
 *
 * **Legacy / откат:** в `.env` или CI задать `VITE_FF_UNIFIED_PAYWALL=false` → контекстный `LegacyPaywall`
 * (`paywallReasonCopy` по `paywall_reason`).
 */
export function Paywall(props: PaywallSharedProps) {
  if (FF_UNIFIED_PAYWALL) {
    return <UnifiedPaywall {...props} />;
  }
  return <LegacyPaywall {...props} />;
}

export { LegacyPaywall, UnifiedPaywall };
