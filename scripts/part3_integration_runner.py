from pathlib import Path
import re
import textwrap

workflow = Path(".github/workflows/part3-resource-patch.yml").read_text()
match = re.search(
    r"python3 <<'PY'\n(?P<body>[\s\S]*?)\n\s+PY\n\n\s+node --check src/index\.js",
    workflow,
)
if not match:
    raise SystemExit("Could not extract original guarded patch script")

script = textwrap.dedent(match.group("body"))


def replace_labeled_call(source, label, replacement):
    marker = f'    "{label}"\n)'
    marker_index = source.find(marker)
    if marker_index < 0:
        raise SystemExit(f"Could not locate {label} block")

    block_start = source.rfind("replace_once(", 0, marker_index)
    if block_start < 0:
        raise SystemExit(f"Could not locate start of {label} block")

    block_end = marker_index + len(marker)
    return source[:block_start] + replacement + source[block_end:]


particle_replacement = """sub_once(
    index,
    r'(      const battlePresentation =\\n        battleOpportunityPresentation\\(\\n          battleMetadata\\n        \\);\\n)(\\n      const key = \\[)',
    r'''\\1
      const maxParticleCost =
        inferMaxParticleCost({
          ...battleMetadata,
          pokemon_name:
            match.name,
          event_title:
            event.summary,
          event_description:
            event.description || ""
        });
\\2''',
    "particle cost inference"
)"""
script = replace_labeled_call(script, "particle cost inference", particle_replacement)

metadata_replacement = """sub_once(
    index,
    r'(        battle_presentation:\\n          battlePresentation,\\n)(        sprite_exact_form:)',
    r'''\\1        max_particle_cost:
          maxParticleCost.cost,
        max_particle_cost_source:
          maxParticleCost.basis,
        event_description:
          event.description || "",
\\2''',
    "recommendation resource metadata"
)"""
script = replace_labeled_call(script, "recommendation resource metadata", metadata_replacement)

response_replacement = """sub_once(
    index,
    r'(    recommendations,\\n    remote_raid_plan: remoteRaidPlan,\\n)(    raid_activity:)',
    r'''\\1    battle_resource_plan:
      battleResourcePlan,
\\2''',
    "getMe resource response"
)"""
script = replace_labeled_call(script, "getMe resource response", response_replacement)

route_replacement = """sub_once(
    index,
    r'(    if \\(request\\.method === "POST" && path === "/api/remote-raid-usage"\\) \\{\\n      return updateRemoteRaidUsage\\(request, env\\);\\n    \\}\\n)',
    r'''\\1
    if (
      request.method === "POST" &&
      path === "/api/battle-resources"
    ) {
      return updateBattleResourcesApi(
        request,
        env
      );
    }
''',
    "battle resource route"
)"""
script = replace_labeled_call(script, "battle resource route", route_replacement)

max_card_replacement = """def max_badge_repl(match):
    return match.group(1) + '''`
                  <span class="allocation-inline-badge ${allocationClass}">
                    ${
                      allocated > 0
                        ? `${formatNumber(allocated)} Remote Max battle${allocated === 1 ? "" : "s"}`
                        : "0 Remote Max battles"
                    }
                  </span>
                  <span class="max-particle-cost-badge ${maxParticleCost ? "" : "cost-unknown"}">
                    ${
                      maxParticleCost
                        ? `${formatNumber(maxParticleCost)} MP each`
                        : "MP cost unknown"
                    }
                  </span>
                `''' + match.group(2)

sub_once(
    manage,
    r'(: "0 Remote raids"\\n\\s+}\\n\\s+</span>\\n\\s+`\\n\\s+: )""(\\n\\s+})',
    max_badge_repl,
    "Max allocation badges"
)"""
script = replace_labeled_call(script, "Max allocation card metadata", max_card_replacement)

shared_cards_replacement = """sub_once(
    manage,
    r'''    rec =>\n      renderRecommendationCard\(\n        rec,\n        rec\.battle_system === "max"\n          \? null\n          : allocationByName\.get\(\n              normalizePickerName\(\n                rec\.pokemon_name\n              \)\n            \)\n      \);''',
    r'''    rec => {
      const shared =
        sharedAllocationByKey.get(
          `${rec.battle_system || "raid"}|${normalizePickerName(rec.pokemon_name)}`
        );

      const legacy =
        rec.battle_system === "max"
          ? null
          : allocationByName.get(
              normalizePickerName(
                rec.pokemon_name
              )
            );

      return renderRecommendationCard(
        rec,
        shared || legacy
      );
    };''',
    "shared allocation cards"
)"""
script = replace_labeled_call(script, "shared allocation cards", shared_cards_replacement)

for pattern, label in (
    (r"^[ \t]*'<span>Planner budget</span>': '<span>Remote Pass plan</span>',\n", "Planner budget generic UI replacement"),
    (r"^[ \t]*'<small>Worthwhile paid raids</small>': '<small>Recommended additional passes</small>',\n", "Worthwhile paid raids generic UI replacement"),
    (r"^[ \t]*'<span>Today\\'s ceiling</span>': '<span>Remote Pass ceiling</span>',\n", "Today's ceiling generic UI replacement"),
):
    script, count = re.subn(pattern, "", script, count=1, flags=re.M)
    if count != 1:
        raise SystemExit(f"Could not remove {label}; found {count}")

ui_scope_marker = "replacements = {\n"
ui_scope_insert = '''replace_once(
    manage,
    ''' + "'''" + '''            <span>Planner budget</span>
            <strong id="todayPlannerBudget">—</strong>
            <small>Worthwhile paid raids</small>''' + "'''" + ''',
    ''' + "'''" + '''            <span>Remote Pass plan</span>
            <strong id="todayPlannerBudget">—</strong>
            <small>Recommended additional passes</small>''' + "'''" + ''',
    "Today Remote Pass plan copy"
)

replace_once(
    manage,
    ''' + "'''" + '''            <span>Today's ceiling</span>
            <strong id="todayEffectiveBudget">—</strong>
            <small>After preference / override</small>''' + "'''" + ''',
    ''' + "'''" + '''            <span>Remote Pass ceiling</span>
            <strong id="todayEffectiveBudget">—</strong>
            <small>After preference / override</small>''' + "'''" + ''',
    "Today Remote Pass ceiling copy"
)

replacements = {
'''
if script.count(ui_scope_marker) != 1:
    raise SystemExit(f"Could not scope manage UI replacements; found {script.count(ui_scope_marker)} replacement maps")
script = script.replace(ui_scope_marker, ui_scope_insert, 1)

# Fix the resource-planning helper before running the integration. Named Max
# tiers (for example, "Tier 3 Max Battle") are authoritative enough for the
# standard tier-cost table even when the title does not also say "3-star".
resource_path = Path("src/resource-planning.js")
resource_text = resource_path.read_text()
old_tier_block = '''  const tierMatch =
    text.match(
      /(?:\\b(?:tier|difficulty)\\s*)?\\b([1-6])\\s*(?:-?\\s*star|★)/i
    );
'''
new_tier_block = '''  const namedTierMatch =
    text.match(
      /\\b(?:tier|difficulty)\\s*([1-6])\\b/i
    );

  const starTierMatch =
    text.match(
      /\\b([1-6])\\s*(?:-?\\s*star|★)/i
    );

  const tierMatch =
    namedTierMatch ||
    starTierMatch;
'''
if resource_text.count(old_tier_block) != 1:
    raise SystemExit(
        f"Max tier inference patch expected one match, found {resource_text.count(old_tier_block)}"
    )
resource_path.write_text(resource_text.replace(old_tier_block, new_tier_block, 1))

exec(compile(script, "part3-integrate.py", "exec"), {})
