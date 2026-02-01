import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { X } from "lucide-react";

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
}

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
}: TagListEditorProps) {
  const inputId = id ?? `tag-list-${label.replace(/\s+/g, "-").toLowerCase()}`;

  return (
    <div className="space-y-2">
      <Label htmlFor={inputId} className="text-sm font-medium">
        {label}
      </Label>
      <p className="text-xs text-muted-foreground">
        Нажмите на чип для редактирования, крестик — удалить
      </p>
      <div className="flex flex-wrap gap-2 mb-2">
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
      <Input
        id={inputId}
        value={inputValue}
        onChange={(e) => onInputChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === ",") {
            e.preventDefault();
            onAdd(inputValue);
          }
        }}
        placeholder={placeholder}
        className="h-11 border-2"
        readOnly={false}
      />
    </div>
  );
}
