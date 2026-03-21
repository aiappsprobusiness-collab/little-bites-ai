import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { detectAssistantTopic } from "./assistantTopicDetect.ts";

Deno.test("detectAssistantTopic: калорийный завтрак — не тема «Стул»", () => {
  const r = detectAssistantTopic("калорийный завтрак");
  assertEquals(r.matched, false);
});

Deno.test("detectAssistantTopic: высококалорийный — не стул", () => {
  const r = detectAssistantTopic("высококалорийный перекус");
  assertEquals(r.matched, false);
});

Deno.test("detectAssistantTopic: зеленый кал — стул", () => {
  const r = detectAssistantTopic("зеленый кал третий день");
  assertEquals(r.matched, true);
  if (r.matched) {
    assertEquals(r.topicKey, "constipation_diarrhea");
  }
});

Deno.test("detectAssistantTopic: слово «кал» отдельно — стул", () => {
  const r = detectAssistantTopic("странный кал у малыша");
  assertEquals(r.matched, true);
  if (r.matched) {
    assertEquals(r.topicKey, "constipation_diarrhea");
  }
});

Deno.test("detectAssistantTopic: кальций — не стул", () => {
  const r = detectAssistantTopic("завтрак с кальцием");
  assertEquals(r.matched, false);
});
