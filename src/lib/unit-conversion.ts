/**
 * Unit conversion + price normalization helpers.
 * Base units: kg / l / pz.
 */

export type UnitKey = "pz" | "kg" | "g" | "l" | "ml" | "conf";
export type UnitFamily = "weight" | "volume" | "count";

const norm = (u: string | null | undefined) => (u ?? "").toLowerCase().trim();

/** Base unit for a given unit. */
export function baseUnit(unit: UnitKey | string | null | undefined): "kg" | "l" | "pz" {
  const u = norm(unit);
  if (u === "kg" || u === "g") return "kg";
  if (u === "l" || u === "ml") return "l";
  return "pz";
}

/** Convert a quantity expressed in `unit` to its base unit amount. */
export function toBaseUnitQty(quantity: number, unit: UnitKey | string | null | undefined): number {
  if (!Number.isFinite(quantity)) return 0;
  const u = norm(unit);
  if (u === "g") return quantity / 1000;
  if (u === "ml") return quantity / 1000;
  return quantity;
}

/** Backward-compatible alias of toBaseUnitQty. */
export const convertToBaseUnit = toBaseUnitQty;

/** String label for the base unit of a given unit. */
export function baseUnitOf(unit: string | null | undefined): string {
  return baseUnit(unit);
}

/** True when `unit` is a sub-unit that needs conversion (g, ml). */
export function isSubUnit(unit: string | null | undefined): boolean {
  const u = norm(unit);
  return u === "g" || u === "ml";
}

export function unitFamily(unit: string | null | undefined): UnitFamily {
  const u = norm(unit);
  if (u === "g" || u === "kg") return "weight";
  if (u === "ml" || u === "l") return "volume";
  return "count";
}

/**
 * Calculates price-per-base-unit for a purchase.
 * - totalPrice: total paid
 * - purchaseQty: quantity bought, in the given unit
 * - unit: unit of purchaseQty
 * - itemsPerPack: number of pieces in pack (multi-pack)
 * - volumePerItem: volume/weight of each item in the pack, in `unit`
 */
export function calcUnitPrices(
  totalPrice: number,
  purchaseQty: number,
  unit: UnitKey | string,
  itemsPerPack: number = 1,
  volumePerItem: number = 0,
): {
  pricePerBaseUnit: number;
  baseUnitLabel: string;
  pricePerPiece: number | null;
  totalBaseQty: number;
} {
  const base = baseUnit(unit);
  if (itemsPerPack > 1 && volumePerItem > 0) {
    const totalVolume = itemsPerPack * toBaseUnitQty(volumePerItem, unit);
    return {
      pricePerBaseUnit: totalVolume > 0 ? totalPrice / totalVolume : totalPrice,
      baseUnitLabel: `€/${base}`,
      pricePerPiece: totalPrice / itemsPerPack,
      totalBaseQty: totalVolume,
    };
  }
  const baseQty = toBaseUnitQty(purchaseQty, unit);
  return {
    pricePerBaseUnit: baseQty > 0 ? totalPrice / baseQty : totalPrice,
    baseUnitLabel: `€/${base}`,
    pricePerPiece: norm(unit) === "pz" && purchaseQty > 0 ? totalPrice / purchaseQty : null,
    totalBaseQty: baseQty,
  };
}

/** Estimate cost for a desired quantity given a price-per-base-unit. */
export function estimateCost(
  pricePerBaseUnit: number,
  quantity: number,
  unit: UnitKey | string,
): number {
  return pricePerBaseUnit * toBaseUnitQty(quantity, unit);
}