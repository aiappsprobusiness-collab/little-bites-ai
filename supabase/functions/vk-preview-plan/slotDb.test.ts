import { assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import { likeBoostScore, pickDbSlots } from "./slotDb.ts";
import type { RecipeRowPool } from "./types.ts";

const baseIng = [{ name: "вода", display_text: "вода" }];

function row(
  id: string,
  title: string,
  meal_type: string,
  opts?: Partial<RecipeRowPool>,
): RecipeRowPool {
  return {
    id,
    title,
    description: "описание",
    meal_type,
    min_age_months: 6,
    max_age_months: 120,
    recipe_ingredients: baseIng,
    is_soup: meal_type === "lunch" ? true : false,
    ...opts,
  };
}

Deno.test("pickDbSlots fills four slots from pool", () => {
  const pool: RecipeRowPool[] = [
    row("1", "Овсянка с яблоком", "breakfast"),
    row("2", "Суп овощной", "lunch", { is_soup: true }),
    row("3", "Котлеты", "dinner"),
    row("4", "Творог с бананом", "snack"),
  ];
  const { meals, filledCount } = pickDbSlots(pool, {
    age_months: 24,
    allergies: [],
    likes: ["овсян"],
    dislikes: [],
    type: "child",
  });
  assertEquals(filledCount, 4);
  if (!meals.breakfast) throw new Error("breakfast");
  assertEquals(meals.breakfast?.title.includes("Овсян"), true);
});

Deno.test("pickDbSlots returns partial when pool empty", () => {
  const { filledCount } = pickDbSlots([], {
    age_months: 24,
    allergies: [],
    likes: [],
    dislikes: [],
    type: "child",
  });
  assertEquals(filledCount, 0);
});

Deno.test("likeBoostScore: короткий токен like «рис» матчится подстрокой (includes)", () => {
  const r = row("x", "Каша", "breakfast", {
    description: "рисовая нежная",
    recipe_ingredients: [{ name: "рис круглозёрный" }],
  });
  assertEquals(likeBoostScore(r, ["рис"]) >= 1, true);
  assertEquals(likeBoostScore(r, []), 0);
});

Deno.test("likeBoostScore: слово «банан» целиком в описании (границы для токена ≥4 символов)", () => {
  const r = row("x", "Десерт", "snack", {
    description: "нарезать банан кружочками",
    recipe_ingredients: baseIng,
  });
  assertEquals(likeBoostScore(r, ["банан"]) >= 1, true);
});

Deno.test("pickDbSlots: при like «рис» выше буст — выше в сортировке, даже при меньшем score", () => {
  const pool: RecipeRowPool[] = [
    row("bf-bread", "Булочка с маслом", "breakfast", {
      score: 999,
      recipe_ingredients: [{ name: "мука" }, { name: "масло" }],
    }),
    row("bf-rice", "Рисовая каша", "breakfast", {
      score: 1,
      recipe_ingredients: [{ name: "рис" }, { name: "молоко" }],
    }),
    row("2", "Суп с лапшой", "lunch", { is_soup: true }),
    row("3", "Котлеты", "dinner"),
    row("4", "Творог", "snack"),
  ];
  const { meals } = pickDbSlots(pool, {
    age_months: 24,
    allergies: [],
    likes: ["рис"],
    dislikes: [],
    type: "child",
  });
  assertEquals(meals.breakfast?.title.includes("Рис"), true);
  assertEquals(meals.breakfast?.title.includes("Булочк"), false);
});

Deno.test("pickDbSlots: аллергия «рыба» отсекает рыбный суп, остаётся второй суп", () => {
  const pool: RecipeRowPool[] = [
    row("1", "Овсянка", "breakfast"),
    row("l-fish", "Уха из трески", "lunch", {
      is_soup: true,
      recipe_ingredients: [{ name: "треска" }],
    }),
    row("l-veg", "Суп с лапшой и курицей", "lunch", {
      is_soup: true,
      recipe_ingredients: [{ name: "лапша" }, { name: "куриное филе" }],
    }),
    row("3", "Котлеты", "dinner"),
    row("4", "Творог", "snack"),
  ];
  const { meals } = pickDbSlots(pool, {
    age_months: 24,
    allergies: ["рыба"],
    likes: [],
    dislikes: [],
    type: "child",
  });
  assertEquals(meals.lunch?.title.includes("Уха"), false);
  assertEquals(meals.lunch?.title.includes("лапшой"), true);
});

Deno.test("pickDbSlots: lunch fallback — если все супы отсеклись по профилю, берётся обед без супа из каталога", () => {
  const pool: RecipeRowPool[] = [
    row("1", "Овсянка", "breakfast"),
    row("l-fish", "Суп из рыбы", "lunch", {
      is_soup: true,
      recipe_ingredients: [{ name: "лосось" }],
    }),
    row("l-main", "Гречка с фрикадельками на обед", "lunch", { is_soup: false }),
    row("3", "Ужин овощной", "dinner"),
    row("4", "Творог", "snack"),
  ];
  const { meals, filledCount } = pickDbSlots(pool, {
    age_months: 24,
    allergies: ["рыба"],
    likes: [],
    dislikes: [],
    type: "child",
  });
  assertEquals(filledCount, 4);
  assertEquals(meals.lunch?.title.includes("Гречка"), true);
});

Deno.test("pickDbSlots: dislike «овощи» отсекает блюдо с морковью", () => {
  const pool: RecipeRowPool[] = [
    row("1", "Овсянка", "breakfast"),
    row("2", "Суп", "lunch", { is_soup: true }),
    row("d-carrot", "Морковь тушёная", "dinner", {
      recipe_ingredients: [{ name: "морковь" }],
    }),
    row("d-pasta", "Паста с маслом", "dinner", {
      recipe_ingredients: [{ name: "макароны" }, { name: "масло" }],
    }),
    row("4", "Творог", "snack"),
  ];
  const { meals } = pickDbSlots(pool, {
    age_months: 24,
    allergies: [],
    likes: [],
    dislikes: ["овощи"],
    type: "child",
  });
  assertEquals(meals.dinner?.title.includes("Морков"), false);
  assertEquals(meals.dinner?.title.includes("Паста"), true);
});

Deno.test("pickDbSlots: аллергия БКМ + like «рис» — рисовая каша вместо булочки с молоком", () => {
  const pool: RecipeRowPool[] = [
    row("bf-milk", "Молочная булочка", "breakfast", {
      score: 500,
      recipe_ingredients: [{ name: "молоко" }, { name: "мука" }],
    }),
    row("bf-rice", "Рисовая каша на воде", "breakfast", {
      score: 10,
      recipe_ingredients: [{ name: "рис" }, { name: "вода" }],
    }),
    row("2", "Суп", "lunch", { is_soup: true }),
    row("3", "Котлеты", "dinner"),
    row("4", "Яблоко", "snack"),
  ];
  const { meals } = pickDbSlots(pool, {
    age_months: 24,
    allergies: ["бкм"],
    likes: ["рис"],
    dislikes: [],
    type: "child",
  });
  assertEquals(meals.breakfast?.title.includes("Рис"), true);
  assertEquals(meals.breakfast?.title.includes("Молочн"), false);
});
