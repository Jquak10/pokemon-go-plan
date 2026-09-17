-- Apply once, after 0002. ALTER preserves Target IDs and historical Raid FKs.
-- NULL keeps legacy rows unchanged: explicit Max names infer their capability,
-- while unqualified historical names continue to mean ordinary Raids.
ALTER TABLE targets ADD COLUMN battle_kind TEXT
  CHECK (battle_kind IN ('raid', 'dynamax', 'gigantamax'));

-- New Max targets use canonical capability-prefixed pokemon_name values.
-- This preserves the existing per-user/name/goal unique constraint while
-- allowing Raid, Dynamax and Gigantamax goals for the same species to coexist.
