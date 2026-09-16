from pathlib import Path
import re


def sub1(text, pattern, replacement, label, flags=0):
    out, count = re.subn(pattern, replacement, text, count=1, flags=flags)
    if count != 1:
        raise SystemExit(f"{label}: expected 1 match, found {count}")
    return out


# Backend -----------------------------------------------------------------
p = Path("src/index.js")
s = p.read_text(encoding="utf-8")

# Correct RFC 5545 all-day DTEND handling. DTSTART/DTEND VALUE=DATE ranges
# use an exclusive end date, while the app stores inclusive start/end days.
date_fn = """function dateFromPropertyLine(line) {
  if (!line) return null;
  const colon = line.indexOf(\":\");
  if (colon < 0) return null;
  const raw = line.slice(colon + 1);
  const match = raw.match(/^(\\d{4})(\\d{2})(\\d{2})/);
  if (!match) return null;
  return `${match[1]}-${match[2]}-${match[3]}`;
}
"""
if s.count(date_fn) != 1:
    raise SystemExit(f"date helper marker: expected 1, found {s.count(date_fn)}")
helper = date_fn + """
function inclusiveEndDateFromPropertyLine(line, fallbackStartDate = null) {
  const endDate = dateFromPropertyLine(line);
  if (!endDate) return fallbackStartDate;

  const colon = line.indexOf(\":\");
  const left = colon >= 0 ? line.slice(0, colon).toUpperCase() : \"\";
  const raw = colon >= 0 ? line.slice(colon + 1).trim() : \"\";
  const isAllDay = left.includes(\"VALUE=DATE\") || /^\\d{8}$/.test(raw);

  if (!isAllDay) return endDate;

  // RFC 5545 all-day DTEND is exclusive. Internally the app compares
  // inclusive calendar days, so subtract one day before storing/using it.
  const adjusted = addDaysIso(endDate, -1);
  if (!adjusted) return fallbackStartDate || endDate;
  if (fallbackStartDate && adjusted < fallbackStartDate) {
    return fallbackStartDate;
  }
  return adjusted;
}
"""
s = s.replace(date_fn, helper, 1)

s = sub1(
    s,
    r"end_date: dateFromPropertyLine\(dtendProp\?\.line \|\| dtstartProp\.line\),",
    """end_date: dtendProp
      ? inclusiveEndDateFromPropertyLine(
          dtendProp.line,
          dateFromPropertyLine(dtstartProp.line)
        )
      : dateFromPropertyLine(dtstartProp.line),""",
    "parse all-day DTEND",
)

# Existing D1 rows may still have the old exclusive end_date. Use dtend_line
# defensively while recommending so expired bosses disappear immediately,
# without waiting for the next scheduled import.
s = sub1(
    s,
    r"(async function recommendationsForDate\([\s\S]*?const map = new Map\(\);\n\n  )for \(const event of events\) \{\n    if \(",
    lambda m: m.group(1)
    + """for (const event of events) {
    const effectiveEndDate = event.dtend_line
      ? inclusiveEndDateFromPropertyLine(event.dtend_line, event.start_date)
      : (event.end_date || event.start_date);

    if (effectiveEndDate && effectiveEndDate < day) {
      continue;
    }

    if (""",
    "recommendation end-date gate",
)

# Bulk target deletion API. Each delete is ownership-scoped to the authenticated
# user and is batched into a single D1 call.
delete_fn = """  await env.DB.prepare(`
    DELETE FROM targets
    WHERE id = ? AND user_id = ?
  `).bind(id, user.id).run();

  return json({ ok: true });
}
"""
if s.count(delete_fn) != 1:
    raise SystemExit(f"deleteTarget marker: expected 1, found {s.count(delete_fn)}")
bulk_fn = delete_fn + """
async function bulkDeleteTargets(request, env) {
  let body;
  try {
    body = await request.json();
  } catch {
    return bad(\"Invalid JSON body.\");
  }

  const user = await userByManageToken(env, body?.token);
  if (!user) return bad(\"Invalid management link.\", 401);

  const ids = [...new Set(
    (Array.isArray(body?.target_ids) ? body.target_ids : [])
      .map((id) => String(id || \"\").trim())
      .filter(Boolean)
  )];

  if (!ids.length) return bad(\"Select at least one target.\");
  if (ids.length > 200) return bad(\"Too many targets selected.\");

  const results = await env.DB.batch(
    ids.map((id) => env.DB.prepare(`
      DELETE FROM targets
      WHERE id = ? AND user_id = ?
    `).bind(id, user.id))
  );

  const deleted = results.reduce(
    (sum, result) => sum + Number(result?.meta?.changes || 0),
    0
  );

  return json({ ok: true, deleted });
}
"""
s = s.replace(delete_fn, bulk_fn, 1)

s = sub1(
    s,
    r'(    if \(request\.method === "DELETE" && path === "/api/targets"\) \{\n      return deleteTarget\(request, env\);\n    \})',
    lambda m: """    if (request.method === \"POST\" && path === \"/api/targets/bulk-delete\") {
      return bulkDeleteTargets(request, env);
    }

""" + m.group(1),
    "bulk delete route",
)

p.write_text(s, encoding="utf-8")


# Frontend ----------------------------------------------------------------
p = Path("public/manage.html")
s = p.read_text(encoding="utf-8")

# Add selection mode without requiring new stylesheet rules.
s = sub1(
    s,
    r'(<button id="openAddTarget" type="button" class="button add-target-button">)',
    lambda m: '<button id="toggleTargetSelection" type="button" class="secondary">Select</button>\n\n              ' + m.group(1),
    "selection toggle",
)

s = sub1(
    s,
    r'(<div id="targetFilterSummary" class="target-filter-summary"></div>\n)',
    lambda m: m.group(1) + """          <div id=\"bulkTargetActions\" class=\"target-heading-actions hidden\" aria-live=\"polite\">
            <button id=\"selectAllVisibleTargets\" type=\"button\" class=\"secondary\">Select all shown</button>
            <button id=\"deleteSelectedTargets\" type=\"button\" class=\"ghost-danger\" disabled>Delete selected</button>
            <button id=\"cancelTargetSelection\" type=\"button\" class=\"secondary\">Cancel</button>
          </div>
""",
    "bulk target action bar",
)

s = sub1(
    s,
    r'(let state = null;\nlet targetById = new Map\(\);)',
    lambda m: m.group(1) + "\nlet targetSelectionMode = false;\nconst selectedTargetIds = new Set();",
    "selection state",
)

# The mobile nav is hidden while foreground-sheet-open is present. Always clear
# that shared state when closing a modal, and remove the modal touch guards.
s = sub1(
    s,
    r'(function unlockPageForModal\(\) \{[\s\S]*?document\.body\.style\.width = "";\n)(\n  window\.scrollTo\()',
    lambda m: m.group(1)
    + """

  document.removeEventListener(
    \"touchstart\",
    modalTouchStartGuard
  );

  document.removeEventListener(
    \"touchmove\",
    modalTouchMoveGuard
  );

  setForegroundSheetOpen(false);
"""
    + m.group(2),
    "mobile nav/modal cleanup",
)

# Global nav badge = all active targets, independent of current target filters.
s = sub1(
    s,
    r'document\.getElementById\("targetTabCount"\)\.textContent = state\.targets\.length;',
    'document.getElementById("targetTabCount").textContent = activeTargets;',
    "active target nav badge",
)

# Per-target selection affordance only appears while selection mode is active.
s = sub1(
    s,
    r'(<div class="target-actions compact-target-actions">\n)(\s*<button\n\s*type="button"\n\s*class="log-raid-button small-button")',
    lambda m: m.group(1)
    + """        ${targetSelectionMode ? `
          <button
            type=\"button\"
            class=\"${selectedTargetIds.has(String(target.id)) ? \"button\" : \"secondary\"} small-button\"
            data-select-target=\"${esc(target.id)}\"
            aria-pressed=\"${selectedTargetIds.has(String(target.id)) ? \"true\" : \"false\"}\"
          >${selectedTargetIds.has(String(target.id)) ? \"Selected ✓\" : \"Select\"}</button>
        ` : \"\"}

"""
    + m.group(2),
    "target select button",
)

helpers = """function visibleTargetIdsForSelection() {
  return filteredTargets().map((target) => String(target.id));
}

function syncTargetSelectionUi(list = filteredTargets()) {
  const validIds = new Set((state?.targets || []).map((target) => String(target.id)));
  for (const id of [...selectedTargetIds]) {
    if (!validIds.has(id)) selectedTargetIds.delete(id);
  }

  const visibleIds = list.map((target) => String(target.id));
  const allVisibleSelected =
    visibleIds.length > 0 && visibleIds.every((id) => selectedTargetIds.has(id));
  const toggle = document.getElementById(\"toggleTargetSelection\");
  const actions = document.getElementById(\"bulkTargetActions\");
  const deleteButton = document.getElementById(\"deleteSelectedTargets\");
  const selectAllButton = document.getElementById(\"selectAllVisibleTargets\");

  toggle.textContent = targetSelectionMode ? \"Done\" : \"Select\";
  toggle.setAttribute(\"aria-pressed\", targetSelectionMode ? \"true\" : \"false\");
  actions.classList.toggle(\"hidden\", !targetSelectionMode);

  deleteButton.disabled = selectedTargetIds.size === 0;
  deleteButton.textContent = selectedTargetIds.size
    ? `Delete ${selectedTargetIds.size} selected`
    : \"Delete selected\";

  selectAllButton.disabled = visibleIds.length === 0;
  selectAllButton.textContent = allVisibleSelected
    ? `Clear shown (${visibleIds.length})`
    : `Select all shown (${visibleIds.length})`;
}

function toggleTargetSelectionMode() {
  targetSelectionMode = !targetSelectionMode;
  if (!targetSelectionMode) selectedTargetIds.clear();
  renderTargets();
}

function toggleTargetSelected(id) {
  const key = String(id);
  if (selectedTargetIds.has(key)) selectedTargetIds.delete(key);
  else selectedTargetIds.add(key);
  renderTargets();
}

function toggleAllVisibleTargets() {
  const ids = visibleTargetIdsForSelection();
  const allSelected = ids.length > 0 && ids.every((id) => selectedTargetIds.has(id));
  for (const id of ids) {
    if (allSelected) selectedTargetIds.delete(id);
    else selectedTargetIds.add(id);
  }
  renderTargets();
}

async function bulkDeleteSelectedTargets() {
  const ids = [...selectedTargetIds];
  if (!ids.length) return;

  if (!confirm(`Delete ${ids.length} selected target${ids.length === 1 ? \"\" : \"s\"}?`)) {
    return;
  }

  const button = document.getElementById(\"deleteSelectedTargets\");
  button.disabled = true;
  button.textContent = \"Deleting…\";

  try {
    await api(\"/api/targets/bulk-delete\", {
      method: \"POST\",
      headers: { \"content-type\": \"application/json\" },
      body: JSON.stringify({ token, target_ids: ids })
    });

    selectedTargetIds.clear();
    targetSelectionMode = false;
    await load();
    activateTab(\"targets\", false);
  } catch (error) {
    alert(error.message);
    syncTargetSelectionUi();
  }
}

"""
marker = "function renderTargets() {\n"
if s.count(marker) != 1:
    raise SystemExit(f"renderTargets marker: expected 1, found {s.count(marker)}")
s = s.replace(marker, helpers + marker, 1)

s = sub1(
    s,
    r'(const list =\n\s*filteredTargets\(\n\s*matchingTargets\n\s*\);)',
    lambda m: m.group(1) + "\n\n  syncTargetSelectionUi(list);",
    "selection UI sync",
)

# Close target modal before reload; reload must not preserve the foreground
# sheet state that hides mobile navigation.
s = sub1(
    s,
    r'(status\.textContent = "Saved ✓";\n)\s*await load\(\);\n\s*closeTargetModal\(\);',
    lambda m: m.group(1) + "    closeTargetModal();\n    await load();",
    "target save modal order",
)

s = sub1(
    s,
    r'(document\.getElementById\("openAddTarget"\)\.addEventListener\("click", \(\) => openTargetModal\(\)\);)',
    lambda m: m.group(1)
    + """
document.getElementById(\"toggleTargetSelection\").addEventListener(\"click\", toggleTargetSelectionMode);
document.getElementById(\"cancelTargetSelection\").addEventListener(\"click\", () => {
  targetSelectionMode = false;
  selectedTargetIds.clear();
  renderTargets();
});
document.getElementById(\"selectAllVisibleTargets\").addEventListener(\"click\", toggleAllVisibleTargets);
document.getElementById(\"deleteSelectedTargets\").addEventListener(\"click\", bulkDeleteSelectedTargets);""",
    "wire bulk target controls",
)

s = sub1(
    s,
    r'(document\.getElementById\("targets"\)\.addEventListener\("click", event => \{\n)(\s*const edit = event\.target\.closest\("\[data-edit-target\]"\);)',
    lambda m: m.group(1)
    + """  const select = event.target.closest(\"[data-select-target]\");
  if (select) {
    toggleTargetSelected(select.dataset.selectTarget);
    return;
  }

"""
    + m.group(2),
    "target selection click handler",
)

p.write_text(s, encoding="utf-8")
