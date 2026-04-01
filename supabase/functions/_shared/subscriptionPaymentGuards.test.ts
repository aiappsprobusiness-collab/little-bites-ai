import { assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import { evaluateWebhookSubscriptionGrant, expectedAmountKopecks } from "./subscriptionPaymentGuards.ts";

Deno.test("expectedAmountKopecks: month 29900, year 199900", () => {
  assertEquals(expectedAmountKopecks("month"), 29900);
  assertEquals(expectedAmountKopecks("year"), 199900);
});

Deno.test("grant: valid month + amount + order", () => {
  const r = evaluateWebhookSubscriptionGrant({
    dbPlan: "month",
    amountKopecks: 29900,
    notificationOrderId: "abc_month_xyz",
    rowOrderId: "abc_month_xyz",
    dataPlan: "month",
  });
  assertEquals(r.grant, true);
  if (r.grant) assertEquals(r.plan, "month");
});

Deno.test("grant: valid year", () => {
  const r = evaluateWebhookSubscriptionGrant({
    dbPlan: "year",
    amountKopecks: 199900,
    notificationOrderId: "prefix12chars_year_lx",
    rowOrderId: "prefix12chars_year_lx",
    dataPlan: "year",
  });
  assertEquals(r.grant, true);
});

Deno.test("reject: amount 100 kopecks", () => {
  const r = evaluateWebhookSubscriptionGrant({
    dbPlan: "month",
    amountKopecks: 100,
    notificationOrderId: "a_month_b",
    rowOrderId: "a_month_b",
    dataPlan: null,
  });
  assertEquals(r.grant, false);
  if (!r.grant) assertEquals(r.reason, "amount_does_not_match_plan");
});

Deno.test("reject: year plan but month amount", () => {
  const r = evaluateWebhookSubscriptionGrant({
    dbPlan: "year",
    amountKopecks: 29900,
    notificationOrderId: "u_year_x",
    rowOrderId: "u_year_x",
    dataPlan: "year",
  });
  assertEquals(r.grant, false);
  if (!r.grant) assertEquals(r.reason, "amount_does_not_match_plan");
});

Deno.test("reject: month plan but year amount", () => {
  const r = evaluateWebhookSubscriptionGrant({
    dbPlan: "month",
    amountKopecks: 199900,
    notificationOrderId: "u_month_x",
    rowOrderId: "u_month_x",
    dataPlan: "month",
  });
  assertEquals(r.grant, false);
});

Deno.test("reject: data plan vs db", () => {
  const r = evaluateWebhookSubscriptionGrant({
    dbPlan: "year",
    amountKopecks: 199900,
    notificationOrderId: "u_year_x",
    rowOrderId: "u_year_x",
    dataPlan: "month",
  });
  assertEquals(r.grant, false);
  if (!r.grant) assertEquals(r.reason, "data_plan_vs_db_mismatch");
});

Deno.test("reject: order_id notification vs row", () => {
  const r = evaluateWebhookSubscriptionGrant({
    dbPlan: "month",
    amountKopecks: 29900,
    notificationOrderId: "a_month_1",
    rowOrderId: "a_month_2",
    dataPlan: "month",
  });
  assertEquals(r.grant, false);
  if (!r.grant) assertEquals(r.reason, "order_id_mismatch");
});

Deno.test("reject: invalid db plan", () => {
  const r = evaluateWebhookSubscriptionGrant({
    dbPlan: "lifetime",
    amountKopecks: 29900,
    notificationOrderId: "x_month_y",
    rowOrderId: "x_month_y",
    dataPlan: null,
  });
  assertEquals(r.grant, false);
  if (!r.grant) assertEquals(r.reason, "invalid_db_plan");
});

Deno.test("reject: missing amount", () => {
  const r = evaluateWebhookSubscriptionGrant({
    dbPlan: "month",
    amountKopecks: null,
    notificationOrderId: "x_month_y",
    rowOrderId: "x_month_y",
    dataPlan: null,
  });
  assertEquals(r.grant, false);
  if (!r.grant) assertEquals(r.reason, "missing_amount");
});

Deno.test("grant: empty notification OrderId but row order_id matches pattern (lookup by PaymentId)", () => {
  const r = evaluateWebhookSubscriptionGrant({
    dbPlan: "year",
    amountKopecks: 199900,
    notificationOrderId: "",
    rowOrderId: "abcdabcdabcd_year_lx9z2",
    dataPlan: null,
  });
  assertEquals(r.grant, true);
});
