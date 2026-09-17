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
script = replace_labeled_call(
    script,
    "particle cost inference",
    particle_replacement,
)

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
script = replace_labeled_call(
    script,
    "recommendation resource metadata",
    metadata_replacement,
)

response_replacement = """sub_once(
    index,
    r'(    recommendations,\\n    remote_raid_plan: remoteRaidPlan,\\n)(    raid_activity:)',
    r'''\\1    battle_resource_plan:
      battleResourcePlan,
\\2''',
    "getMe resource response"
)"""
script = replace_labeled_call(
    script,
    "getMe resource response",
    response_replacement,
)

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
script = replace_labeled_call(
    script,
    "battle resource route",
    route_replacement,
)

max_card_replacement = '''replace_once(
    manage,
    """  const allocated =
    Number(
      allocation?.allocated || 0
    );

  const allocationClass =""",
    """  const allocated =
    Number(
      allocation?.allocated || 0
    );

  const maxParticleCost =
    isMax
      ? Number(
          rec.max_particle_cost || 0
        )
      : 0;

  const allocationClass =""",
    "Max allocation particle cost"
)

replace_once(
    manage,
    """        ${
          !isMax
            ? `
              <span class=\"allocation-inline-badge ${allocationClass}\">
                ${
                  allocated > 0
                    ? `${formatNumber(allocated)} Remote raid${allocated === 1 ? \"\" : \"s\"}`
                    : \"0 Remote raids\"
                }
              </span>
            `
            : \"\"
        }""",
    """        ${
          !isMax
            ? `
              <span class=\"allocation-inline-badge ${allocationClass}\">
                ${
                  allocated > 0
                    ? `${formatNumber(allocated)} Remote raid${allocated === 1 ? \"\" : \"s\"}`
                    : \"0 Remote raids\"
                }
              </span>
            `
            : `
              <span class=\"allocation-inline-badge ${allocationClass}\">
                ${
                  allocated > 0
                    ? `${formatNumber(allocated)} Remote Max battle${allocated === 1 ? \"\" : \"s\"}`
                    : \"0 Remote Max battles\"
                }
              </span>
              <span class=\"max-particle-cost-badge ${maxParticleCost ? \"\" : \"cost-unknown\"}\">
                ${
                  maxParticleCost
                    ? `${formatNumber(maxParticleCost)} MP each`
                    : \"MP cost unknown\"
                }
              </span>
            `
        }""",
    "Max allocation badges"
)'''
script = replace_labeled_call(
    script,
    "Max allocation card metadata",
    max_card_replacement,
)

# These labels occur in both the cross-system Today card and Raid-only
# summaries. Remove the broad substitutions and re-add exact replacements
# scoped to the Today card so Raid-specific terminology stays intact.
for pattern, label in (
    (
        r"^[ \t]*'<span>Planner budget</span>': '<span>Remote Pass plan</span>',\n",
        "Planner budget generic UI replacement",
    ),
    (
        r"^[ \t]*'<small>Worthwhile paid raids</small>': '<small>Recommended additional passes</small>',\n",
        "Worthwhile paid raids generic UI replacement",
    ),
    (
        r"^[ \t]*'<span>Today\\'s ceiling</span>': '<span>Remote Pass ceiling</span>',\n",
        "Today's ceiling generic UI replacement",
    ),
):
    script, count = re.subn(
        pattern,
        "",
        script,
        count=1,
        flags=re.M,
    )
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
    raise SystemExit(
        f"Could not scope manage UI replacements; found {script.count(ui_scope_marker)} replacement maps"
    )
script = script.replace(
    ui_scope_marker,
    ui_scope_insert,
    1,
)

exec(compile(script, "part3-integrate.py", "exec"), {})
