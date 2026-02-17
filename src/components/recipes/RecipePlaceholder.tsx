import { useMemo } from "react";

interface RecipePlaceholderProps {
  title: string;
  className?: string;
}

// Keyword to emoji mapping for intelligent emoji selection
const keywordEmojiMap: { keywords: string[]; icon: string; gradient: { from: string; to: string } }[] = [
  // Творог и молочные запеканки
  { keywords: ["творог", "творожн", "сырник", "чизкейк"], icon: "🧀", gradient: { from: "from-amber-100/60", to: "to-yellow-200/40" } },

  // Овощные блюда
  { keywords: ["рагу", "овощ", "овощн"], icon: "🍲", gradient: { from: "from-orange-200/60", to: "to-amber-300/40" } },
  { keywords: ["морков", "каротел"], icon: "🥕", gradient: { from: "from-orange-200/60", to: "to-amber-300/40" } },
  { keywords: ["капуст", "брокколи", "цветн"], icon: "🥦", gradient: { from: "from-primary-light", to: "to-primary/30" } },
  { keywords: ["огурец", "огурч"], icon: "🥒", gradient: { from: "from-primary-light", to: "to-primary/30" } },
  { keywords: ["помидор", "томат"], icon: "🍅", gradient: { from: "from-red-200/60", to: "to-orange-300/40" } },
  { keywords: ["кабачок", "кабачк", "цуккини"], icon: "🥒", gradient: { from: "from-primary-light", to: "to-primary/30" } },
  { keywords: ["тыкв", "тыквен"], icon: "🎃", gradient: { from: "from-orange-200/60", to: "to-amber-300/40" } },
  { keywords: ["картофел", "картошк", "пюре"], icon: "🥔", gradient: { from: "from-amber-200/60", to: "to-yellow-300/40" } },
  { keywords: ["баклажан"], icon: "🍆", gradient: { from: "from-purple-200/60", to: "to-fuchsia-300/40" } },
  { keywords: ["перец", "болгарск"], icon: "🫑", gradient: { from: "from-red-200/60", to: "to-orange-300/40" } },
  { keywords: ["горох", "горошек"], icon: "🫛", gradient: { from: "from-primary-light", to: "to-primary/30" } },
  { keywords: ["кукуруз"], icon: "🌽", gradient: { from: "from-yellow-200/60", to: "to-amber-300/40" } },
  { keywords: ["шпинат", "салат", "зелен"], icon: "🥬", gradient: { from: "from-primary-light", to: "to-primary/30" } },
  { keywords: ["лук", "луков"], icon: "🧅", gradient: { from: "from-amber-100/60", to: "to-yellow-200/40" } },
  { keywords: ["чеснок", "чесноч"], icon: "🧄", gradient: { from: "from-stone-200/60", to: "to-amber-200/40" } },

  // Фрукты и ягоды
  { keywords: ["яблок", "яблочн"], icon: "🍎", gradient: { from: "from-red-200/60", to: "to-rose-300/40" } },
  { keywords: ["груш"], icon: "🍐", gradient: { from: "from-primary-light", to: "to-yellow-200/40" } },
  { keywords: ["банан"], icon: "🍌", gradient: { from: "from-yellow-200/60", to: "to-amber-300/40" } },
  { keywords: ["клубник", "клубничн"], icon: "🍓", gradient: { from: "from-rose-200/60", to: "to-pink-300/40" } },
  { keywords: ["черник", "черничн", "голубик"], icon: "🫐", gradient: { from: "from-indigo-200/60", to: "to-blue-300/40" } },
  { keywords: ["малин", "малинов"], icon: "🍇", gradient: { from: "from-pink-200/60", to: "to-rose-300/40" } },
  { keywords: ["виноград"], icon: "🍇", gradient: { from: "from-purple-200/60", to: "to-violet-300/40" } },
  { keywords: ["персик", "персиков"], icon: "🍑", gradient: { from: "from-peach/60", to: "to-peach-dark/40" } },
  { keywords: ["апельсин", "цитрус", "мандарин"], icon: "🍊", gradient: { from: "from-orange-200/60", to: "to-amber-300/40" } },
  { keywords: ["лимон"], icon: "🍋", gradient: { from: "from-yellow-200/60", to: "to-amber-200/40" } },
  { keywords: ["вишн", "черешн"], icon: "🍒", gradient: { from: "from-red-200/60", to: "to-rose-300/40" } },
  { keywords: ["арбуз"], icon: "🍉", gradient: { from: "from-red-200/60", to: "to-primary-light" } },
  { keywords: ["дын"], icon: "🍈", gradient: { from: "from-yellow-200/60", to: "to-primary-light" } },
  { keywords: ["манго"], icon: "🥭", gradient: { from: "from-orange-200/60", to: "to-yellow-300/40" } },
  { keywords: ["ананас"], icon: "🍍", gradient: { from: "from-yellow-200/60", to: "to-amber-300/40" } },
  { keywords: ["авокадо"], icon: "🥑", gradient: { from: "from-primary-light", to: "to-primary/30" } },

  // Запеканки и выпечка
  { keywords: ["запеканк"], icon: "🥧", gradient: { from: "from-amber-200/60", to: "to-orange-200/40" } },
  { keywords: ["пирог", "пирож"], icon: "🥧", gradient: { from: "from-amber-200/60", to: "to-orange-300/40" } },
  { keywords: ["торт", "бисквит"], icon: "🎂", gradient: { from: "from-pink-200/60", to: "to-rose-300/40" } },
  { keywords: ["кекс", "маффин", "капкейк"], icon: "🧁", gradient: { from: "from-pink-200/60", to: "to-fuchsia-200/40" } },
  { keywords: ["блин", "блинчик", "оладь", "панкейк"], icon: "🥞", gradient: { from: "from-amber-200/60", to: "to-yellow-300/40" } },
  { keywords: ["хлеб", "булк", "булочк"], icon: "🍞", gradient: { from: "from-amber-200/60", to: "to-orange-200/40" } },
  { keywords: ["круассан"], icon: "🥐", gradient: { from: "from-amber-100/60", to: "to-orange-200/40" } },
  { keywords: ["печень", "печенье"], icon: "🍪", gradient: { from: "from-amber-200/60", to: "to-orange-300/40" } },
  { keywords: ["вафл"], icon: "🧇", gradient: { from: "from-amber-200/60", to: "to-yellow-300/40" } },
  { keywords: ["пончик", "донат"], icon: "🍩", gradient: { from: "from-pink-200/60", to: "to-amber-200/40" } },

  // Молочные продукты
  { keywords: ["молок", "молочн", "кефир", "йогурт"], icon: "🥛", gradient: { from: "from-blue-100/60", to: "to-cyan-200/40" } },
  { keywords: ["сыр", "сырн"], icon: "🧀", gradient: { from: "from-amber-200/60", to: "to-yellow-300/40" } },
  { keywords: ["яйц", "яичн", "омлет", "глазунь"], icon: "🍳", gradient: { from: "from-yellow-100/60", to: "to-amber-200/40" } },
  { keywords: ["масл", "сливочн"], icon: "🧈", gradient: { from: "from-yellow-100/60", to: "to-amber-200/40" } },

  // Мясо
  { keywords: ["мяс", "мясн", "говядин", "свинин", "телятин"], icon: "🥩", gradient: { from: "from-red-200/60", to: "to-rose-300/40" } },
  { keywords: ["курин", "куриц", "курочк", "птиц"], icon: "🍗", gradient: { from: "from-orange-100/60", to: "to-amber-200/40" } },
  { keywords: ["индейк", "индюш"], icon: "🍗", gradient: { from: "from-amber-100/60", to: "to-orange-200/40" } },
  { keywords: ["котлет", "фрикадел", "тефтел"], icon: "🍖", gradient: { from: "from-red-200/60", to: "to-orange-300/40" } },
  { keywords: ["фарш"], icon: "🥩", gradient: { from: "from-red-100/60", to: "to-rose-200/40" } },
  { keywords: ["бекон", "ветчин", "колбас"], icon: "🥓", gradient: { from: "from-pink-200/60", to: "to-red-200/40" } },
  { keywords: ["сосиск", "сардельк"], icon: "🌭", gradient: { from: "from-red-200/60", to: "to-amber-200/40" } },
  { keywords: ["печён", "печен"], icon: "🫀", gradient: { from: "from-red-200/60", to: "to-rose-300/40" } },

  // Рыба и морепродукты
  { keywords: ["рыб", "лосос", "сёмг", "семг", "форел", "треск", "минтай", "хек"], icon: "🐟", gradient: { from: "from-cyan-200/60", to: "to-sky-300/40" } },
  { keywords: ["креветк", "креветоч"], icon: "🦐", gradient: { from: "from-orange-200/60", to: "to-pink-200/40" } },
  { keywords: ["краб"], icon: "🦀", gradient: { from: "from-red-200/60", to: "to-orange-300/40" } },
  { keywords: ["кальмар"], icon: "🦑", gradient: { from: "from-pink-200/60", to: "to-purple-200/40" } },

  // Крупы и каши
  { keywords: ["каш", "овсян", "геркулес", "манн"], icon: "🥣", gradient: { from: "from-amber-100/60", to: "to-yellow-200/40" } },
  { keywords: ["рис", "рисов", "ризотто"], icon: "🍚", gradient: { from: "from-stone-100/60", to: "to-amber-100/40" } },
  { keywords: ["греч", "гречнев"], icon: "🌾", gradient: { from: "from-amber-200/60", to: "to-stone-300/40" } },
  { keywords: ["макарон", "паст", "спагетт", "лапш"], icon: "🍝", gradient: { from: "from-amber-200/60", to: "to-yellow-300/40" } },

  // Супы
  { keywords: ["суп", "борщ", "щи", "бульон", "солянк"], icon: "🍲", gradient: { from: "from-orange-200/60", to: "to-red-200/40" } },
  { keywords: ["крем-суп", "пюре суп"], icon: "🥣", gradient: { from: "from-primary-light", to: "to-amber-200/40" } },

  // Напитки
  { keywords: ["смузи", "коктейл", "напиток", "сок"], icon: "🧃", gradient: { from: "from-pink-200/60", to: "to-orange-200/40" } },
  { keywords: ["компот", "морс", "кисел"], icon: "🍹", gradient: { from: "from-red-200/60", to: "to-pink-200/40" } },
  { keywords: ["чай"], icon: "🍵", gradient: { from: "from-primary-light", to: "to-amber-200/40" } },

  // Десерты
  { keywords: ["десерт", "пудинг", "крем", "мусс"], icon: "🍮", gradient: { from: "from-amber-100/60", to: "to-yellow-200/40" } },
  { keywords: ["мороженое", "пломбир"], icon: "🍨", gradient: { from: "from-pink-200/60", to: "to-blue-200/40" } },
  { keywords: ["желе"], icon: "🍧", gradient: { from: "from-pink-200/60", to: "to-purple-200/40" } },
  { keywords: ["шоколад", "какао"], icon: "🍫", gradient: { from: "from-amber-300/60", to: "to-orange-400/40" } },
  { keywords: ["мёд", "мед", "медов"], icon: "🍯", gradient: { from: "from-amber-200/60", to: "to-yellow-300/40" } },

  // Бобовые и орехи
  { keywords: ["фасол", "чечевиц", "нут", "бобов"], icon: "🫘", gradient: { from: "from-amber-200/60", to: "to-red-200/40" } },
  { keywords: ["орех", "ореш", "миндал", "фундук", "грецк"], icon: "🥜", gradient: { from: "from-amber-200/60", to: "to-orange-200/40" } },

  // Грибы
  { keywords: ["гриб", "шампиньон", "опят", "лисичк"], icon: "🍄", gradient: { from: "from-amber-200/60", to: "to-stone-300/40" } },
];

// Fallback gradient pairs when no keyword matches
const fallbackGradients = [
  { from: "from-primary-light", to: "to-primary/30", icon: "🥗" },
  { from: "from-peach/60", to: "to-peach-dark/40", icon: "🍽️" },
  { from: "from-lavender/60", to: "to-lavender-dark/40", icon: "🥄" },
  { from: "from-amber-200/60", to: "to-orange-300/40", icon: "🍴" },
  { from: "from-primary-light", to: "to-primary/30", icon: "🥢" },
  { from: "from-rose-200/60", to: "to-pink-300/40", icon: "👶" },
  { from: "from-sky-200/60", to: "to-blue-300/40", icon: "🍼" },
  { from: "from-yellow-200/60", to: "to-amber-300/40", icon: "🥣" },
  { from: "from-primary-light", to: "to-primary/30", icon: "🌿" },
  { from: "from-fuchsia-200/60", to: "to-purple-300/40", icon: "✨" },
];

// Generate a consistent hash from string for fallback
function hashString(str: string): number {
  let hash = 0;
  const normalizedStr = str.toLowerCase().trim();
  for (let i = 0; i < normalizedStr.length; i++) {
    const char = normalizedStr.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash);
}

// Find matching emoji and gradient based on keywords in title
// Используем приоритетную систему: сначала ищем специфичные ингредиенты, потом общие
function findMatchingEmoji(title: string): { icon: string; from: string; to: string } | null {
  const lowerTitle = title.toLowerCase();

  // Приоритетные категории (более специфичные ингредиенты)
  const priorityCategories = [
    // Рыба и морепродукты (высокий приоритет)
    { keywords: ["рыб", "лосос", "сёмг", "семг", "форел", "треск", "минтай", "хек", "рыбн"], icon: "🐟", gradient: { from: "from-cyan-200/60", to: "to-sky-300/40" } },
    { keywords: ["креветк", "креветоч"], icon: "🦐", gradient: { from: "from-orange-200/60", to: "to-pink-200/40" } },
    { keywords: ["краб"], icon: "🦀", gradient: { from: "from-red-200/60", to: "to-orange-300/40" } },
    { keywords: ["кальмар"], icon: "🦑", gradient: { from: "from-pink-200/60", to: "to-purple-200/40" } },

    // Крупы и каши (высокий приоритет)
    { keywords: ["каш", "овсян", "геркулес", "манн", "каша"], icon: "🥣", gradient: { from: "from-amber-100/60", to: "to-yellow-200/40" } },
    { keywords: ["рис", "рисов", "ризотто"], icon: "🍚", gradient: { from: "from-stone-100/60", to: "to-amber-100/40" } },
    { keywords: ["греч", "гречнев"], icon: "🌾", gradient: { from: "from-amber-200/60", to: "to-stone-300/40" } },

    // Мясо (высокий приоритет)
    { keywords: ["мяс", "мясн", "говядин", "свинин", "телятин"], icon: "🥩", gradient: { from: "from-red-200/60", to: "to-rose-300/40" } },
    { keywords: ["курин", "куриц", "курочк", "птиц"], icon: "🍗", gradient: { from: "from-orange-100/60", to: "to-amber-200/40" } },
    { keywords: ["индейк", "индюш"], icon: "🍗", gradient: { from: "from-amber-100/60", to: "to-orange-200/40" } },

    // Овощи (средний приоритет)
    { keywords: ["морков", "каротел"], icon: "🥕", gradient: { from: "from-orange-200/60", to: "to-amber-300/40" } },
    { keywords: ["капуст", "брокколи", "цветн"], icon: "🥦", gradient: { from: "from-primary-light", to: "to-primary/30" } },
    { keywords: ["помидор", "томат"], icon: "🍅", gradient: { from: "from-red-200/60", to: "to-orange-300/40" } },
    { keywords: ["картофел", "картошк"], icon: "🥔", gradient: { from: "from-amber-200/60", to: "to-yellow-300/40" } },
    { keywords: ["баклажан"], icon: "🍆", gradient: { from: "from-purple-200/60", to: "to-fuchsia-300/40" } },
    { keywords: ["тыкв", "тыквен"], icon: "🎃", gradient: { from: "from-orange-200/60", to: "to-amber-300/40" } },

    // Бобовые
    { keywords: ["фасол", "чечевиц", "нут", "бобов"], icon: "🫘", gradient: { from: "from-amber-200/60", to: "to-red-200/40" } },
  ];

  // Сначала проверяем приоритетные категории
  for (const category of priorityCategories) {
    for (const keyword of category.keywords) {
      if (lowerTitle.includes(keyword)) {
        return {
          icon: category.icon,
          from: category.gradient.from,
          to: category.gradient.to,
        };
      }
    }
  }

  // Если не нашли в приоритетных, ищем в остальных
  for (const mapping of keywordEmojiMap) {
    // Пропускаем уже проверенные категории
    const isPriorityCategory = priorityCategories.some(pc =>
      pc.keywords.some(k => mapping.keywords.includes(k))
    );
    if (isPriorityCategory) continue;

    for (const keyword of mapping.keywords) {
      if (lowerTitle.includes(keyword)) {
        return {
          icon: mapping.icon,
          from: mapping.gradient.from,
          to: mapping.gradient.to,
        };
      }
    }
  }

  return null;
}

export function RecipePlaceholder({ title, className = "" }: RecipePlaceholderProps) {
  const gradientData = useMemo(() => {
    // First try to find a matching emoji based on keywords
    const keywordMatch = findMatchingEmoji(title);
    if (keywordMatch) {
      return keywordMatch;
    }

    // Fallback to hash-based selection
    const hash = hashString(title);
    const index = hash % fallbackGradients.length;
    return fallbackGradients[index];
  }, [title]);

  return (
    <div
      className={`relative w-full h-full bg-gradient-to-br ${gradientData.from} ${gradientData.to} flex flex-col items-center justify-center overflow-hidden ${className}`}
    >
      {/* Decorative circles */}
      <div className="absolute top-1/4 -left-8 w-24 h-24 rounded-full bg-white/20 blur-xl" />
      <div className="absolute bottom-1/4 -right-8 w-32 h-32 rounded-full bg-white/15 blur-2xl" />

      {/* Food emoji - только эмодзи, без названия */}
      <span className="text-6xl drop-shadow-lg">{gradientData.icon}</span>

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
