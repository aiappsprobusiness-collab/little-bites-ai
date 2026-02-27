import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { X, Plus } from "lucide-react";

export interface TagListEditorProps {
  label?: string;
  items: string[];
  inputValue: string;
  onInputChange: (value: string) => void;
  onAdd: (raw: string) => void;
  onEdit: (value: string, index: number) => void;
  onRemove: (index: number) => void;
  placeholder?: string;
  id?: string;
  /** Меньшие отступы (для страницы редактирования профиля) */
  compact?: boolean;
  /** Единый стиль: AddRow (поле + круглая кнопка), чипы rounded-full, helper 12 muted */
  unified?: boolean;
  /** Оливковые pill-теги для страницы профиля (profile-pill, profile-pill-add-btn, profile-tag-enter) */
  variant?: "default" | "pill";
  /** Подсказка под полем добавления (только при unified), например "запятая или Enter" */
  helperText?: string;
  /** Только чтение: input disabled/readOnly (для Free — тап по секции обрабатывается обёрткой → paywall) */
  readOnly?: boolean;
}

const chipBase =
  "inline-flex items-center gap-1.5 h-8 rounded-full px-3 text-[13px] font-normal bg-primary-light/80 text-foreground border-0 cursor-pointer hover:bg-primary-light transition-colors";

export function TagListEditor({
  label,
  items,
  inputValue,
  onInputChange,
  onAdd,
  onEdit,
  onRemove,
  placeholder = "Добавить (запятая или Enter)",
  id,
  compact = false,
  unified = false,
  variant = "default",
  helperText,
  readOnly = false,
}: TagListEditorProps) {
  const inputId = id ?? `tag-list-${(label ?? "tag").replace(/\s+/g, "-").toLowerCase()}`;
  const spaceClass = compact ? "space-y-1.5" : "space-y-2";
  const chipsMb = compact ? "mb-1" : "mb-2";
  const chipsGap = unified ? "gap-2" : "gap-2";
  const isPill = variant === "pill";
  const chipClassName = isPill ? "profile-pill profile-tag-enter" : chipBase;
  const addRowClass = isPill ? "flex h-11 items-center gap-3 px-4 rounded-xl border border-[#E5E7EB] bg-white hover:border-[#7A8F4D]/40 transition-colors cursor-text w-full" : "flex h-12 items-center gap-3 px-4 rounded-2xl border border-primary-border/60 bg-white hover:bg-muted/30 transition-colors cursor-text w-full";
  const addBtnClass = isPill ? "w-8 h-8 rounded-full flex items-center justify-center shrink-0 bg-[#7A8F4D] text-white hover:opacity-90 disabled:opacity-50" : "w-9 h-9 rounded-full bg-primary flex items-center justify-center shrink-0 text-primary-foreground hover:opacity-90 disabled:opacity-50";

  if (unified) {
    return (
      <div className="space-y-2">
        {label ? (
          <Label htmlFor={inputId} className={isPill ? "profile-label font-medium text-[#2F3A2E]" : "text-sm font-semibold text-foreground"}>
            {label}
          </Label>
        ) : null}
        {items.length > 0 && (
          <div className={`flex flex-wrap ${chipsGap}`}>
            {items.map((item, i) => (
              <div
                key={i}
                role="button"
                tabIndex={0}
                onClick={() => onEdit(item, i)}
                onKeyDown={(e) => e.key === "Enter" && onEdit(item, i)}
                className={chipClassName}
                style={isPill ? { background: "#EEF3E5", color: "#556B2F" } : undefined}
              >
                <span className="truncate max-w-[140px]">{item}</span>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onRemove(i);
                  }}
                  className={isPill ? "w-5 h-5 rounded-full flex items-center justify-center hover:bg-[#d4e0b8] shrink-0 -mr-0.5" : "w-7 h-7 rounded-full flex items-center justify-center hover:bg-primary-light shrink-0 -mr-0.5"}
                  aria-label="Удалить"
                >
                  <X className={isPill ? "w-3 h-3 text-[#556B2F]" : "w-3.5 h-3.5 text-muted-foreground"} />
                </button>
              </div>
            ))}
          </div>
        )}
        <label htmlFor={inputId} className={addRowClass}>
          <button
            type="button"
            className={addBtnClass}
            onClick={(e) => {
              e.preventDefault();
              if (!readOnly && inputValue.trim()) onAdd(inputValue);
            }}
            disabled={readOnly || !inputValue.trim()}
            aria-label="Добавить"
          >
            <Plus className={isPill ? "w-4 h-4" : "w-5 h-5"} />
          </button>
          <input
            id={inputId}
            value={inputValue}
            readOnly={readOnly}
            disabled={readOnly}
            onChange={(e) => {
              if (readOnly) return;
              const v = e.target.value;
              onInputChange(v);
              if (v.includes(",")) onAdd(v);
            }}
            onKeyDown={(e) => {
              if (readOnly) return;
              if (e.key === "Enter" || e.key === ",") {
                e.preventDefault();
                onAdd(inputValue);
              }
            }}
            placeholder={placeholder}
            className={`flex-1 min-w-0 border-0 bg-transparent py-2 text-[15px] font-medium text-foreground focus:outline-none focus:ring-0 ${isPill ? "placeholder:text-[#9CA3AF]" : "placeholder:text-muted-foreground"}`}
          />
        </label>
        {helperText && (
          <p className={isPill ? "text-[13px] text-[#9CA3AF] mt-1.5" : "text-[10px] text-muted-foreground/50 mt-0.5 truncate"}>{helperText}</p>
        )}
      </div>
    );
  }

  return (
    <div className={spaceClass}>
      <Label htmlFor={inputId} className="text-typo-muted font-medium">
        {label}
      </Label>
      <p className="text-typo-caption text-muted-foreground">
        Нажмите на чип для редактирования, крестик — удалить
      </p>
      <div className={`flex flex-wrap gap-2 ${chipsMb}`}>
        {items.map((item, i) => (
          <Badge
            key={i}
            variant="secondary"
            className="cursor-pointer gap-1 pr-1"
            onClick={() => onEdit(item, i)}
          >
            {item}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onRemove(i);
              }}
              className="rounded-full p-0.5 hover:bg-muted"
              aria-label="Удалить"
            >
              <X className="w-3 h-3" />
            </button>
          </Badge>
        ))}
      </div>
      <div className="flex gap-2">
        <Input
          id={inputId}
          value={inputValue}
          readOnly={readOnly}
          disabled={readOnly}
          onChange={(e) => {
            if (readOnly) return;
            const v = e.target.value;
            onInputChange(v);
            if (v.includes(",")) onAdd(v);
          }}
          onKeyDown={(e) => {
            if (readOnly) return;
            if (e.key === "Enter" || e.key === ",") {
              e.preventDefault();
              onAdd(inputValue);
            }
          }}
          placeholder={placeholder}
          className="h-11 border-2 flex-1"
        />
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="h-11 w-11 shrink-0"
          onClick={() => onAdd(inputValue)}
          disabled={readOnly || !inputValue.trim()}
          aria-label="Добавить"
        >
          <Plus className="w-5 h-5" />
        </Button>
      </div>
    </div>
  );
}
