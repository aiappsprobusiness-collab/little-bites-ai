import { motion } from "framer-motion";
import { Card, CardContent } from "@/components/ui/card";
import { Star, Clock } from "lucide-react";
import { RecipePlaceholder } from "./RecipePlaceholder";

interface RecipeListItemProps {
  id: string;
  title: string;
  image?: string | null;
  cookTime: string;
  ageRange?: string;
  childName?: string;
  rating?: number;
  isFavorite?: boolean;
  onClick?: () => void;
}

// Check if image URL is valid (not placeholder or empty)
function isValidImageUrl(url?: string | null): boolean {
  if (!url) return false;
  if (url.includes("unsplash.com")) return false; // Old placeholder URLs
  if (url.includes("placeholder")) return false;
  return true;
}

export function RecipeListItem({
  title,
  image,
  cookTime,
  ageRange,
  childName,
  rating,
  isFavorite,
  onClick,
}: RecipeListItemProps) {
  const hasValidImage = isValidImageUrl(image);

  return (
    <motion.div
      whileHover={{ scale: 1.01 }}
      whileTap={{ scale: 0.99 }}
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
    >
      <Card
        variant="elevated"
        className="overflow-hidden cursor-pointer group"
        onClick={onClick}
      >
        <div className="flex">
          <div className="relative w-24 h-24 flex-shrink-0 overflow-hidden">
            {hasValidImage ? (
              <img
                src={image!}
                alt={title}
                className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
              />
            ) : (
              <RecipePlaceholder 
                title={title} 
                className="transition-transform duration-300 group-hover:scale-105" 
              />
            )}
            {isFavorite && (
              <div className="absolute top-1 right-1 w-6 h-6 rounded-full bg-card/90 backdrop-blur-sm flex items-center justify-center">
                <Star className="w-3 h-3 text-peach-dark fill-peach-dark" />
              </div>
            )}
          </div>
          <CardContent className="p-3 flex-1 flex flex-col justify-center">
            <h3 className="font-bold text-sm mb-1 line-clamp-2">{title}</h3>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <div className="flex items-center gap-1">
                <Clock className="w-3 h-3" />
                <span>{cookTime}</span>
              </div>
              {rating && (
                <div className="flex items-center gap-1 ml-auto">
                  <Star className="w-3 h-3 text-peach-dark fill-peach-dark" />
                  <span className="font-medium text-foreground">{rating}</span>
                </div>
              )}
            </div>
          </CardContent>
        </div>
      </Card>
    </motion.div>
  );
}
