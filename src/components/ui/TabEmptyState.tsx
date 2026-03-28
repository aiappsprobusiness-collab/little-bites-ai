import type { LucideIcon } from "lucide-react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export interface TabEmptyStateAction {
  label: React.ReactNode;
  onClick: () => void | Promise<void>;
  variant?: "default" | "outline";
  icon?: LucideIcon;
  disabled?: boolean;
}

export interface TabEmptyStateProps {
  icon: LucideIcon;
  title: string;
  description: string;
  primaryAction?: TabEmptyStateAction;
  secondaryAction?: TabEmptyStateAction;
  previewLine?: string;
  className?: string;
}

/**
 * Единое пустое состояние для вкладок: отступы, иконка в круге, кнопки primary/outline.
 */
export function TabEmptyState({
  icon: Icon,
  title,
  description,
  primaryAction,
  secondaryAction,
  previewLine,
  className,
}: TabEmptyStateProps) {
  const renderAction = (action: TabEmptyStateAction, key: string) => {
    const { label, onClick, variant = "default", icon: ActionIcon, disabled } = action;
    const isOutline = variant === "outline";
    return (
      <Button
        key={key}
        type="button"
        size="sm"
        variant={variant}
        disabled={disabled}
        onClick={onClick}
        className={cn(
          "w-full max-w-xs rounded-2xl justify-center gap-2",
          !isOutline && "bg-primary hover:opacity-90 text-primary-foreground border-0 shadow-soft",
          isOutline && "border-primary-border",
        )}
      >
        {ActionIcon != null && <ActionIcon className="w-4 h-4 shrink-0" aria-hidden />}
        {label}
      </Button>
    );
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      className={cn("flex flex-col items-center text-center px-4 py-10", className)}
    >
      <div
        className="flex h-14 w-14 items-center justify-center rounded-2xl bg-muted/50 text-muted-foreground mb-4"
        aria-hidden
      >
        <Icon className="w-7 h-7" strokeWidth={1.5} />
      </div>
      <h2 className="text-lg font-semibold text-foreground mb-2 max-w-sm">{title}</h2>
      <p className="text-sm text-muted-foreground leading-relaxed mb-3 max-w-sm">{description}</p>
      {previewLine != null && previewLine !== "" ? (
        <p className="text-xs text-muted-foreground/80 mb-4 tracking-tight max-w-sm">{previewLine}</p>
      ) : null}
      <div className="flex flex-col items-stretch w-full max-w-xs gap-2">
        {primaryAction != null && renderAction(primaryAction, "primary")}
        {secondaryAction != null && renderAction(secondaryAction, "secondary")}
      </div>
    </motion.div>
  );
}
