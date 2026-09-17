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
label = '    "particle cost inference"\n)'
label_index = script.find(label)
if label_index < 0:
    raise SystemExit("Could not locate particle cost inference block")

block_start = script.rfind("replace_once(", 0, label_index)
if block_start < 0:
    raise SystemExit("Could not locate start of particle cost inference block")
block_end = label_index + len(label)

replacement = """sub_once(
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

script = script[:block_start] + replacement + script[block_end:]
exec(compile(script, "part3-integrate.py", "exec"), {})
