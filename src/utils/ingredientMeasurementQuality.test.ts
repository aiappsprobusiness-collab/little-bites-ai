import { describe, expect, it } from "vitest";
import {
  isHumanReadableHouseholdQuantity,
  passesDualMeasurementQualityGate,
  scaledHouseholdStaysReadableForDual,
} from "@shared/ingredientMeasurementQuality";

describe("ingredientMeasurementQuality", () => {
  it("isHumanReadableHouseholdQuantity: допускает целые и четверти", () => {
    expect(isHumanReadableHouseholdQuantity(1)).toBe(true);
    expect(isHumanReadableHouseholdQuantity(1.5)).toBe(true);
    expect(isHumanReadableHouseholdQuantity(0.25)).toBe(true);
    expect(isHumanReadableHouseholdQuantity(0.75)).toBe(true);
  });

  it("isHumanReadableHouseholdQuantity: режет «мусорные» дроби", () => {
    expect(isHumanReadableHouseholdQuantity(0.18)).toBe(false);
    expect(isHumanReadableHouseholdQuantity(1.37)).toBe(false);
    expect(isHumanReadableHouseholdQuantity(2.83)).toBe(false);
  });

  it("passesDualMeasurementQualityGate: low без explicit — false", () => {
    expect(
      passesDualMeasurementQualityGate({
        householdAmount: 1,
        reliability: "low",
        canonicalAmount: 150,
        canonicalUnit: "g",
        explicitHousehold: false,
        candidateKind: "piece",
      }),
    ).toBe(false);
  });

  it("scaledHouseholdStaysReadableForDual", () => {
    expect(scaledHouseholdStaysReadableForDual(1, 2)).toBe(true);
    expect(scaledHouseholdStaysReadableForDual(0.5, 3)).toBe(true);
    expect(scaledHouseholdStaysReadableForDual(1, 2.17)).toBe(false);
  });
});
