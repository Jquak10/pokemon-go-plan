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

exec(compile(script, "part3-integrate.py", "exec"), {})
