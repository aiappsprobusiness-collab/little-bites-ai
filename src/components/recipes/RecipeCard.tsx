import { motion } from "framer-motion";
import { Card, CardContent } from "@/components/ui/card";
import { Star, Clock, Baby } from "lucide-react";
import { cn } from "@/lib/utils";

interface RecipeCardProps {
  id: string;
  title: string;
  image: string;
  cookTime: string;
  ageRange: string;
  rating?: number;
  isFavorite?: boolean;
  onClick?: () => void;
}

export function RecipeCard({
  title,
  image,
  cookTime,
  ageRange,
  rating,
  isFavorite,
  onClick,
}: RecipeCardProps) {
  return (
    <motion.div
      whileHover={{ scale: 1.02 }}
      whileTap={{ scale: 0.98 }}
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
    >
      <Card
        variant="elevated"
        className="overflow-hidden cursor-pointer group"
        onClick={onClick}
      >
        <div className="relative aspect-[4/3] overflow-hidden">
          <img
            src={image}
            alt={title}
            className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
          />
          {isFavorite && (
            <div className="absolute top-3 right-3 w-8 h-8 rounded-full bg-card/90 backdrop-blur-sm flex items-center justify-center">
              <Star className="w-4 h-4 text-peach-dark fill-peach-dark" />
            </div>
          )}
        </div>
        <CardContent className="p-4">
          <h3 className="font-bold text-base mb-2 line-clamp-2">{title}</h3>
          <div className="flex items-center gap-3 text-sm text-muted-foreground">
            <div className="flex items-center gap-1">
              <Clock className="w-4 h-4" />
              <span>{cookTime}</span>
            </div>
            <div className="flex items-center gap-1">
              <Baby className="w-4 h-4" />
              <span>{ageRange}</span>
            </div>
            {rating && (
              <div className="flex items-center gap-1 ml-auto">
                <Star className="w-4 h-4 text-peach-dark fill-peach-dark" />
                <span className="font-medium text-foreground">{rating}</span>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}
