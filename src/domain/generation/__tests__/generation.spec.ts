import { describe, it, expect } from "vitest";
import { validateRecipe } from "../validateRecipe";

describe("validateRecipe", () => {
  it("rejects milk when allergy = Молоко", () => {
    const ctx = {
      mode: "single" as const,
      target: {
        id: "1",
        name: "Child",
        role: "child" as const,
        allergies: ["Молоко"],
        preferences: [],
      },
    };

    const recipe = {
      title: "Молочная каша",
      ingredients: ["молоко", "крупа"],
      steps: ["Сварить кашу"],
    };

    const res = validateRecipe(recipe, ctx);
    expect(res.ok).toBe(false);
    expect(res.errors.some((e) => e.includes("Allergy"))).toBe(true);
  });

  it("accepts recipe when no allergy match", () => {
    const ctx = {
      mode: "single" as const,
      target: {
        id: "1",
        name: "Child",
        role: "child" as const,
        allergies: ["Молоко"],
        preferences: [],
      },
    };

    const recipe = {
      title: "Гречневая каша на воде",
      ingredients: ["гречка", "вода", "соль"],
      steps: ["Сварить гречку"],
    };

    const res = validateRecipe(recipe, ctx);
    expect(res.ok).toBe(true);
    expect(res.errors).toHaveLength(0);
  });

  it("accepts egg-free recipe when allergy is eggs (description «белок» не триггерит)", () => {
    const ctx = {
      mode: "single" as const,
      target: {
        id: "1",
        name: "Child",
        role: "child" as const,
        allergies: ["яйца"],
        preferences: [],
      },
    };

    const recipe = {
      title: "Овсянка с бананом",
      description: "Белок даёт сытость и поддержку мышц. Овёс добавляет клетчатку.",
      ingredients: [
        { name: "овсяные хлопья", amount: "50 г" },
        { name: "банан", amount: "1 шт." },
        { name: "вода", amount: "100 мл" },
      ],
      steps: ["Сварить овсянку", "Добавить банан"],
      nutrition: { protein_g_per_serving: 5, kcal_per_serving: 120 },
    };

    const res = validateRecipe(recipe, ctx);
    expect(res.ok).toBe(true);
    expect(res.errors).toHaveLength(0);
  });

  it("accepts творожная запеканка when allergy is gluten or nuts (ingredients-only post-check)", () => {
    for (const allergy of ["глютен", "орехи"]) {
      const ctx = {
        mode: "single" as const,
        target: {
          id: "1",
          name: "Авигея",
          role: "child" as const,
          allergies: [allergy],
          preferences: [],
        },
      };

      const recipe = {
        title: "Творожная запеканка с бананом",
        description: "Нежный завтрак с кальцием",
        ingredients: [
          { name: "творог", amount: "150 г" },
          { name: "банан", amount: "1 шт." },
        ],
        steps: ["Смешать", "Запечь"],
      };

      const res = validateRecipe(recipe, ctx);
      expect(res.ok).toBe(true);
    }
  });

  it("rejects recipe with meat when preference is вегетарианское", () => {
    const ctx = {
      mode: "single" as const,
      target: {
        id: "1",
        name: "Child",
        role: "child" as const,
        allergies: [],
        preferences: ["Вегетарианское"],
      },
    };

    const recipe = {
      title: "Куриные тефтели",
      ingredients: ["куриный фарш", "лук", "яйцо"],
      steps: ["Смешать", "Пожарить"],
    };

    const res = validateRecipe(recipe, ctx);
    expect(res.ok).toBe(false);
    expect(res.errors.some((e) => e.includes("Preference") || e.includes("Вегетарианское"))).toBe(true);
  });

  it("accepts recipe when allergy мясо and chicken only in description (ingredients-only)", () => {
    const ctx = {
      mode: "single" as const,
      target: {
        id: "1",
        name: "Child",
        role: "child" as const,
        allergies: ["мясо"],
        preferences: [],
      },
    };

    const recipe = {
      title: "Овощной суп",
      description: "Подаём с куриным филе.",
      ingredients: [{ name: "морковь", amount: "1" }],
      steps: ["Сварить"],
    };

    const res = validateRecipe(recipe, ctx);
    expect(res.ok).toBe(true);
  });

  it("rejects when allergy мясо and chicken in ingredient name", () => {
    const ctx = {
      mode: "single" as const,
      target: {
        id: "1",
        name: "Child",
        role: "child" as const,
        allergies: ["мясо"],
        preferences: [],
      },
    };

    const recipe = {
      title: "Суп",
      description: "Лёгкий ужин",
      ingredients: [{ name: "куриное филе", amount: "100 г" }],
      steps: ["Сварить"],
    };

    const res = validateRecipe(recipe, ctx);
    expect(res.ok).toBe(false);
    expect(res.errors.some((e) => e.includes("Allergy"))).toBe(true);
  });

  it("rejects invalid recipe format (missing title)", () => {
    const ctx = {
      mode: "single" as const,
      target: { id: "1", name: "C", role: "child" as const, allergies: [], preferences: [] },
    };

    const res = validateRecipe(
      { title: "", ingredients: ["a"], steps: ["b"] },
      ctx,
    );
    expect(res.ok).toBe(false);
    expect(res.errors.some((e) => e.includes("Invalid recipe format"))).toBe(true);
  });
});
