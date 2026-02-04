import { motion } from 'framer-motion';
import { Plus, Check } from 'lucide-react';
import { useFamily } from '@/contexts/FamilyContext';
import { cn } from '@/lib/utils';

interface MemberCarouselProps {
  onAddMember?: () => void;
  compact?: boolean;
}

export function MemberCarousel({ onAddMember, compact = false }: MemberCarouselProps) {
  const { members, selectedMemberId, setSelectedMemberId, formatAge, isLoading } = useFamily();

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

  if (members.length === 0) {
    return (
      <motion.button
        whileTap={{ scale: 0.95 }}
        onClick={onAddMember}
        className="flex items-center gap-3 px-4 py-3 rounded-2xl bg-muted border-2 border-dashed border-muted-foreground/30"
      >
        <Plus className="w-5 h-5 text-muted-foreground" />
        <span className="text-muted-foreground font-medium">Добавить члена семьи</span>
      </motion.button>
    );
  }

  return (
    <div className="flex gap-3 overflow-x-auto pb-2 -mx-4 px-4 scrollbar-hide">
      {members.slice(0, 10).map((member) => {
        const isSelected = selectedMemberId === member.id;

        return (
          <motion.button
            key={member.id}
            whileTap={{ scale: 0.95 }}
            onClick={() => setSelectedMemberId(member.id)}
            className={cn(
              "flex-shrink-0 flex flex-col items-center p-2 rounded-xl transition-all relative",
              compact ? "w-14" : "w-16",
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
                "rounded-lg flex items-center justify-center text-xl mb-1",
                compact ? "w-8 h-8" : "w-10 h-10",
                isSelected ? "bg-primary-foreground/20" : "bg-muted"
              )}
            >
              👤
            </div>
            <p
              className={cn(
                "font-semibold text-xs truncate w-full text-center",
                isSelected && "text-primary-foreground"
              )}
            >
              {member.name}
            </p>
            {!compact && (
              <p
                className={cn(
                  "text-xs truncate w-full text-center",
                  isSelected ? "text-primary-foreground/80" : "text-muted-foreground"
                )}
              >
                {formatAge(member.age_months ?? null)}
              </p>
            )}
          </motion.button>
        );
      })}

      {members.length < 10 && onAddMember && (
        <motion.button
          whileTap={{ scale: 0.95 }}
          onClick={onAddMember}
          className={cn(
            "flex-shrink-0 flex items-center justify-center rounded-xl bg-muted border-2 border-dashed border-muted-foreground/30",
            compact ? "w-14 h-14" : "w-16 h-20"
          )}
        >
          <Plus className="w-6 h-6 text-muted-foreground" />
        </motion.button>
      )}
    </div>
  );
}
