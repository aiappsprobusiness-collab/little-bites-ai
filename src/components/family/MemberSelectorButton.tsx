import { useState, useMemo, useCallback } from "react";
import { ChevronDown } from "lucide-react";
import { useFamily } from "@/contexts/FamilyContext";
import { useSubscription } from "@/hooks/useSubscription";
import { useAppStore } from "@/store/useAppStore";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export interface MemberSelectorButtonProps {
  /** Заблокировать клик (напр. при генерации плана). */
  disabled?: boolean;
  /** Вызвать при попытке клика в disabled-состоянии. */
  onGuardClick?: () => void;
  /** Вызвать при смене профиля (напр. Chat: очистить сообщения). */
  onProfileChange?: (memberId: string | "family") => void;
  /** Класс для контейнера. */
  className?: string;
}

/**
 * Универсальная кнопка выбора профиля ребёнка.
 * Free: по клику — paywall (Переключение профилей доступно в Premium).
 * Premium/Trial: по клику — диалог выбора (Семья / дети). Добавление — только в Профиле.
 */
export function MemberSelectorButton({
  disabled = false,
  onGuardClick,
  onProfileChange,
  className = "",
}: MemberSelectorButtonProps) {
  const { members, selectedMemberId, setSelectedMemberId, isFreeLocked } = useFamily();
  const { hasAccess } = useSubscription();
  const isFree = !hasAccess;
  const setPaywallCustomMessage = useAppStore((s) => s.setPaywallCustomMessage);
  const setShowPaywall = useAppStore((s) => s.setShowPaywall);

  const [showPicker, setShowPicker] = useState(false);

  const displayName = useMemo(() => {
    if (selectedMemberId === "family" || !selectedMemberId) return "Семья";
    return members.find((c) => c.id === selectedMemberId)?.name ?? "Семья";
  }, [selectedMemberId, members]);

  const handleClick = useCallback(() => {
    if (disabled) {
      onGuardClick?.();
      return;
    }
    if (isFreeLocked) {
      setPaywallCustomMessage("Переключение профилей доступно в Premium");
      setShowPaywall(true);
      return;
    }
    setShowPicker(true);
  }, [disabled, isFreeLocked, onGuardClick, setPaywallCustomMessage, setShowPaywall]);

  const selectMember = useCallback(
    (id: string | "family") => {
      setSelectedMemberId(id);
      onProfileChange?.(id);
      setShowPicker(false);
    },
    [setSelectedMemberId, onProfileChange]
  );

  const handlePickerOpenChange = useCallback(
    (open: boolean) => {
      if (disabled && open) {
        onGuardClick?.();
        return;
      }
      setShowPicker(open);
    },
    [disabled, onGuardClick]
  );

  if (members.length === 0) return null;

  const baseClasses =
    "flex items-center gap-1.5 rounded-full min-h-[40px] px-3 py-2 text-typo-muted font-semibold text-emerald-700 bg-emerald-50 whitespace-nowrap truncate max-w-[140px]";

  return (
    <>
      {isFreeLocked ? (
        <button
          type="button"
          onClick={handleClick}
          className={`${baseClasses} ${disabled ? "opacity-70 cursor-not-allowed pointer-events-none" : "hover:bg-emerald-100/90 active:bg-emerald-100 cursor-pointer"} ${className}`}
          aria-label="Профиль ребёнка"
        >
          <span className="truncate">{displayName}</span>
        </button>
      ) : (
        <button
          type="button"
          disabled={disabled}
          aria-disabled={disabled}
          onClick={handleClick}
          className={`${baseClasses} hover:bg-emerald-100/90 active:bg-emerald-100 border-0 shadow-none transition-colors ${disabled ? "opacity-70 cursor-not-allowed pointer-events-none" : ""} ${className}`}
          aria-label="Выбрать профиль"
        >
          <span className="truncate max-w-[120px]">{displayName}</span>
          <ChevronDown className="w-4 h-4 shrink-0 text-emerald-600/80" aria-hidden />
        </button>
      )}

      <Dialog open={showPicker} onOpenChange={handlePickerOpenChange}>
        <DialogContent className="rounded-2xl max-w-[90vw]">
          <DialogHeader>
            <DialogTitle className="text-typo-title font-semibold">Кому готовим?</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-1 py-2">
            {!isFree && (
              <button
                type="button"
                disabled={disabled}
                onClick={() => selectMember("family")}
                className={`text-left py-3 px-4 rounded-xl min-h-[44px] transition-colors disabled:opacity-70 ${selectedMemberId === "family" ? "bg-emerald-50 font-medium text-slate-900" : "hover:bg-slate-100 text-slate-700"}`}
              >
                Семья
              </button>
            )}
            {members.map((c) => (
              <button
                key={c.id}
                type="button"
                disabled={disabled}
                onClick={() => selectMember(c.id)}
                className={`text-left py-3 px-4 rounded-xl min-h-[44px] transition-colors disabled:opacity-70 ${selectedMemberId === c.id ? "bg-emerald-50 font-medium text-slate-900" : "hover:bg-slate-100 text-slate-700"}`}
              >
                {c.name}
              </button>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
