import {
  buildLikeTokens,
  hasLikedTitlesMatch,
  passesPreferenceFilters,
  scoreLikeSignal,
} from "./preferenceRules.ts";

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

Deno.test("scoreLikeSignal favors liked recipe but can also avoid overusing it", () => {
  const recipe = {
    title: "Тыквенная каша",
    description: "С яблоком",
    recipe_ingredients: [{ name: "тыква" }],
  };
  const likeTokens = buildLikeTokens({ likes: ["тыква"] });

  const favorScore = scoreLikeSignal(recipe, likeTokens, "favor");
  const avoidScore = scoreLikeSignal(recipe, likeTokens, "avoid");

  if (favorScore <= 0) {
    throw new Error(`Expected positive like score, got ${favorScore}`);
  }
  if (avoidScore >= 0) {
    throw new Error(`Expected negative like score in avoid mode, got ${avoidScore}`);
  }
});

Deno.test("hasLikedTitlesMatch detects recent liked meals by title", () => {
  const matched = hasLikedTitlesMatch(["Суп-пюре из брокколи", "Каша с тыквой"], buildLikeTokens({ likes: ["тыква"] }));

  if (!matched) {
    throw new Error("Expected recent titles to match like tokens");
  }
});
