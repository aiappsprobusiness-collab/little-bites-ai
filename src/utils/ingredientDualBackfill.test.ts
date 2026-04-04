import { describe, expect, it } from "vitest";
import {
  evaluateDualMeasurementBackfill,
  looksLikeCustomIngredientDisplay,
  maybeUpgradeIngredientMeasurement,
} from "@shared/ingredientDualBackfill";

describe("ingredientDualBackfill", () => {
  it("already_valid_dual: валидный dual не трогаем", () => {
    const ev = evaluateDualMeasurementBackfill({
      name: "Чеснок",
      display_text: "Чеснок — 2 зубчика = 10 г",
      canonical_amount: 10,
      canonical_unit: "g",
      category: "vegetables",
      measurement_mode: "dual",
      display_amount: 2,
      display_unit: "зубчик",
      display_quantity_text: null,
    });
    expect(ev.decision).toBe("skip");
    if (ev.decision === "skip") expect(ev.reason).toBe("already_valid_dual");
  });

  it("canonical_only + сильный кандидат → updated_to_dual", () => {
    const ev = evaluateDualMeasurementBackfill({
      name: "Чеснок",
      display_text: "Чеснок — 10 г",
      canonical_amount: 10,
      canonical_unit: "g",
      category: "vegetables",
      measurement_mode: "canonical_only",
      display_amount: null,
      display_unit: null,
      display_quantity_text: null,
    });
    expect(ev.decision).toBe("update");
    if (ev.decision === "update") {
      expect(ev.reason).toBe("updated_to_dual");
      expect(ev.patch.measurement_mode).toBe("dual");
      expect(ev.patch.display_text).toContain("=");
    }
  });

  it("canonical_only + слабый кандидат (нет dual из engine) → skip", () => {
    const ev = evaluateDualMeasurementBackfill({
      name: "Тыква",
      display_text: "Тыква — 150 г",
      canonical_amount: 150,
      canonical_unit: "g",
      category: "vegetables",
      measurement_mode: "canonical_only",
      display_amount: null,
      display_unit: null,
      display_quantity_text: null,
    });
    expect(ev.decision).toBe("skip");
    if (ev.decision === "skip") expect(ev.reason).toBe("no_dual_from_engine");
  });

  it("idempotency: после применения patch повторная оценка даёт already_valid_dual", () => {
    const first = evaluateDualMeasurementBackfill({
      name: "Чеснок",
      display_text: "Чеснок — 10 г",
      canonical_amount: 10,
      canonical_unit: "g",
      category: "vegetables",
      measurement_mode: "canonical_only",
      display_amount: null,
      display_unit: null,
      display_quantity_text: null,
    });
    expect(first.decision).toBe("update");
    if (first.decision !== "update") throw new Error("expected update");

    const second = evaluateDualMeasurementBackfill({
      name: "Чеснок",
      display_text: first.patch.display_text,
      canonical_amount: 10,
      canonical_unit: "g",
      category: "vegetables",
      measurement_mode: "dual",
      display_amount: first.patch.display_amount,
      display_unit: first.patch.display_unit,
      display_quantity_text: first.patch.display_quantity_text,
    });
    expect(second.decision).toBe("skip");
    if (second.decision === "skip") expect(second.reason).toBe("already_valid_dual");
  });

  it("maybeUpgradeIngredientMeasurement: upgraded=false при отсутствии кандидата", () => {
    const r = maybeUpgradeIngredientMeasurement({
      name: "Тыква",
      display_text: "Тыква — 150 г",
      canonical_amount: 150,
      canonical_unit: "g",
      category: "vegetables",
      measurement_mode: "canonical_only",
      display_amount: null,
      display_unit: null,
      display_quantity_text: null,
    });
    expect(r.upgraded).toBe(false);
    expect(r.patch).toBeUndefined();
  });

  it("looksLikeCustomIngredientDisplay: длинный текст без структуры", () => {
    expect(
      looksLikeCustomIngredientDisplay(
        "Морковь очень мелко нарезать и слегка обжарить до золотистого состояния на сковороде с маслом",
      ),
    ).toBe(true);
  });

  it("looksLikeCustomIngredientDisplay: строка с граммами после тире — не custom", () => {
    expect(looksLikeCustomIngredientDisplay("Морковь — 50 г")).toBe(false);
  });

  it("canonical_only + похоже на свободную подпись → skipped_likely_custom_display_text", () => {
    const ev = evaluateDualMeasurementBackfill({
      name: "Морковь",
      display_text:
        "Морковь очень мелко нарезать и слегка обжарить до золотистого состояния на сковороде с небольшим количеством масла",
      canonical_amount: 100,
      canonical_unit: "g",
      category: "vegetables",
      measurement_mode: "canonical_only",
      display_amount: null,
      display_unit: null,
      display_quantity_text: null,
    });
    expect(ev.decision).toBe("skip");
    if (ev.decision === "skip") expect(ev.reason).toBe("skipped_likely_custom_display_text");
  });

  it("битый dual: enrich чинит до нового dual", () => {
    const ev = evaluateDualMeasurementBackfill({
      name: "Чеснок",
      display_text: "Чеснок — 10 г",
      canonical_amount: 10,
      canonical_unit: "g",
      category: "vegetables",
      measurement_mode: "dual",
      display_amount: 99,
      display_unit: "зубчик",
      display_quantity_text: null,
    });
    expect(ev.decision).toBe("update");
    if (ev.decision === "update") expect(ev.patch.display_amount).toBe(2);
  });
});
