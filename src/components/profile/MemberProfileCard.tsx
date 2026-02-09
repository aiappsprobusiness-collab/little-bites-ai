import { motion } from "framer-motion";
import { Baby, ChefHat, Sparkles } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

interface MemberProfileCardProps {
  name: string;
  age: string;
  avatarEmoji: string;
  allergies?: string[];
  recipesCount: number;
  onClick?: () => void;
}

export function MemberProfileCard({
  name,
  age,
  avatarEmoji,
  allergies = [],
  recipesCount,
  onClick,
}: MemberProfileCardProps) {
  return (
    <motion.div
      whileTap={{ scale: 0.98 }}
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
    >
      <Card
        variant="mint"
        className="overflow-hidden cursor-pointer"
        onClick={onClick}
      >
        <CardContent className="p-5">
          <div className="flex items-start gap-4">
            <div className="w-16 h-16 rounded-2xl bg-card shadow-soft flex items-center justify-center text-3xl">
              {avatarEmoji}
            </div>
            <div className="flex-1">
              <h3 className="text-typo-title font-bold">{name}</h3>
              <p className="text-typo-muted text-muted-foreground flex items-center gap-1">
                <Baby className="w-4 h-4" />
                {age}
              </p>
              {allergies.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {allergies.map((allergy) => (
                    <span
                      key={allergy}
                      className="px-2 py-0.5 text-typo-caption rounded-full bg-destructive/10 text-destructive font-medium"
                    >
                      {allergy}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>
          <div className="flex items-center gap-4 mt-4 pt-4 border-t border-primary/20">
            <div className="flex items-center gap-2 text-typo-muted">
              <ChefHat className="w-4 h-4 text-primary" />
              <span className="font-medium">{recipesCount} рецептов</span>
            </div>
            <div className="flex items-center gap-2 text-sm ml-auto">
              <Sparkles className="w-4 h-4 text-peach-dark" />
              <span className="font-medium">ИИ рекомендации</span>
            </div>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}
