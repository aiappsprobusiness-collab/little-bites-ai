import { HintBadge } from "@/components/ui/HintBadge";
import { cn } from "@/lib/utils";

export type ChatModeHintMode = "member" | "family";

const FAMILY_TEXT = "Семья: блюда для общего стола";
const FAMILY_TOOLTIP = "Для малышей до 1 года питание обычно подбирают отдельно.";

export interface ChatModeHintProps {
  mode: ChatModeHintMode;
  className?: string;
}

/**
 * Подсказка в шапке Chat: только в режиме «Семья» — одна строка + «?» + tooltip.
 * В режиме конкретного профиля ничего не рендерит.
 */
export function ChatModeHint({ mode, className }: ChatModeHintProps) {
  if (mode === "member") return null;

  return <HintBadge text={FAMILY_TEXT} tooltip={FAMILY_TOOLTIP} className={className} />;
}
