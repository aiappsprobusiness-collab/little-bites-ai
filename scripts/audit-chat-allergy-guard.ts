#!/usr/bin/env npx tsx
/**
 * Аудит pre-request и post-recipe allergy guard чата (те же хелперы, что план/Edge).
 *
 * Запуск: npm run audit:chat-allergy
 */
import { textWithoutExclusionPhrases, checkChatRequestAgainstProfile } from "../src/utils/chatBlockedCheck";
import { expandAllergiesToCanonicalBlockedGroups } from "../src/utils/allergyAliases";
import { containsAnyTokenForAllergy } from "../src/utils/allergenTokens";
import {
  chatRecipeRecordToAllergyFields,
  findFirstAllergyConflictInRecipeFields,
} from "../src/shared/chatRecipeAllergySafety";

type Scenario = {
  label: string;
  allergies: string[];
  query: string;
  mockRecipe?: Record<string, unknown>;
};

const scenarios: Scenario[] = [
  { label: "мясо + мясное", allergies: ["мясо"], query: "дай что-то мясное" },
  { label: "мясо + курица в запросе", allergies: ["мясо"], query: "сделай суп с курицей" },
  {
    label: "мясо + нейтральный запрос + курица в рецепте",
    allergies: ["мясо"],
    query: "дай суп на ужин",
    mockRecipe: {
      title: "Суп",
      description: "С курицей",
      ingredients: [{ name: "куриное филе", display_text: "150 г" }],
    },
  },
  { label: "курица + куриные котлеты", allergies: ["курица"], query: "куриные котлеты" },
  { label: "индейка", allergies: ["индейка"], query: "индейка с овощами" },
  { label: "говядина + тефтели", allergies: ["говядина"], query: "тефтели из говядины" },
  { label: "БКМ + молочное", allergies: ["БКМ"], query: "что-то молочное" },
  { label: "рыба + лосось", allergies: ["рыба"], query: "лосось с овощами" },
  { label: "орехи + ореховый", allergies: ["орехи"], query: "ореховый перекус" },
  { label: "глютен + паста", allergies: ["глютен"], query: "паста с сыром" },
  { label: "яблоко + пюре", allergies: ["яблоко"], query: "яблочное пюре" },
  {
    label: "семья: у одного мясо, запрос про курицу",
    allergies: ["мясо"],
    query: "суп с курицей",
  },
];

function runPreCheck(query: string, allergies: string[]) {
  const text = textWithoutExclusionPhrases(query.trim().toLowerCase());
  const groups = expandAllergiesToCanonicalBlockedGroups(allergies);
  for (const g of groups) {
    if (containsAnyTokenForAllergy(text, g.tokens).hit) {
      return { blocked: true as const, matchedAllergy: g.allergy, tokens: g.tokens };
    }
  }
  return { blocked: false as const };
}

function printGroups(allergies: string[]) {
  const groups = expandAllergiesToCanonicalBlockedGroups(allergies);
  console.log("  active allergies:", JSON.stringify(allergies));
  for (const g of groups) {
    console.log(`  group: allergy=${g.allergy} canonical=${g.canonical ?? "—"} tokens=${g.tokens.length}`);
  }
}

function main() {
  console.log("=== Chat allergy guard audit (shared SoT) ===\n");
  for (const s of scenarios) {
    console.log(`--- ${s.label} ---`);
    printGroups(s.allergies);

    const pre = runPreCheck(s.query, s.allergies);
    const preViaHook = checkChatRequestAgainstProfile({
      text: s.query,
      member: { name: "Аудит", allergies: s.allergies, dislikes: [] },
    });

    let post: "skipped" | "allowed" | "blocked" = "skipped";
    let postDetail: string | undefined;
    if (s.mockRecipe) {
      const fields = chatRecipeRecordToAllergyFields(s.mockRecipe);
      const groups = expandAllergiesToCanonicalBlockedGroups(s.allergies).map((g) => ({
        profileAllergy: g.allergy,
        tokens: g.tokens,
      }));
      const conflict = findFirstAllergyConflictInRecipeFields(fields, groups);
      if (conflict) {
        post = "blocked";
        postDetail = `${conflict.profileAllergy} ← ${conflict.detail.field} token=${conflict.detail.token}`;
      } else {
        post = "allowed";
      }
    }

    const preResult =
      pre.blocked
        ? `blocked_pre_request (allergy=${pre.matchedAllergy})`
        : "allowed_pre_request";
    console.log(`  query: ${JSON.stringify(s.query)}`);
    console.log(`  pre (expand+containsAnyTokenForAllergy): ${preResult}`);
    console.log(
      `  pre (checkChatRequestAgainstProfile): ${preViaHook ? "blocked_pre_request" : "allowed_pre_request"}`,
    );
    if (pre.blocked !== Boolean(preViaHook)) {
      console.log("  ⚠ mismatch между прямым пречеком и checkChatRequestAgainstProfile");
    }
    if (s.mockRecipe) {
      console.log(`  post-recipe: ${post}${postDetail ? ` (${postDetail})` : ""}`);
    }
    const outcome =
      pre.blocked || preViaHook
        ? "blocked_pre_request"
        : post === "blocked"
          ? "blocked_post_recipe"
          : post === "allowed"
            ? "allowed"
            : "allowed";
    console.log(`  → outcome: ${outcome}\n`);
  }
}

main();
