import { assertBodySizeOk, validateRequestBody } from "./validate.ts";

Deno.test("validateRequestBody rejects non-integer age", () => {
  const r = validateRequestBody({ age_months: 12.5, allergies: [], likes: [], dislikes: [] });
  if (r.ok) throw new Error("expected fail");
});

Deno.test("validateRequestBody rejects age out of range", () => {
  const r = validateRequestBody({ age_months: 3, allergies: [], likes: [], dislikes: [] });
  if (r.ok) throw new Error("expected fail");
});

Deno.test("validateRequestBody normalizes and caps arrays", () => {
  const r = validateRequestBody({
    age_months: 24,
    allergies: ["  Яйца ", "яйца", "Орехи"],
    likes: ["a", "b"],
    dislikes: [],
    entry_point: "vk",
  });
  if (!r.ok) throw new Error(String(r));
  if (r.body.age_months !== 24) throw new Error("age");
  if (r.body.allergies.join(",") !== "яйца,орехи") throw new Error(r.body.allergies.join("|"));
  if (r.body.entry_point !== "vk") throw new Error("ep");
});

Deno.test("assertBodySizeOk rejects huge content-length", () => {
  const r = assertBodySizeOk(String(50_000));
  if (r.ok) throw new Error("expected fail");
});
