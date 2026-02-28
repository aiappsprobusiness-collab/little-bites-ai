import * as React from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export interface ConfirmActionModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  confirmText?: string;
  cancelText?: string;
  onConfirm: () => void | Promise<void>;
  onCancel?: () => void;
}

/**
 * Центральная модалка подтверждения в стиле «Очистить чат?»:
 * белая карточка, большие скругления, primary (оливковая заливка) + secondary (оливковый outline).
 */
export function ConfirmActionModal({
  open,
  onOpenChange,
  title,
  description,
  confirmText = "Очистить",
  cancelText = "Отмена",
  onConfirm,
  onCancel,
}: ConfirmActionModalProps) {
  const handleConfirm = React.useCallback(async () => {
    await onConfirm();
    onOpenChange(false);
  }, [onConfirm, onOpenChange]);

  const handleCancel = React.useCallback(() => {
    onCancel?.();
    onOpenChange(false);
  }, [onCancel, onOpenChange]);

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="rounded-2xl max-w-[calc(100vw-2rem)]">
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="flex-col gap-2 sm:flex-col">
          <AlertDialogAction
            onClick={(e) => {
              e.preventDefault();
              void handleConfirm();
            }}
            className="w-full rounded-full bg-primary text-primary-foreground hover:opacity-90"
          >
            {confirmText}
          </AlertDialogAction>
          <AlertDialogCancel
            onClick={handleCancel}
            className="w-full rounded-full border-primary text-primary"
          >
            {cancelText}
          </AlertDialogCancel>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
