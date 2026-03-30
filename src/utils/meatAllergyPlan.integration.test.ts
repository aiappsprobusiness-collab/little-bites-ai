import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { buildBlockedTokensFromAllergies } from "./allergyAliases";
import { filterPoolCandidatesForSlot, type PoolRecipeRow } from "./recipePool";
import { explainPoolCandidateRejection } from "./planCandidateFilterExplain";

function row(partial: Partial<PoolRecipeRow> & Pick<PoolRecipeRow, "id" | "title" | "meal_type">): PoolRecipeRow {
  return {
    tags: null,
    description: null,
    cooking_time_minutes: null,
    min_age_months: null,
    max_age_months: null,
    is_soup: false,
    recipe_ingredients: null,
    ...partial,
  };
}

describe("pool selection: мясо", () => {
  const baseOpts = {
    excludeRecipeIds: [] as string[],
    excludeTitleKeys: [] as string[],
    memberData: { allergies: ["мясо"] as string[] },
    infantSlotRole: null as const,
  };

  it("кандидаты с курицей/индейкой/говядиной отсекаются; овощной остаётся", () => {
    const pool: PoolRecipeRow[] = [
      row({ id: "1", title: "Курица с брокколи", meal_type: "dinner" }),
      row({ id: "2", title: "Индейка на пару", meal_type: "dinner" }),
      row({ id: "3", title: "Говядина тушёная", meal_type: "dinner" }),
      row({ id: "4", title: "Овощное рагу", meal_type: "dinner", recipe_ingredients: [{ name: "кабачок", display_text: "100 г" }] }),
    ];
    const out = filterPoolCandidatesForSlot(pool, { slotNorm: "dinner", ...baseOpts });
    expect(out.map((r) => r.id).sort()).toEqual(["4"]);
  });

  it("при аллергии курица+индейка говядина остаётся", () => {
    const pool: PoolRecipeRow[] = [
      row({ id: "a", title: "Стейк говяжий", meal_type: "lunch", is_soup: false }),
      row({ id: "b", title: "Куриный суп", meal_type: "lunch", is_soup: true }),
    ];
    const out = filterPoolCandidatesForSlot(pool, {
      slotNorm: "lunch",
      excludeRecipeIds: [],
      excludeTitleKeys: [],
      memberData: { allergies: ["курица", "индейка"] },
      infantSlotRole: null,
    });
    expect(out.some((r) => r.id === "a")).toBe(true);
    expect(out.some((r) => r.id === "b")).toBe(false);
  });
});

describe("Edge allergyAliases vs client: buildBlockedTokensFromAllergies(['мясо'])", () => {
  it("совпадает с версией в supabase/functions/_shared/allergyAliases.ts (после npm run sync:allergens)", () => {
    const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
    const edgePath = join(root, "supabase", "functions", "_shared", "allergyAliases.ts");
    const src = readFileSync(edgePath, "utf8");
    const client = [...buildBlockedTokensFromAllergies(["мясо"])].sort();
    const re = /canonical:\s*"мясо"[\s\S]*?tokens:\s*\[\.\.\.getMeatUmbrellaBlockTokens\(\)\]/;
    expect(re.test(src)).toBe(true);
    expect(client.length).toBeGreaterThan(40);
    expect(client).toContain("куриц");
    expect(client).toContain("говяд");
    expect(client).toContain("фарш");
  });
});

describe("explainPoolCandidateRejection", () => {
  it("возвращает excluded_by_allergy для мяса + курицы", () => {
    const r = row({ id: "x", title: "Курица", meal_type: "dinner" });
    const ex = explainPoolCandidateRejection(r, {
      slotNorm: "dinner",
      memberData: { allergies: ["мясо"] },
      excludeRecipeIds: [],
      excludeTitleKeys: [],
      infantSlotRole: null,
    });
    expect(ex.bucket).toBe("excluded_by_allergy");
    expect(ex.allergyHits?.length).toBeGreaterThan(0);
  });
});
