import { MoreVertical } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ChatActionsMenu } from "@/components/chat/ChatActionsMenu";
import { cn } from "@/lib/utils";

export interface ChatHeaderMenuButtonProps {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  onNewChat: () => void;
  onAboutAssistant: () => void;
  onWriteUs: () => void;
  className?: string;
}

/**
 * Кнопка меню (⋮) для хедера вкладки «Чат». Открывает поповер с действиями:
 * новый чат, о помощнике, написать нам.
 */
export function ChatHeaderMenuButton({
  open,
  onOpenChange,
  onNewChat,
  onAboutAssistant,
  onWriteUs,
  className,
}: ChatHeaderMenuButtonProps) {
  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label="Дополнительные действия"
          aria-expanded={open}
          className={cn(
            "h-10 w-10 shrink-0 rounded-full flex items-center justify-center",
            "bg-muted/70 text-muted-foreground hover:bg-muted hover:text-foreground",
            "active:scale-95 transition-all",
            className
          )}
        >
          <MoreVertical className="w-5 h-5" aria-hidden />
        </button>
      </PopoverTrigger>
      <PopoverContent
        side="bottom"
        align="end"
        sideOffset={8}
        className={cn(
          "w-[min(50vw,260px)] p-2 rounded-2xl border border-border bg-card shadow-soft",
          "data-[state=open]:animate-in data-[state=closed]:animate-out",
          "data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
          "data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95",
          "data-[side=bottom]:slide-in-from-top-2"
        )}
      >
        <ChatActionsMenu
          onClose={() => onOpenChange?.(false)}
          onNewChat={onNewChat}
          onAboutAssistant={onAboutAssistant}
          onWriteUs={onWriteUs}
        />
      </PopoverContent>
    </Popover>
  );
}
