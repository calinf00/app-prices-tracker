/**
 * Unit conversion helpers for shopping list / receipt totals.
 *
 * Prices stored against weight/volume items are typically expressed per
 * base unit (€/kg, €/l). Quantities, however, can be entered in sub-units
 * (g, ml). Multiplying directly would inflate the total by 1000x — use
 * `convertToBaseUnit` to normalize the quantity before multiplying.
 */

export type UnitFamily = "weight" | "volume" | "count";

/** Convert a quantity expressed in `unit` to its base unit (kg / l / pz). */
export function convertToBaseUnit(quantity: number, unit: string | null | undefined): number {
  if (!Number.isFinite(quantity)) return 0;
  const u = (unit ?? "").toLowerCase().trim();
  if (u === "g") return quantity / 1000;
  if (u === "ml") return quantity / 1000;
  return quantity;
}

/** Returns the base unit symbol for a given unit (g→kg, ml→l, others→self). */
export function baseUnitOf(unit: string | null | undefined): string {
  const u = (unit ?? "").toLowerCase().trim();
  if (u === "g" || u === "kg") return "kg";
  if (u === "ml" || u === "l") return "l";
  return u || "pz";
}

/** True when `unit` is a sub-unit that needs conversion (g, ml). */
export function isSubUnit(unit: string | null | undefined): boolean {
  const u = (unit ?? "").toLowerCase().trim();
  return u === "g" || u === "ml";
}

export function unitFamily(unit: string | null | undefined): UnitFamily {
  const u = (unit ?? "").toLowerCase().trim();
  if (u === "g" || u === "kg") return "weight";
  if (u === "ml" || u === "l") return "volume";
  return "count";
}