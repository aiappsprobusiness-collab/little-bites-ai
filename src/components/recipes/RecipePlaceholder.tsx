import { useMemo } from "react";
import { UtensilsCrossed } from "lucide-react";

interface RecipePlaceholderProps {
  title: string;
  className?: string;
}

// Predefined pastel gradient pairs for food-themed placeholders
const gradientPairs = [
  // Original pastel palette
  { from: "from-mint/60", to: "to-mint-dark/40", icon: "🥗" },
  { from: "from-peach/60", to: "to-peach-dark/40", icon: "🍑" },
  { from: "from-lavender/60", to: "to-lavender-dark/40", icon: "🍇" },
  { from: "from-amber-200/60", to: "to-orange-300/40", icon: "🥕" },
  { from: "from-emerald-200/60", to: "to-teal-300/40", icon: "🥦" },
  { from: "from-rose-200/60", to: "to-pink-300/40", icon: "🍓" },
  { from: "from-sky-200/60", to: "to-blue-300/40", icon: "🫐" },
  { from: "from-yellow-200/60", to: "to-amber-300/40", icon: "🍌" },
  { from: "from-lime-200/60", to: "to-green-300/40", icon: "🥒" },
  { from: "from-fuchsia-200/60", to: "to-purple-300/40", icon: "🍆" },
  // Extended warm palette
  { from: "from-orange-200/60", to: "to-red-300/40", icon: "🍅" },
  { from: "from-red-200/60", to: "to-rose-300/40", icon: "🍎" },
  { from: "from-amber-100/60", to: "to-yellow-300/40", icon: "🧀" },
  { from: "from-orange-100/60", to: "to-amber-200/40", icon: "🥐" },
  { from: "from-yellow-100/60", to: "to-orange-200/40", icon: "🍯" },
  // Extended cool palette
  { from: "from-cyan-200/60", to: "to-sky-300/40", icon: "🐟" },
  { from: "from-teal-200/60", to: "to-emerald-300/40", icon: "🥬" },
  { from: "from-green-200/60", to: "to-lime-300/40", icon: "🥝" },
  { from: "from-blue-200/60", to: "to-indigo-300/40", icon: "🫧" },
  { from: "from-indigo-200/60", to: "to-violet-300/40", icon: "🍠" },
  // Extended neutral/earthy palette
  { from: "from-stone-200/60", to: "to-amber-200/40", icon: "🍞" },
  { from: "from-zinc-200/60", to: "to-stone-300/40", icon: "🍄" },
  { from: "from-neutral-200/60", to: "to-warm-gray-300/40", icon: "🥜" },
  { from: "from-slate-200/60", to: "to-gray-300/40", icon: "🧆" },
  // Extended vibrant palette
  { from: "from-pink-200/60", to: "to-fuchsia-300/40", icon: "🍧" },
  { from: "from-violet-200/60", to: "to-purple-300/40", icon: "🍒" },
  { from: "from-purple-200/60", to: "to-pink-300/40", icon: "🧁" },
  { from: "from-rose-100/60", to: "to-pink-200/40", icon: "🍰" },
  // Breakfast/Dairy themed
  { from: "from-amber-50/70", to: "to-orange-200/50", icon: "🥚" },
  { from: "from-blue-100/60", to: "to-cyan-200/40", icon: "🥛" },
  { from: "from-yellow-50/70", to: "to-amber-200/50", icon: "🧇" },
  // Protein themed
  { from: "from-red-100/60", to: "to-orange-200/40", icon: "🍖" },
  { from: "from-orange-50/70", to: "to-red-200/50", icon: "🍗" },
  { from: "from-rose-100/60", to: "to-red-200/40", icon: "🥩" },
  // Sweet treats
  { from: "from-pink-100/60", to: "to-rose-200/40", icon: "🍪" },
  { from: "from-amber-100/70", to: "to-orange-200/50", icon: "🥮" },
  { from: "from-fuchsia-100/60", to: "to-pink-200/40", icon: "🎂" },
  // Grain/Carbs themed
  { from: "from-amber-200/50", to: "to-yellow-300/40", icon: "🍚" },
  { from: "from-orange-100/60", to: "to-amber-300/40", icon: "🍜" },
  { from: "from-yellow-200/50", to: "to-lime-200/40", icon: "🌽" },
];

// Generate a consistent hash from string (same name = same hash = same gradient)
function hashString(str: string): number {
  let hash = 0;
  const normalizedStr = str.toLowerCase().trim();
  for (let i = 0; i < normalizedStr.length; i++) {
    const char = normalizedStr.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return Math.abs(hash);
}

export function RecipePlaceholder({ title, className = "" }: RecipePlaceholderProps) {
  const gradientData = useMemo(() => {
    const hash = hashString(title);
    const index = hash % gradientPairs.length;
    return gradientPairs[index];
  }, [title]);

  // Get first 2 words for display
  const displayTitle = useMemo(() => {
    const words = title.split(" ").slice(0, 3);
    return words.join(" ");
  }, [title]);

  return (
    <div
      className={`relative w-full h-full bg-gradient-to-br ${gradientData.from} ${gradientData.to} flex flex-col items-center justify-center overflow-hidden ${className}`}
    >
      {/* Decorative circles */}
      <div className="absolute top-1/4 -left-8 w-24 h-24 rounded-full bg-white/20 blur-xl" />
      <div className="absolute bottom-1/4 -right-8 w-32 h-32 rounded-full bg-white/15 blur-2xl" />
      
      {/* Food emoji */}
      <span className="text-5xl mb-3 drop-shadow-sm">{gradientData.icon}</span>
      
      {/* Recipe title */}
      <div className="px-4 text-center">
        <p className="text-sm font-semibold text-foreground/80 line-clamp-2 drop-shadow-sm">
          {displayTitle}
        </p>
      </div>
      
      {/* Subtle pattern overlay */}
      <div 
        className="absolute inset-0 opacity-[0.03]"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg width='20' height='20' viewBox='0 0 20 20' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='%23000' fill-opacity='1'%3E%3Ccircle cx='3' cy='3' r='1'/%3E%3C/g%3E%3C/svg%3E")`,
        }}
      />
    </div>
  );
}
