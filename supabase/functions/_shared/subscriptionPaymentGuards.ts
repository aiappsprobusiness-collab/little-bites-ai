/**
 * Серверные правила выдачи Premium по webhook Т-Банка.
 * Цены — из subscriptionPricing.json (тот же источник, что create-payment).
 */
import pricing from "./subscriptionPricing.json" with { type: "json" };

export type SubscriptionPlan = "month" | "year";

export function expectedAmountKopecks(plan: SubscriptionPlan): number {
  return plan === "year" ? pricing.yearRub * 100 : pricing.monthRub * 100;
}

export type WebhookGrantGateResult =
  | { grant: true; plan: SubscriptionPlan }
  | { grant: false; reason: string; details?: Record<string, unknown> };

/**
 * Решение: можно ли подтверждать подписку и вызывать confirm_subscription_webhook.
 * Источник тарифа — plan в строке subscriptions (создана в create-payment вместе с order_id и суммой Init).
 * Сумма из уведомления должна в точности совпадать с канонической ценой этого тарифа.
 */
export function evaluateWebhookSubscriptionGrant(args: {
  dbPlan: string | null | undefined;
  amountKopecks: unknown;
  notificationOrderId: string | null | undefined;
  rowOrderId: string | null | undefined;
  dataPlan: string | null | undefined;
}): WebhookGrantGateResult {
  if (args.dbPlan !== "month" && args.dbPlan !== "year") {
    return { grant: false, reason: "invalid_db_plan", details: { dbPlan: args.dbPlan } };
  }
  const plan = args.dbPlan as SubscriptionPlan;

  const raw = args.amountKopecks;
  if (raw == null) {
    return { grant: false, reason: "missing_amount" };
  }
  const actual = Math.round(Number(raw));
  if (!Number.isFinite(actual) || actual < 0) {
    return { grant: false, reason: "amount_not_numeric", details: { raw } };
  }

  const expected = expectedAmountKopecks(plan);
  if (actual !== expected) {
    return {
      grant: false,
      reason: "amount_does_not_match_plan",
      details: { plan, expected, actual },
    };
  }

  if (args.dataPlan != null && args.dataPlan !== "") {
    if (args.dataPlan === "month" || args.dataPlan === "year") {
      if (args.dataPlan !== plan) {
        return {
          grant: false,
          reason: "data_plan_vs_db_mismatch",
          details: { dataPlan: args.dataPlan, dbPlan: plan },
        };
      }
    }
  }

  const nid = (args.notificationOrderId ?? "").trim();
  const rid = (args.rowOrderId ?? "").trim();
  if (nid.length > 0 && rid.length > 0 && nid !== rid) {
    return {
      grant: false,
      reason: "order_id_mismatch",
      details: { notificationOrderId: nid, rowOrderId: rid },
    };
  }

  const oidForPattern = nid.length > 0 ? nid : rid;
  if (oidForPattern.length > 0) {
    const hasYear = /_year_/.test(oidForPattern);
    const hasMonth = /_month_/.test(oidForPattern);
    if (plan === "year" && !hasYear) {
      return {
        grant: false,
        reason: "order_id_missing_year_segment",
        details: { orderId: oidForPattern },
      };
    }
    if (plan === "month" && !hasMonth) {
      return {
        grant: false,
        reason: "order_id_missing_month_segment",
        details: { orderId: oidForPattern },
      };
    }
    if (hasYear && hasMonth) {
      return {
        grant: false,
        reason: "order_id_ambiguous_plan_tokens",
        details: { orderId: oidForPattern },
      };
    }
  }

  return { grant: true, plan };
}
