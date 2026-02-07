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
    expect(res.errors.some((e) => e.includes("Молоко") || e.includes("Allergy"))).toBe(true);
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

  it("rejects invalid recipe format (missing title)", () => {
    const ctx = {
      mode: "single" as const,
      target: { id: "1", name: "C", role: "child" as const, allergies: [], preferences: [] },
    };

    const res = validateRecipe(
      { title: "", ingredients: ["a"], steps: ["b"] },
      ctx
    );
    expect(res.ok).toBe(false);
    expect(res.errors.some((e) => e.includes("Invalid recipe format"))).toBe(true);
  });
});
