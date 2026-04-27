import { assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import { pickMockMealForSlot } from "./mockSlots.ts";

Deno.test("pickMockMealForSlot avoids овощи-heavy titles when dislike овощи", () => {
  const m = pickMockMealForSlot("dinner", { dislikes: ["овощи"] });
  const t = (m.title + " " + (m.description ?? "")).toLowerCase();
  assertEquals(t.includes("овощ"), false);
});

Deno.test("pickMockMealForSlot lunch without soup dislike can pick soup-like candidate", () => {
  const m = pickMockMealForSlot("lunch", { dislikes: [] });
  assertEquals(m.title.length > 0, true);
});

Deno.test("pickMockMealForSlot lunch with dislike супы skips суп in title", () => {
  const m = pickMockMealForSlot("lunch", { dislikes: ["супы"] });
  assertEquals(m.title.toLowerCase().includes("суп"), false);
});
