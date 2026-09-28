-- BL-053: repair older installations that predate the explicit
-- remote_raid_limit_overrides date index. Production schema health on
-- 29 September 2026 verified that this index alone was missing.
--
-- Safe to re-run: no rows or table definitions are modified.
CREATE INDEX IF NOT EXISTS idx_remote_raid_limit_dates
ON remote_raid_limit_overrides(start_date, end_date, active);
