import { assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import { trustLevelKeyForMetrics, trustOrder } from "./trustLevelTier.ts";

Deno.test("trustOrder: trusted highest tier (0)", () => {
  assertEquals(trustOrder("trusted"), 0);
});

Deno.test("trustOrder: core aligns with catalog tier (1) like starter/seed", () => {
  assertEquals(trustOrder("core"), 1);
  assertEquals(trustOrder("starter"), 1);
  assertEquals(trustOrder("seed"), 1);
});

Deno.test("trustOrder: candidate and null lowest tier (2)", () => {
  assertEquals(trustOrder("candidate"), 2);
  assertEquals(trustOrder(null), 2);
  assertEquals(trustOrder(undefined), 2);
});

Deno.test("trustLevelKeyForMetrics: core explicit bucket", () => {
  assertEquals(trustLevelKeyForMetrics("core"), "core");
  assertEquals(trustLevelKeyForMetrics("trusted"), "trusted");
  assertEquals(trustLevelKeyForMetrics("starter"), "starter_or_seed");
  assertEquals(trustLevelKeyForMetrics("seed"), "starter_or_seed");
  assertEquals(trustLevelKeyForMetrics("candidate"), "candidate_or_null");
  assertEquals(trustLevelKeyForMetrics(null), "candidate_or_null");
});
