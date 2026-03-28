import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ChatActionsMenu } from "@/components/chat/ChatActionsMenu";
import { TabOverflowIconButton } from "@/components/layout/TabOverflowIconButton";
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
        <TabOverflowIconButton
          aria-label="Дополнительные действия"
          aria-expanded={open}
          className={className}
        />
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
