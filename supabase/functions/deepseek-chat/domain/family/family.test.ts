/**
 * Контрактные тесты: семейный режим — исключение <12 мес, kid-safety 12–35 мес.
 * Запуск: из supabase/functions: deno test deepseek-chat/domain/family/family.test.ts --allow-read
 */
import { getFamilyPromptMembers, buildFamilyGenerationContextBlock, isInfant } from "./index.ts";

Deno.test("getFamilyPromptMembers: при наличии ≥12 мес младенцы исключаются", () => {
  const members = [
    { name: "A", age_months: 6 },
    { name: "B", age_months: 24 },
  ];
  const { membersForPrompt, applyKidFilter } = getFamilyPromptMembers(members);
  if (membersForPrompt.length !== 1) {
    throw new Error(`Expected 1 member (non-infant), got ${membersForPrompt.length}`);
  }
  if (membersForPrompt[0]!.name !== "B" || membersForPrompt[0]!.age_months !== 24) {
    throw new Error(`Expected only B (24m), got: ${JSON.stringify(membersForPrompt)}`);
  }
  if (!applyKidFilter) {
    throw new Error("Expected applyKidFilter true (24m is 12–35)");
  }
});

Deno.test("getFamilyPromptMembers: все <12 мес — все остаются в промпте", () => {
  const members = [
    { name: "A", age_months: 6 },
    { name: "B", age_months: 10 },
  ];
  const { membersForPrompt, applyKidFilter } = getFamilyPromptMembers(members);
  if (membersForPrompt.length !== 2) {
    throw new Error(`Expected 2 members when all <12m, got ${membersForPrompt.length}`);
  }
  if (applyKidFilter) {
    throw new Error("Expected applyKidFilter false when all infant");
  }
});

Deno.test("getFamilyPromptMembers: 12–35 мес даёт applyKidFilter true", () => {
  const members = [{ name: "K", age_months: 18 }];
  const { applyKidFilter } = getFamilyPromptMembers(members);
  if (!applyKidFilter) {
    throw new Error("18 months must set applyKidFilter true (kid-safety 1–3)");
  }
});

Deno.test("getFamilyPromptMembers: 36 мес — без kid filter", () => {
  const members = [{ name: "C", age_months: 36 }];
  const { applyKidFilter } = getFamilyPromptMembers(members);
  if (applyKidFilter) {
    throw new Error("36 months must set applyKidFilter false");
  }
});

Deno.test("isInfant: <12 мес — true", () => {
  if (!isInfant({ age_months: 11 })) throw new Error("11 months must be infant");
  if (!isInfant({ age_months: 0 })) throw new Error("0 months must be infant");
});

Deno.test("isInfant: ≥12 мес — false", () => {
  if (isInfant({ age_months: 12 })) throw new Error("12 months must not be infant");
  if (isInfant({ age_months: 24 })) throw new Error("24 months must not be infant");
});

Deno.test("buildFamilyGenerationContextBlock: нет младенцев в тексте, есть kid safety при applyKidFilter", () => {
  const block = buildFamilyGenerationContextBlock({
    membersForPrompt: [{ name: "Child", age_months: 24, allergies: [], dislikes: [], likes: [] }],
    applyKidFilter: true,
  });
  if (!block.includes("FAMILY MODE") || !block.includes("Child")) {
    throw new Error("Block must contain FAMILY MODE and member name");
  }
  const lower = block.toLowerCase();
  const hasKidSafety = lower.includes("kid") || lower.includes("1–3") || lower.includes("1-3");
  if (!hasKidSafety) {
    throw new Error("With applyKidFilter block should mention kid safety or 1–3");
  }
});
