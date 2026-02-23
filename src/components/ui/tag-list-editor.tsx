import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { X, Plus } from "lucide-react";

export interface TagListEditorProps {
  label: string;
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
  /** Подсказка под полем добавления (только при unified), например "запятая или Enter" */
  helperText?: string;
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
  helperText,
}: TagListEditorProps) {
  const inputId = id ?? `tag-list-${label.replace(/\s+/g, "-").toLowerCase()}`;
  const spaceClass = compact ? "space-y-1.5" : "space-y-2";
  const chipsMb = compact ? "mb-1" : "mb-2";
  const chipsGap = unified ? "gap-2" : "gap-2";

  if (unified) {
    return (
      <div className="space-y-2">
        <Label htmlFor={inputId} className="text-sm font-semibold text-foreground">
          {label}
        </Label>
        {items.length > 0 && (
          <div className={`flex flex-wrap ${chipsGap}`}>
            {items.map((item, i) => (
              <div
                key={i}
                role="button"
                tabIndex={0}
                onClick={() => onEdit(item, i)}
                onKeyDown={(e) => e.key === "Enter" && onEdit(item, i)}
                className={chipBase}
              >
                <span className="truncate max-w-[140px]">{item}</span>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onRemove(i);
                  }}
                  className="w-7 h-7 rounded-full flex items-center justify-center hover:bg-primary-light shrink-0 -mr-0.5"
                  aria-label="Удалить"
                >
                  <X className="w-3.5 h-3.5 text-muted-foreground" />
                </button>
              </div>
            ))}
          </div>
        )}
        <label htmlFor={inputId} className="flex h-12 items-center gap-3 px-4 rounded-2xl border border-primary-border/60 bg-white hover:bg-muted/30 transition-colors cursor-text w-full">
          <div className="w-9 h-9 rounded-full bg-primary flex items-center justify-center shrink-0 pointer-events-none" aria-hidden>
            <Plus className="w-5 h-5 text-primary-foreground" />
          </div>
          <input
            id={inputId}
            value={inputValue}
            onChange={(e) => {
              const v = e.target.value;
              onInputChange(v);
              if (v.includes(",")) onAdd(v);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === ",") {
                e.preventDefault();
                onAdd(inputValue);
              }
            }}
            placeholder={placeholder}
            className="flex-1 min-w-0 border-0 bg-transparent py-2 text-[15px] font-medium text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-0"
          />
        </label>
        {helperText && (
          <p className="text-[10px] text-muted-foreground/50 mt-0.5 truncate">{helperText}</p>
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
          onChange={(e) => {
            const v = e.target.value;
            onInputChange(v);
            if (v.includes(",")) onAdd(v);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === ",") {
              e.preventDefault();
              onAdd(inputValue);
            }
          }}
          placeholder={placeholder}
          className="h-11 border-2 flex-1"
          readOnly={false}
        />
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="h-11 w-11 shrink-0"
          onClick={() => onAdd(inputValue)}
          disabled={!inputValue.trim()}
          aria-label="Добавить"
        >
          <Plus className="w-5 h-5" />
        </Button>
      </div>
    </div>
  );
}
