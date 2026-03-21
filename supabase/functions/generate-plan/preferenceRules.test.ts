import { passesPreferenceFilters } from "./preferenceRules.ts";

Deno.test("passesPreferenceFilters blocks nut allergy for recipe with орехами in title", () => {
  const allowed = passesPreferenceFilters(
    {
      title: "Тофу с авокадо и орехами",
      description: "Полезный перекус",
      recipe_ingredients: [{ name: "тофу" }, { name: "авокадо" }, { name: "орехи" }],
    },
    { allergies: ["орехи"] },
  );
  if (allowed) {
    throw new Error("Expected nut allergy to block recipe with орехами in title/ingredients");
  }
});

Deno.test("passesPreferenceFilters allows chickpea (нут) when allergy is орехи", () => {
  const allowed = passesPreferenceFilters(
    {
      title: "Тыквенно-морковное пюре с нутом",
      description: "С нутом и специями",
      recipe_ingredients: [{ name: "нут" }, { name: "тыква" }, { name: "морковь" }],
    },
    { allergies: ["орехи"] },
  );
  if (!allowed) {
    throw new Error("Chickpea (нут) must not be blocked by nut allergy");
  }
});

Deno.test("passesPreferenceFilters blocks allergy found only in ingredients", () => {
  const allowed = passesPreferenceFilters(
    {
      title: "Овощные котлеты",
      description: "Нежные и мягкие",
      recipe_ingredients: [{ name: "филе лосося" }],
    },
    { allergies: ["рыба"] },
  );

  if (allowed) {
    throw new Error("Expected fish allergy to block recipe by ingredients");
  }
});

Deno.test("passesPreferenceFilters blocks BKM allergy for recipe with milk and butter", () => {
  const allowed = passesPreferenceFilters(
    {
      title: "Пшённая каша с тыквой и сливочным маслом",
      description: "Полезный завтрак",
      recipe_ingredients: [
        { name: "пшённая крупа", display_text: "40 г" },
        { name: "молоко", display_text: "50 мл" },
        { name: "сливочное масло", display_text: "5 г" },
      ],
    },
    { allergies: ["БКМ"] },
  );

  if (allowed) {
    throw new Error("Expected BKM allergy to block recipe with milk and butter in ingredients");
  }
});

Deno.test("passesPreferenceFilters blocks dislike found only in ingredients", () => {
  const allowed = passesPreferenceFilters(
    {
      title: "Овощные оладьи",
      description: "С йогуртовым соусом",
      recipe_ingredients: [{ name: "белая рыба" }],
    },
    { dislikes: ["рыба"] },
  );

  if (allowed) {
    throw new Error("Expected dislike to block recipe by ingredients");
  }
});
