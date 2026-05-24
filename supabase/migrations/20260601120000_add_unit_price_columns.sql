ALTER TABLE purchases
  ADD COLUMN IF NOT EXISTS price_per_base_unit numeric(10,4),
  ADD COLUMN IF NOT EXISTS base_unit text CHECK (base_unit IN ('kg','l','pz'));

UPDATE purchases
SET
  price_per_base_unit = CASE
    WHEN unit = 'g'  AND quantity > 0 THEN price / (quantity / 1000.0)
    WHEN unit = 'ml' AND quantity > 0 THEN price / (quantity / 1000.0)
    WHEN unit IN ('kg','l','pz') AND quantity > 0 THEN price / quantity
    ELSE price
  END,
  base_unit = CASE
    WHEN unit IN ('kg','g') THEN 'kg'
    WHEN unit IN ('l','ml') THEN 'l'
    ELSE 'pz'
  END
WHERE price_per_base_unit IS NULL AND quantity IS NOT NULL AND quantity > 0;
