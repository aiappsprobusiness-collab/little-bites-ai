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
  /** light = компактная пилюля без тяжёлой заливки (Chat). */
  variant?: "default" | "light";
  /** Скрыть пункт «Семья» (только реальные профили). Используется во вкладке Чат. */
  hideFamilyOption?: boolean;
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
  variant = "default",
  hideFamilyOption = false,
}: MemberSelectorButtonProps) {
  const { members, selectedMemberId, setSelectedMemberId, isFreeLocked } = useFamily();
  const { hasAccess } = useSubscription();
  const isFree = !hasAccess;
  const setPaywallCustomMessage = useAppStore((s) => s.setPaywallCustomMessage);
  const setShowPaywall = useAppStore((s) => s.setShowPaywall);

  const [showPicker, setShowPicker] = useState(false);

  const displayName = useMemo(() => {
    if (hideFamilyOption && (selectedMemberId === "family" || !selectedMemberId)) {
      const first = members[0];
      return first?.name ?? "Выберите профиль";
    }
    if (selectedMemberId === "family" || !selectedMemberId) return "Семья";
    return members.find((c) => c.id === selectedMemberId)?.name ?? "Семья";
  }, [selectedMemberId, members, hideFamilyOption]);

  const isLight = variant === "light";
  const pillClasses = isLight
    ? "flex items-center gap-1.5 rounded-full min-h-[36px] h-9 px-3 py-2 text-sm font-medium text-foreground bg-muted/60 border border-border hover:bg-muted max-w-[120px] truncate"
    : "flex items-center gap-1.5 rounded-full min-h-[40px] px-3 py-2 text-typo-muted font-semibold text-primary bg-primary-pill whitespace-nowrap truncate max-w-[140px]";

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

  return (
    <>
      {isFreeLocked ? (
        <button
          type="button"
          onClick={handleClick}
          className={`${pillClasses} ${disabled ? "opacity-70 cursor-not-allowed pointer-events-none" : "hover:opacity-90 active:opacity-95 cursor-pointer"} ${className}`}
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
          className={`${pillClasses} hover:opacity-90 active:opacity-95 shadow-none transition-colors ${!isLight ? "border-0" : ""} ${disabled ? "opacity-70 cursor-not-allowed pointer-events-none" : ""} ${className}`}
          aria-label="Выбрать профиль"
        >
          <span className="truncate max-w-[100px]">{displayName}</span>
          <ChevronDown className={`shrink-0 text-muted-foreground ${isLight ? "w-3.5 h-3.5" : "w-4 h-4 text-primary opacity-80"}`} aria-hidden />
        </button>
      )}

      <Dialog open={showPicker} onOpenChange={handlePickerOpenChange}>
        <DialogContent className="rounded-2xl max-w-[90vw]">
          <DialogHeader>
            <DialogTitle className="text-typo-title font-semibold">Кому готовим?</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-1 py-2">
            {!isFree && !hideFamilyOption && (
              <button
                type="button"
                disabled={disabled}
                onClick={() => selectMember("family")}
                className={`text-left py-3 px-4 rounded-xl min-h-[44px] transition-colors disabled:opacity-70 ${selectedMemberId === "family" ? "bg-primary-light font-medium text-text-main" : "hover:bg-muted text-foreground"}`}
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
                className={`text-left py-3 px-4 rounded-xl min-h-[44px] transition-colors disabled:opacity-70 ${selectedMemberId === c.id ? "bg-primary-light font-medium text-text-main" : "hover:bg-muted text-foreground"}`}
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
