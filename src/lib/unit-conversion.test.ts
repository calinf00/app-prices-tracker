import { describe, it, expect } from "vitest";
import { convertToBaseUnit, calcUnitPrices } from "./unit-conversion";

describe("convertToBaseUnit", () => {
  it("converts grams to kg", () => {
    expect(convertToBaseUnit(150, "g")).toBeCloseTo(0.15, 10);
  });
  it("leaves pieces unchanged", () => {
    expect(convertToBaseUnit(3, "pz")).toBe(3);
  });
});

describe("calcUnitPrices (price is TOTAL for the recorded quantity)", () => {
  it("price=4 qty=150g => €/kg ≈ 26.666…", () => {
    const r = calcUnitPrices(4, 150, "g");
    expect(r.pricePerBaseUnit).toBeCloseTo(4 / 0.15, 6);
    expect(r.baseUnitLabel).toBe("€/kg");
  });
  it("price=2 qty=1 pz => €/pz = 2", () => {
    const r = calcUnitPrices(2, 1, "pz");
    expect(r.pricePerBaseUnit).toBe(2);
  });
  it("price=3 qty=500ml => €/l = 6", () => {
    const r = calcUnitPrices(3, 500, "ml");
    expect(r.pricePerBaseUnit).toBeCloseTo(6, 6);
    expect(r.baseUnitLabel).toBe("€/l");
  });
});