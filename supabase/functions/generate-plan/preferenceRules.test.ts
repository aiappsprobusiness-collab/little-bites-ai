import { passesPreferenceFilters } from "./preferenceRules.ts";
import { buildBlockedTokensFromAllergies } from "../_shared/allergyAliases.ts";

Deno.test("passesPreferenceFilters allows egg allergy when text only says «даёт белок» (no egg)", () => {
  const allowed = passesPreferenceFilters(
    {
      title: "Овсяная каша с бананом",
      description: "Мягкая каша даёт белок и сытость утром.",
      recipe_ingredients: [{ name: "овсяные хлопья" }, { name: "банан" }],
    },
    { allergies: ["яйца"] },
  );
  if (!allowed) {
    throw new Error("«даёт белок» in description must not block on egg allergy");
  }
});

Deno.test("passesPreferenceFilters blocks egg allergy when ingredient is яйцо", () => {
  const allowed = passesPreferenceFilters(
    {
      title: "Омлет с овощами",
      description: "Сытный завтрак",
      recipe_ingredients: [{ name: "яйцо куриное", display_text: "1 шт." }],
    },
    { allergies: ["яйца"] },
  );
  if (allowed) {
    throw new Error("Expected egg allergy to block recipe with яйцо in ingredients");
  }
});

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

Deno.test("passesPreferenceFilters: мясо блокирует курицу и не блокирует овощное блюдо", () => {
  if (
    passesPreferenceFilters(
      { title: "Курица с рисом", description: "", recipe_ingredients: [] },
      { allergies: ["мясо"] },
    )
  ) {
    throw new Error("Expected meat allergy to block chicken");
  }
  if (
    !passesPreferenceFilters(
      {
        title: "Овощное рагу",
        description: "",
        recipe_ingredients: [{ name: "кабачок" }],
      },
      { allergies: ["мясо"] },
    )
  ) {
    throw new Error("Expected meat allergy to allow vegetable dish");
  }
});

Deno.test("passesPreferenceFilters: только курица+индейка — говядина разрешена", () => {
  if (
    !passesPreferenceFilters(
      { title: "Гуляш из говядины", description: "", recipe_ingredients: [] },
      { allergies: ["курица", "индейка"] },
    )
  ) {
    throw new Error("Beef should be allowed when allergy is chicken+turkey only");
  }
});

Deno.test("buildBlockedTokensFromAllergies мясо содержит курицу/говядину/фарш", () => {
  const t = buildBlockedTokensFromAllergies(["мясо"]);
  const need = ["куриц", "говяд", "индейк", "свинин", "фарш", "chicken"];
  for (const n of need) {
    if (!t.includes(n)) throw new Error(`Expected meat tokens to include ${n}`);
  }
});

Deno.test("passesPreferenceFilters: dislike чип «овощи» блокирует морковь без слова «овощи»", () => {
  const allowed = passesPreferenceFilters(
    {
      title: "Морковь тушёная",
      description: "",
      recipe_ingredients: [{ name: "морковь" }],
    },
    { dislikes: ["овощи"] },
  );
  if (allowed) {
    throw new Error("Expected vegetable-chip dislike to block carrot-only dish");
  }
});

Deno.test("passesPreferenceFilters: dislike «овощи» блокирует овощной суп", () => {
  const allowed = passesPreferenceFilters(
    {
      title: "Овощной суп",
      description: "",
      recipe_ingredients: [{ name: "кабачок" }],
    },
    { dislikes: ["овощи"] },
  );
  if (allowed) {
    throw new Error("Expected vegetable dislike to block овощной in title");
  }
});

Deno.test("passesPreferenceFilters: dislike «овощи» + category vegetables в ингредиенте", () => {
  const allowed = passesPreferenceFilters(
    {
      title: "Нежное рагу",
      description: "",
      recipe_ingredients: [{ name: "филе индейки", category: "vegetables" }],
    },
    { dislikes: ["овощи"] },
  );
  if (allowed) {
    throw new Error("Expected vegetables category to be blocked by овощи dislike");
  }
});

Deno.test("passesPreferenceFilters: dislike «супы» не цепляет «супер»", () => {
  const allowed = passesPreferenceFilters(
    {
      title: "Суперсытный завтрак",
      description: "Без супа",
      recipe_ingredients: [],
    },
    { dislikes: ["супы"] },
  );
  if (!allowed) {
    throw new Error("«Супер» must not trigger soup dislike");
  }
});
