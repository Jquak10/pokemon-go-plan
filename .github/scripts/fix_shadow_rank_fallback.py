from pathlib import Path

p = Path("src/index.js")
s = p.read_text(encoding="utf-8")

old = """  if (exact?.raid_rankings_json) {
    return exact.raid_rankings_json;
  }

  const familyKey =
"""
new = """  if (exact?.raid_rankings_json) {
    return exact.raid_rankings_json;
  }

  // A Shadow target must never inherit a normal-form comparison profile.
  // It will appear once the exact Shadow raid form has been assessed.
  if (normalized.startsWith(\"shadow \")) {
    return null;
  }

  const familyKey =
"""

if s.count(old) != 1:
    raise SystemExit(f"expected one fallback marker, found {s.count(old)}")

p.write_text(s.replace(old, new, 1), encoding="utf-8")
Path(".github/scripts/fix_shadow_rank_fallback.py").unlink(missing_ok=True)
Path(".github/workflows/fix-shadow-rank-fallback.yml").unlink(missing_ok=True)
