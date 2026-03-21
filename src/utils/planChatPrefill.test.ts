import { describe, expect, it } from "vitest";
import { getPlanSlotChatPrefillMessage, PLAN_SLOT_CHAT_PREFILL_BY_MEAL_TYPE } from "./planChatPrefill";

describe("getPlanSlotChatPrefillMessage", () => {
  it("маппит известные слоты", () => {
    expect(getPlanSlotChatPrefillMessage("breakfast")).toBe(PLAN_SLOT_CHAT_PREFILL_BY_MEAL_TYPE.breakfast);
    expect(getPlanSlotChatPrefillMessage("lunch")).toBe(PLAN_SLOT_CHAT_PREFILL_BY_MEAL_TYPE.lunch);
    expect(getPlanSlotChatPrefillMessage("snack")).toBe(PLAN_SLOT_CHAT_PREFILL_BY_MEAL_TYPE.snack);
    expect(getPlanSlotChatPrefillMessage("dinner")).toBe(PLAN_SLOT_CHAT_PREFILL_BY_MEAL_TYPE.dinner);
  });

  it("даёт запасной вариант для неизвестного типа", () => {
    expect(getPlanSlotChatPrefillMessage("")).toBe("Подберите блюдо");
    expect(getPlanSlotChatPrefillMessage("unknown")).toBe("Подберите блюдо");
  });
});
