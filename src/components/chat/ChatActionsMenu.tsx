import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Pencil, Info, Mail, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

export interface ChatActionsMenuProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onNewChat: () => void;
  onAboutAssistant: () => void;
  onWriteUs: () => void;
}

/**
 * Меню дополнительных действий по кнопке «...»: белая карточка, иконки слева, стрелка справа.
 */
export function ChatActionsMenu({
  open,
  onOpenChange,
  onNewChat,
  onAboutAssistant,
  onWriteUs,
}: ChatActionsMenuProps) {
  const close = () => onOpenChange(false);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className={cn(
          "rounded-t-2xl max-h-[70vh] flex flex-col",
          "data-[state=open]:duration-300 data-[state=closed]:duration-200"
        )}
      >
        <SheetHeader className="text-left pb-2 pt-1">
          <SheetTitle className="text-lg font-semibold text-foreground">
            Действия
          </SheetTitle>
        </SheetHeader>
        <div className="flex flex-col gap-0.5 pb-6">
          <button
            type="button"
            onClick={() => {
              close();
              onNewChat();
            }}
            className={cn(
              "flex items-center gap-3 w-full py-3.5 px-4 rounded-xl",
              "text-left text-[15px] font-medium text-foreground",
              "hover:bg-muted/60 active:bg-muted transition-colors"
            )}
          >
            <Pencil className="w-5 h-5 shrink-0 text-muted-foreground" />
            <span className="flex-1">Создать новый чат</span>
            <ChevronRight className="w-4 h-4 shrink-0 text-muted-foreground" />
          </button>
          <button
            type="button"
            onClick={() => {
              close();
              onAboutAssistant();
            }}
            className={cn(
              "flex items-center gap-3 w-full py-3.5 px-4 rounded-xl",
              "text-left text-[15px] font-medium text-foreground",
              "hover:bg-muted/60 active:bg-muted transition-colors"
            )}
          >
            <Info className="w-5 h-5 shrink-0 text-muted-foreground" />
            <span className="flex-1">Что умеет Помощник</span>
            <ChevronRight className="w-4 h-4 shrink-0 text-muted-foreground" />
          </button>
          <button
            type="button"
            onClick={() => {
              close();
              onWriteUs();
            }}
            className={cn(
              "flex items-center gap-3 w-full py-3.5 px-4 rounded-xl",
              "text-left text-[15px] font-medium text-foreground",
              "hover:bg-muted/60 active:bg-muted transition-colors"
            )}
          >
            <Mail className="w-5 h-5 shrink-0 text-muted-foreground" />
            <span className="flex-1">Написать нам</span>
            <ChevronRight className="w-4 h-4 shrink-0 text-muted-foreground" />
          </button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
