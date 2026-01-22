import { motion } from 'framer-motion';
import { Plus, Check } from 'lucide-react';
import { useSelectedChild } from '@/contexts/SelectedChildContext';
import { cn } from '@/lib/utils';

interface ChildCarouselProps {
  onAddChild?: () => void;
  compact?: boolean;
}

export function ChildCarousel({ onAddChild, compact = false }: ChildCarouselProps) {
  const { children, selectedChildId, setSelectedChildId, formatAge, isLoading } = useSelectedChild();

  if (isLoading) {
    return (
      <div className="flex gap-3 overflow-x-auto pb-2 -mx-4 px-4">
        {[1, 2, 3].map((i) => (
          <div
            key={i}
            className="flex-shrink-0 w-20 h-24 rounded-2xl bg-muted animate-pulse"
          />
        ))}
      </div>
    );
  }

  if (children.length === 0) {
    return (
      <motion.button
        whileTap={{ scale: 0.95 }}
        onClick={onAddChild}
        className="flex items-center gap-3 px-4 py-3 rounded-2xl bg-muted border-2 border-dashed border-muted-foreground/30"
      >
        <Plus className="w-5 h-5 text-muted-foreground" />
        <span className="text-muted-foreground font-medium">Добавить ребенка</span>
      </motion.button>
    );
  }

  return (
    <div className="flex gap-3 overflow-x-auto pb-2 -mx-4 px-4 scrollbar-hide">
      {children.slice(0, 10).map((child) => {
        const isSelected = selectedChildId === child.id;
        
        return (
          <motion.button
            key={child.id}
            whileTap={{ scale: 0.95 }}
            onClick={() => setSelectedChildId(child.id)}
            className={cn(
              "flex-shrink-0 flex flex-col items-center p-3 rounded-2xl transition-all relative",
              compact ? "w-16" : "w-20",
              isSelected
                ? "bg-primary shadow-button"
                : "bg-card shadow-soft hover:shadow-card"
            )}
          >
            {isSelected && (
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-primary-foreground flex items-center justify-center"
              >
                <Check className="w-3 h-3 text-primary" />
              </motion.div>
            )}
            <div
              className={cn(
                "rounded-xl flex items-center justify-center text-2xl mb-1",
                compact ? "w-10 h-10" : "w-12 h-12",
                isSelected ? "bg-primary-foreground/20" : "bg-muted"
              )}
            >
              {child.avatar_url || "👶"}
            </div>
            <p
              className={cn(
                "font-semibold text-sm truncate w-full text-center",
                isSelected && "text-primary-foreground"
              )}
            >
              {child.name}
            </p>
            {!compact && (
              <p
                className={cn(
                  "text-xs truncate w-full text-center",
                  isSelected ? "text-primary-foreground/80" : "text-muted-foreground"
                )}
              >
                {formatAge(child.birth_date)}
              </p>
            )}
          </motion.button>
        );
      })}
      
      {children.length < 10 && onAddChild && (
        <motion.button
          whileTap={{ scale: 0.95 }}
          onClick={onAddChild}
          className={cn(
            "flex-shrink-0 flex items-center justify-center rounded-2xl bg-muted border-2 border-dashed border-muted-foreground/30",
            compact ? "w-16 h-16" : "w-20 h-24"
          )}
        >
          <Plus className="w-6 h-6 text-muted-foreground" />
        </motion.button>
      )}
    </div>
  );
}
