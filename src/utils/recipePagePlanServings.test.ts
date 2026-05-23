import { describe, expect, it } from "vitest";
import {
  computePlanServingsHydration,
  shouldPersistPlanServings,
} from "./recipePagePlanServings";

const viewKey = "plan:2026-05-23:lunch:child-1:recipe-1";

describe("computePlanServingsHydration", () => {
  it("новый слот без servings: servings_base (2) + persistBaseToSlot", () => {
    const r = computePlanServingsHydration({
      hydrated: false,
      servingsViewKey: viewKey,
      servingsSelected: 1,
      slotServings: undefined,
      planSlotResolved: true,
      dayPlanBlocked: false,
      servingsBase: 2,
      userChanged: false,
    });
    expect(r.servingsSelected).toBe(2);
    expect(r.hydrated).toBe(true);
    expect(r.persistBaseToSlot).toBe(2);
  });

  it("после гидрации не откатывает UI при slotServings=1", () => {
    const r = computePlanServingsHydration({
      hydrated: true,
      servingsViewKey: viewKey,
      servingsSelected: 2,
      slotServings: 1,
      planSlotResolved: true,
      dayPlanBlocked: false,
      servingsBase: 2,
      userChanged: false,
    });
    expect(r.servingsSelected).toBe(2);
    expect(r.persistBaseToSlot).toBeNull();
  });

  it("берёт servings из слота, если есть", () => {
    const r = computePlanServingsHydration({
      hydrated: false,
      servingsViewKey: viewKey,
      servingsSelected: 1,
      slotServings: 3,
      planSlotResolved: true,
      dayPlanBlocked: false,
      servingsBase: 2,
      userChanged: false,
    });
    expect(r.servingsSelected).toBe(3);
    expect(r.persistBaseToSlot).toBeNull();
  });
});

describe("shouldPersistPlanServings", () => {
  it("не пишет начальную 1 при пустом slotServings", () => {
    expect(
      shouldPersistPlanServings({
        servingsSelected: 1,
        slotServings: undefined,
        userChanged: false,
        pendingBasePersist: null,
      })
    ).toBe(false);
  });

  it("пишет servings_base после гидрации (pendingBasePersist)", () => {
    expect(
      shouldPersistPlanServings({
        servingsSelected: 2,
        slotServings: undefined,
        userChanged: false,
        pendingBasePersist: 2,
      })
    ).toBe(true);
  });

  it("пишет при ручном изменении, даже без slotServings", () => {
    expect(
      shouldPersistPlanServings({
        servingsSelected: 3,
        slotServings: undefined,
        userChanged: true,
        pendingBasePersist: null,
      })
    ).toBe(true);
  });

  it("пишет при расхождении с сохранённым slotServings", () => {
    expect(
      shouldPersistPlanServings({
        servingsSelected: 3,
        slotServings: 1,
        userChanged: false,
        pendingBasePersist: null,
      })
    ).toBe(true);
  });
});
