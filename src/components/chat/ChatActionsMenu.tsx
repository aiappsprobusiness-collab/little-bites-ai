import { Pencil, Info, Mail, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

export interface ChatActionsMenuProps {
  onClose: () => void;
  onNewChat: () => void;
  onAboutAssistant: () => void;
  onWriteUs: () => void;
}

/**
 * Компактный список действий для поповера над строкой ввода: иконка, текст, стрелка.
 * Отображается в половину ширины, органично над полем ввода.
 */
export function ChatActionsMenu({
  onClose,
  onNewChat,
  onAboutAssistant,
  onWriteUs,
}: ChatActionsMenuProps) {
  const run = (fn: () => void) => {
    onClose();
    fn();
  };

  return (
    <div className="flex flex-col gap-0.5 py-1">
      <button
        type="button"
        onClick={() => run(onNewChat)}
        className={cn(
          "flex items-center gap-2.5 w-full py-2.5 px-3 rounded-xl",
          "text-left text-sm font-medium text-foreground",
          "hover:bg-muted/60 active:bg-muted transition-colors"
        )}
      >
        <Pencil className="w-4 h-4 shrink-0 text-muted-foreground" />
        <span className="flex-1">Создать новый чат</span>
        <ChevronRight className="w-3.5 h-3.5 shrink-0 text-muted-foreground" />
      </button>
      <button
        type="button"
        onClick={() => run(onAboutAssistant)}
        className={cn(
          "flex items-center gap-2.5 w-full py-2.5 px-3 rounded-xl",
          "text-left text-sm font-medium text-foreground",
          "hover:bg-muted/60 active:bg-muted transition-colors"
        )}
      >
        <Info className="w-4 h-4 shrink-0 text-muted-foreground" />
        <span className="flex-1">Что умеет помощник</span>
        <ChevronRight className="w-3.5 h-3.5 shrink-0 text-muted-foreground" />
      </button>
      <button
        type="button"
        onClick={() => run(onWriteUs)}
        className={cn(
          "flex items-center gap-2.5 w-full py-2.5 px-3 rounded-xl",
          "text-left text-sm font-medium text-foreground",
          "hover:bg-muted/60 active:bg-muted transition-colors"
        )}
      >
        <Mail className="w-4 h-4 shrink-0 text-muted-foreground" />
        <span className="flex-1">Написать нам</span>
        <ChevronRight className="w-3.5 h-3.5 shrink-0 text-muted-foreground" />
      </button>
    </div>
  );
}
