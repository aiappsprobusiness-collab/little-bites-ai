import { motion } from "framer-motion";
import { Card, CardContent } from "@/components/ui/card";
import { Star, Clock } from "lucide-react";
import { RecipePlaceholder } from "./RecipePlaceholder";

interface RecipeCardProps {
  id: string;
  title: string;
  image?: string | null;
  cookTime: string;
  ageRange?: string;
  childName?: string;
  rating?: number;
  isFavorite?: boolean;
  onClick?: () => void;
  size?: 'small' | 'medium' | 'large';
}

// Check if image URL is valid (not placeholder or empty)
function isValidImageUrl(url?: string | null): boolean {
  if (!url) return false;
  if (url.includes("unsplash.com")) return false; // Old placeholder URLs
  if (url.includes("placeholder")) return false;
  return true;
}

export function RecipeCard({
  title,
  image,
  cookTime,
  ageRange,
  childName,
  rating,
  isFavorite,
  onClick,
  size = 'medium',
}: RecipeCardProps) {
  const hasValidImage = isValidImageUrl(image);

  // Размеры в зависимости от пропса size
  const sizeClasses = {
    small: {
      grid: 'grid-cols-3',
      padding: 'p-2',
      title: 'text-typo-caption',
      icon: 'w-3 h-3',
      text: 'text-typo-caption',
      star: 'w-6 h-6',
      starIcon: 'w-3 h-3',
    },
    medium: {
      grid: 'grid-cols-2',
      padding: 'p-4',
      title: 'text-typo-body',
      icon: 'w-4 h-4',
      text: 'text-typo-muted',
      star: 'w-8 h-8',
      starIcon: 'w-4 h-4',
    },
    large: {
      grid: 'grid-cols-1',
      padding: 'p-5',
      title: 'text-typo-title',
      icon: 'w-5 h-5',
      text: 'text-typo-body',
      star: 'w-10 h-10',
      starIcon: 'w-5 h-5',
    },
  };

  const classes = sizeClasses[size];

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
            <div className={`absolute top-3 right-3 ${classes.star} rounded-full bg-card/90 backdrop-blur-sm flex items-center justify-center`}>
              <Star className={`${classes.starIcon} text-peach-dark fill-peach-dark`} />
            </div>
          )}
        </div>
        <CardContent className={classes.padding}>
          <h3 className={`font-bold ${classes.title} mb-2 line-clamp-2`}>{title}</h3>
          <div className={`flex items-center gap-3 ${classes.text} text-muted-foreground`}>
            <div className="flex items-center gap-1">
              <Clock className={classes.icon} />
              <span>{cookTime}</span>
            </div>
            {rating && (
              <div className="flex items-center gap-1 ml-auto">
                <Star className={`${classes.icon} text-peach-dark fill-peach-dark`} />
                <span className="font-medium text-foreground">{rating}</span>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}