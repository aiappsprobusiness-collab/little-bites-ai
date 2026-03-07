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
