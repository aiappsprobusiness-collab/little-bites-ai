/**
 * Генерация curated infant seed-рецептов (6–11 мес) для импорта в БД.
 * Инварианты: source seed, ≥3 ингредиента, lunch/dinner без подстроки «пюре» в title,
 * обеды со словом «суп» + is_soup для совместимости с generate-plan.
 */

export const INFANT_SEED_BATCH_TAG = "infant_curated_batch1";

const MEALS = ["breakfast", "lunch", "snack", "dinner"];

/** Овощи / основы (широта пула) */
const VEG = [
  { key: "zucchini", ofWhat: "кабачком", product: "Кабачок", g: 80 },
  { key: "pumpkin", ofWhat: "тыквой", product: "Тыква", g: 70 },
  { key: "carrot", ofWhat: "морковью", product: "Морковь", g: 60 },
  { key: "cauliflower", ofWhat: "цветной капустой", product: "Цветная капуста", g: 70 },
  { key: "broccoli", ofWhat: "брокколи", product: "Брокколи", g: 60 },
  { key: "potato", ofWhat: "картофелем", product: "Картофель", g: 70 },
  { key: "green_beans", ofWhat: "стручковой фасолью", product: "Стручковая фасоль", g: 50 },
  { key: "peas", ofWhat: "зелёным горошком", product: "Зелёный горошек", g: 50 },
  { key: "beet", ofWhat: "свёклой", product: "Свёкла", g: 40 },
  { key: "turnip", ofWhat: "репой", product: "Репа", g: 60 },
  { key: "spinach", ofWhat: "шпинатом", product: "Шпинат", g: 30 },
  { key: "apple_veg", ofWhat: "яблоком (кислым)", product: "Яблоко кислое", g: 40 },
];

const FRUITS_SNACK = [
  { key: "apple", name: "яблока", product: "Яблоко", g: 80 },
  { key: "pear", name: "груши", product: "Груша", g: 80 },
  { key: "banana", name: "банана", product: "Банан", g: 60 },
  { key: "apricot", name: "абрикоса", product: "Абрикос", g: 70 },
  { key: "peach", name: "персика", product: "Персик", g: 70 },
  { key: "plum", name: "сливы", product: "Слива", g: 60 },
  { key: "blueberry", name: "черники", product: "Черника", g: 40 },
];

const GRAINS = [
  { key: "rice", name: "рисовой", product: "Рисовая крупа", breakfastTitle: "Рисовая каша", g: 25 },
  { key: "buckwheat", name: "гречневой", product: "Гречневая крупа", breakfastTitle: "Гречневая каша", g: 25 },
  { key: "oat", name: "овсяной", product: "Овсяные хлопья без добавок", breakfastTitle: "Овсяная каша", g: 30 },
  { key: "millet", name: "пшенной", product: "Пшено", breakfastTitle: "Пшенная каша", g: 25 },
  { key: "corn", name: "кукурузной", product: "Кукурузная крупа", breakfastTitle: "Кукурузная каша", g: 25 },
  { key: "quinoa", name: "киноа", product: "Киноа", breakfastTitle: "Каша из киноа", g: 20 },
];

/** Белки (осторожно: без «говядина/свинина» в текстах) */
const PROTEINS_LIGHT = [
  { key: "turkey", dish: "индейки", product: "Филе индейки", g: 40 },
  { key: "chicken", dish: "курицы", product: "Куриное филе", g: 40 },
  { key: "cod", dish: "трески", product: "Филе трески", g: 45 },
  { key: "pollock", dish: "минтая", product: "Филе минтая", g: 45 },
  { key: "egg_yolk", dish: "желтка", product: "Яичный желток", g: 15 },
  { key: "cottage", dish: "творога", product: "Творог мягкий 5–9%", g: 40 },
];

function ingRow(name, grams, order_index) {
  const g = Math.round(grams);
  return {
    name,
    amount: g,
    unit: "г",
    display_text: `${name} — ${g} г`,
    canonical_amount: g,
    canonical_unit: "g",
    order_index,
  };
}

function waterRow(ml, order_index) {
  const v = Math.round(ml);
  return {
    name: "Вода",
    amount: v,
    unit: "мл",
    display_text: `Вода — ${v} мл`,
    canonical_amount: v,
    canonical_unit: "ml",
    order_index,
  };
}

function oilRow(grams = 3, order_index = 2) {
  return ingRow("Масло сливочное", grams, order_index);
}

function baseTags(ageLabel, meal) {
  return ["infant", INFANT_SEED_BATCH_TAG, ageLabel, `meal_${meal}`];
}

function makeBreakfastPorridge(veg, grain, minAge, maxAge, ageLabel) {
  const title = `${grain.breakfastTitle} с ${veg.ofWhat}`;
  return {
    title,
    description:
      "Однокомпонентная каша с овощом, без соли и сахара. Консистенция гладкая.",
    meal_type: "breakfast",
    min_age_months: minAge,
    max_age_months: maxAge,
    cooking_time_minutes: minAge <= 6 ? 18 : 20,
    tags: baseTags(ageLabel, "breakfast"),
    nutrition_goals: ["gentle_digestion"],
    is_soup: false,
    ingredients: [
      ingRow(grain.product, grain.g + (maxAge >= 9 ? 5 : 0), 0),
      ingRow(veg.product, veg.g, 1),
      waterRow(200, 2),
    ],
    steps: [
      { step_number: 1, instruction: "Промойте крупу, залейте водой и доведите до кипения." },
      { step_number: 2, instruction: "Добавьте нарезанный овощ, варите на слабом огне до мягкости." },
      { step_number: 3, instruction: "Измельчите блендером до гладкой консистенции, остудьте до тёплого." },
    ],
  };
}

function makeLunchSoup(veg, minAge, maxAge, ageLabel) {
  const title = `Нежный овощной суп с ${veg.ofWhat}`;
  return {
    title,
    description: "Лёгкий овощной суп без соли, протёртый до однородности.",
    meal_type: "lunch",
    min_age_months: minAge,
    max_age_months: maxAge,
    cooking_time_minutes: 22,
    tags: baseTags(ageLabel, "lunch"),
    nutrition_goals: ["gentle_digestion", "balanced"],
    is_soup: true,
    ingredients: [
      ingRow(veg.product, veg.g + 20, 0),
      waterRow(220, 1),
      oilRow(2, 2),
    ],
    steps: [
      { step_number: 1, instruction: "Нарежьте овощ, залейте водой и варите до мягкости." },
      { step_number: 2, instruction: "Слейте часть бульона при необходимости, оставьте мягкую густоту." },
      { step_number: 3, instruction: "Измельчите блендером до гладкой текстуры, остудьте до тёплого." },
    ],
  };
}

function makeSnackFruitPair(a, b, minAge, maxAge, ageLabel) {
  const title = `Пюре из ${a.name} и ${b.name}`;
  return {
    title,
    description: "Сладкий перекус без сахара, однородная консистенция.",
    meal_type: "snack",
    min_age_months: minAge,
    max_age_months: maxAge,
    cooking_time_minutes: 12,
    tags: baseTags(ageLabel, "snack"),
    nutrition_goals: ["energy_boost"],
    is_soup: false,
    ingredients: [
      ingRow(a.product, a.g, 0),
      ingRow(b.product, b.g, 1),
      waterRow(30, 2),
    ],
    steps: [
      { step_number: 1, instruction: "Очистите фрукты от кожуры и косточек при необходимости." },
      { step_number: 2, instruction: "При необходимости слегка припарьте или потушите с небольшим количеством воды." },
      { step_number: 3, instruction: "Измельчите блендером до гладкого пюре, остудьте." },
    ],
  };
}

function makeSnackSingleFruit(fruit, minAge, maxAge, ageLabel) {
  const title = `Пюре из ${fruit.name}`;
  return {
    title,
    description: "Однокомпонентный фруктовый перекус без добавок.",
    meal_type: "snack",
    min_age_months: minAge,
    max_age_months: maxAge,
    cooking_time_minutes: 10,
    tags: baseTags(ageLabel, "snack"),
    nutrition_goals: ["gentle_digestion"],
    is_soup: false,
    ingredients: [
      ingRow(fruit.product, fruit.g, 0),
      waterRow(35, 1),
      ingRow("Семолина", 5, 2),
    ],
    steps: [
      { step_number: 1, instruction: "Очистите фрукт, удалите косточки при необходимости." },
      { step_number: 2, instruction: "Слегка потушите с водой или приготовьте на пару до мягкости." },
      { step_number: 3, instruction: "Добавьте семолину, проварите 2–3 минуты, измельчите блендером." },
    ],
  };
}

function makeDinnerVegGrain(veg, grain, minAge, maxAge, ageLabel) {
  const title = `Тёплое блюдо: ${veg.product.toLowerCase()} с ${grain.name} крупой`;
  return {
    title,
    description: "Мягкое овощное блюдо с крупой, без соли. Текстура гладкая или с мелкими частичками по возрасту.",
    meal_type: "dinner",
    min_age_months: minAge,
    max_age_months: maxAge,
    cooking_time_minutes: maxAge >= 9 ? 24 : 22,
    tags: baseTags(ageLabel, "dinner"),
    nutrition_goals: ["balanced", "gentle_digestion"],
    is_soup: false,
    ingredients: [
      ingRow(veg.product, veg.g, 0),
      ingRow(grain.product, grain.g, 1),
      waterRow(180, 2),
    ],
    steps: [
      { step_number: 1, instruction: "Сварите крупу в воде до почти готовности." },
      { step_number: 2, instruction: "Добавьте овощ, доварите до мягкости." },
      { step_number: 3, instruction: "Измельчите до нужной густоты блендером или вилкой, остудьте до тёплого." },
    ],
  };
}

function makeDinnerProteinVeg(prot, veg, minAge, maxAge, ageLabel) {
  const title = `Мягкое блюдо: ${prot.dish} и ${veg.ofWhat}`;
  return {
    title,
    description: "Белок с овощом на пару или отваре, без жарки и соли.",
    meal_type: "dinner",
    min_age_months: minAge,
    max_age_months: maxAge,
    cooking_time_minutes: 25,
    tags: baseTags(ageLabel, "dinner"),
    nutrition_goals: ["iron_support", "brain_development"],
    is_soup: false,
    ingredients: [
      ingRow(prot.product, prot.g, 0),
      ingRow(veg.product, veg.g - 10, 1),
      waterRow(40, 2),
    ],
    steps: [
      { step_number: 1, instruction: "Отварите или приготовьте на пару белок до полной готовности." },
      { step_number: 2, instruction: "Отдельно отварите овощ до мягкости." },
      { step_number: 3, instruction: "Соедините и измельчите до однородности, остудьте до тёплого." },
    ],
  };
}

function makeLunchSoupGrain(veg, grain, minAge, maxAge, ageLabel) {
  const title = `Овощной суп с ${veg.ofWhat} и ${grain.name} крупой`;
  return {
    title,
    description: "Суп с мягкой крупой, без соли; однородная текстура для прикорма.",
    meal_type: "lunch",
    min_age_months: minAge,
    max_age_months: maxAge,
    cooking_time_minutes: 28,
    tags: baseTags(ageLabel, "lunch"),
    nutrition_goals: ["balanced"],
    is_soup: true,
    ingredients: [
      ingRow(veg.product, veg.g, 0),
      ingRow(grain.product, 15, 1),
      waterRow(240, 2),
    ],
    steps: [
      { step_number: 1, instruction: "Вскипятите воду, добавьте крупу и овощ." },
      { step_number: 2, instruction: "Варите на слабом огне до полной мягкости." },
      { step_number: 3, instruction: "Измельчите блендером до гладкой консистенции, остудьте." },
    ],
  };
}

/**
 * Распределение объёма по возрастам (итого 180).
 */
const AGE_PLAN = [
  { min: 6, max: 6, label: "age_6m", perMeal: 11 }, // 44 + добьём
  { min: 7, max: 8, label: "age_7_8m", perMeal: 15 }, // 60
  { min: 9, max: 11, label: "age_9_11m", perMeal: 19 }, // 76 -> total 180
];

function takeCycle(arr, i) {
  return arr[i % arr.length];
}

export function buildInfantSeedRecipes() {
  const out = [];
  let vegIx = 0;
  let grainIx = 0;
  let fruitIx = 0;
  let protIx = 0;

  for (const plan of AGE_PLAN) {
    const { min: minAge, max: maxAge, label: ageLabel, perMeal } = plan;

    for (let k = 0; k < perMeal; k++) {
      const v = takeCycle(VEG, vegIx + k);
      const g = takeCycle(GRAINS, grainIx + k);
      out.push(makeBreakfastPorridge(v, g, minAge, maxAge, ageLabel));
    }
    vegIx += perMeal;
    grainIx += perMeal;

    for (let k = 0; k < perMeal; k++) {
      if (k % 3 === 0 && maxAge >= 7) {
        const v = takeCycle(VEG, vegIx + k);
        const gr = takeCycle(GRAINS, grainIx + k);
        out.push(makeLunchSoupGrain(v, gr, minAge, maxAge, ageLabel));
      } else {
        const v = takeCycle(VEG, vegIx + k + 3);
        out.push(makeLunchSoup(v, minAge, maxAge, ageLabel));
      }
    }
    vegIx += perMeal;

    for (let k = 0; k < perMeal; k++) {
      const f1 = takeCycle(FRUITS_SNACK, fruitIx + k);
      const f2 = takeCycle(FRUITS_SNACK, fruitIx + k + 2);
      if (k % 2 === 0) {
        out.push(makeSnackFruitPair(f1, f2, minAge, maxAge, ageLabel));
      } else {
        out.push(makeSnackSingleFruit(f1, minAge, maxAge, ageLabel));
      }
    }
    fruitIx += perMeal;

    for (let k = 0; k < perMeal; k++) {
      if (maxAge >= 9 && k % 2 === 1) {
        const p = takeCycle(PROTEINS_LIGHT, protIx + k);
        const v = takeCycle(VEG, vegIx + k + 5);
        if (p.key === "cottage" && maxAge < 9) {
          out.push(makeDinnerVegGrain(takeCycle(VEG, vegIx + k), takeCycle(GRAINS, grainIx + k), minAge, maxAge, ageLabel));
        } else if (p.key === "egg_yolk" && minAge <= 6) {
          out.push(makeDinnerVegGrain(takeCycle(VEG, vegIx + k), takeCycle(GRAINS, grainIx + k), minAge, maxAge, ageLabel));
        } else {
          out.push(makeDinnerProteinVeg(p, v, minAge, maxAge, ageLabel));
        }
      } else {
        const v = takeCycle(VEG, vegIx + k);
        const gr = takeCycle(GRAINS, grainIx + k + 1);
        out.push(makeDinnerVegGrain(v, gr, minAge, maxAge, ageLabel));
      }
    }
    protIx += perMeal;
  }

  /** Уникальность title внутри батча */
  const seen = new Set();
  for (const r of out) {
    let t = r.title;
    let n = 2;
    while (seen.has(t)) {
      t = `${r.title} (${n})`;
      n += 1;
    }
    r.title = t;
    seen.add(t);
  }

  return out;
}

export function summarizeByField(recipes, field) {
  const m = new Map();
  for (const r of recipes) {
    const k = String(r[field]);
    m.set(k, (m.get(k) ?? 0) + 1);
  }
  return Object.fromEntries([...m.entries()].sort((a, b) => a[0].localeCompare(b[0])));
}

export { MEALS };
