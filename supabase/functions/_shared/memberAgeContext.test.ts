import { assertEquals } from "https://deno.land/std@0.208.0/assert/assert_equals.ts";
import { getMemberAgeContext } from "./memberAgeContext.ts";

Deno.test("getMemberAgeContext: null/undefined -> no filter", () => {
  assertEquals(getMemberAgeContext(null), { ageMonths: undefined, applyFilter: false });
  assertEquals(getMemberAgeContext(undefined), { ageMonths: undefined, applyFilter: false });
});

Deno.test("getMemberAgeContext: adult/family type -> no filter", () => {
  assertEquals(getMemberAgeContext({ type: "adult" }), { ageMonths: undefined, applyFilter: false });
  assertEquals(getMemberAgeContext({ type: "family", age_months: 24 }), { ageMonths: undefined, applyFilter: false });
});

Deno.test("getMemberAgeContext: child 6 months -> apply filter", () => {
  assertEquals(getMemberAgeContext({ age_months: 6 }), { ageMonths: 6, applyFilter: true });
});

Deno.test("getMemberAgeContext: child 12 months -> apply filter", () => {
  assertEquals(getMemberAgeContext({ age_months: 12 }), { ageMonths: 12, applyFilter: true });
});

Deno.test("getMemberAgeContext: 18+ years -> no filter", () => {
  assertEquals(getMemberAgeContext({ age_months: 216 }), { ageMonths: undefined, applyFilter: false });
  assertEquals(getMemberAgeContext({ age_months: 300 }), { ageMonths: undefined, applyFilter: false });
});

Deno.test("getMemberAgeContext: age 6 -> not adult, filter applied", () => {
  const ctx = getMemberAgeContext({ age_months: 6 });
  assertEquals(ctx.applyFilter, true);
  assertEquals(ctx.ageMonths, 6);
});
