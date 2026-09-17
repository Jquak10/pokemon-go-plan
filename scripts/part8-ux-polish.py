from pathlib import Path


def replace_once(text, old, new, label):
    count = text.count(old)
    if count != 1:
        raise RuntimeError(f"{label}: expected one match, found {count}")
    return text.replace(old, new, 1)


manage_path = Path("public/manage.html")
manage = manage_path.read_text()

manage = manage.replace('/styles.css?v=35', '/styles.css?v=36')
manage = replace_once(
    manage,
    '<small>Additional Remote Raids</small>',
    '<small>Additional worthwhile Remote Pass uses</small>',
    'hero recommendation copy',
)
manage = replace_once(
    manage,
    '<span id="allocationTotalBadge" class="status-badge badge-green">0 raids</span>',
    '<span id="allocationTotalBadge" class="status-badge badge-green">0 Remote Passes</span>',
    'allocation badge default',
)
manage = replace_once(
    manage,
    '<p class="field-help">Remote Max usage is recorded separately. Its daily participation cap is not verified here; check the in-game limit.</p>',
    '<p class="field-help">Remote Raids and Remote Max Battles share the same official daily Remote participation limit. This log updates that shared counter automatically when a Remote Pass is consumed.</p>',
    'logger shared-limit help',
)
manage = replace_once(
    manage,
    'The personal ceiling is shared by ordinary Remote Raids and Remote Max Battles. The official Remote Raid participation limit remains a separate Raid-only rule.',
    'Your personal Remote Pass ceiling and the official daily Remote participation limit both apply across ordinary Remote Raids and Remote Max Battles. Event increases or unlimited periods apply to that same shared counter.',
    'preferences shared-limit copy',
)

manage = replace_once(
    manage,
    '<nav class="tab-nav" aria-label="Planner sections">',
    '<nav class="tab-nav" aria-label="Planner sections" role="tablist">',
    'tablist role',
)
for tab, panel in [
    ('plan', 'panel-plan'),
    ('targets', 'panel-targets'),
    ('hundo', 'panel-hundo'),
    ('preferences', 'panel-preferences'),
    ('calendar', 'panel-calendar'),
]:
    old = f'class="tab-button{' active' if tab == 'plan' else ''}" type="button" data-tab="{tab}" aria-selected="{'true' if tab == 'plan' else 'false'}"'
    new = old + f' role="tab" aria-controls="{panel}"'
    manage = replace_once(manage, old, new, f'{tab} tab semantics')

for tab, panel in [
    ('plan', 'panel-plan'),
    ('targets', 'panel-targets'),
    ('hundo', 'panel-hundo'),
    ('preferences', 'panel-preferences'),
    ('calendar', 'panel-calendar'),
]:
    active = ' active' if tab == 'plan' else ''
    old = f'<section class="tab-panel{active}" data-panel="{tab}">'
    new = f'<section id="{panel}" class="tab-panel{active}" data-panel="{tab}" role="tabpanel">'
    manage = replace_once(manage, old, new, f'{tab} panel semantics')

manage = replace_once(
    manage,
    '''let modalLockedScrollY = 0;
let modalPageLocked = false;
let modalTouchStartY = 0;
let desktopQuickRailFrame = 0;''',
    '''let modalLockedScrollY = 0;
let modalPageLocked = false;
let modalTouchStartY = 0;
let mobileMoreLockedScrollY = 0;
let mobileMorePageLocked = false;
let desktopQuickRailFrame = 0;''',
    'mobile more lock state',
)

manage = replace_once(
    manage,
    '''function closeMobileMoreSheet() {
  document
    .getElementById(
      "mobileMoreBackdrop"
    )
    ?.classList.add(
      "hidden"
    );

  document
    .getElementById(
      "mobileMoreButton"
    )
    ?.setAttribute(
      "aria-expanded",
      "false"
    );
}

function openMobileMoreSheet() {
  document
    .getElementById(
      "mobileMoreBackdrop"
    )
    ?.classList.remove(
      "hidden"
    );

  document
    .getElementById(
      "mobileMoreButton"
    )
    ?.setAttribute(
      "aria-expanded",
      "true"
    );
}''',
    '''function lockPageForMobileMore() {
  if (mobileMorePageLocked) return;

  mobileMorePageLocked = true;
  mobileMoreLockedScrollY = window.scrollY || window.pageYOffset || 0;

  document.documentElement.classList.add("mobile-more-open");
  document.body.classList.add("mobile-more-open");
  document.body.style.position = "fixed";
  document.body.style.top = `-${mobileMoreLockedScrollY}px`;
  document.body.style.left = "0";
  document.body.style.right = "0";
  document.body.style.width = "100%";
  setForegroundSheetOpen(true);
}

function unlockPageForMobileMore() {
  if (!mobileMorePageLocked) return;

  const restoreY = mobileMoreLockedScrollY;
  mobileMorePageLocked = false;

  document.documentElement.classList.remove("mobile-more-open");
  document.body.classList.remove("mobile-more-open");
  document.body.style.position = "";
  document.body.style.top = "";
  document.body.style.left = "";
  document.body.style.right = "";
  document.body.style.width = "";
  setForegroundSheetOpen(false);
  window.scrollTo(0, restoreY);
}

function closeMobileMoreSheet() {
  const backdrop = document.getElementById("mobileMoreBackdrop");
  const wasOpen = backdrop && !backdrop.classList.contains("hidden");

  backdrop?.classList.add("hidden");

  const button = document.getElementById("mobileMoreButton");
  button?.setAttribute("aria-expanded", "false");

  if (wasOpen) {
    unlockPageForMobileMore();
    setTimeout(() => button?.focus(), 0);
  }
}

function openMobileMoreSheet() {
  const backdrop = document.getElementById("mobileMoreBackdrop");
  if (!backdrop || !backdrop.classList.contains("hidden")) return;

  lockPageForMobileMore();
  backdrop.classList.remove("hidden");

  document
    .getElementById("mobileMoreButton")
    ?.setAttribute("aria-expanded", "true");

  setTimeout(
    () => document.getElementById("closeMobileMore")?.focus(),
    0
  );
}''',
    'mobile more open close lock',
)

manage = replace_once(
    manage,
    '''function renderHero() {
  const plan = state.remote_raid_plan;
  const rule = plan.official_rule;''',
    '''function renderHero() {
  const plan = state.remote_raid_plan;
  const sharedPassPlan = state.battle_resource_plan?.remote_passes || {};
  const rule = plan.official_rule;''',
    'hero shared plan declaration',
)
manage = replace_once(
    manage,
    'document.getElementById("heroRecommended").textContent = formatNumber(plan.recommended_total);',
    'document.getElementById("heroRecommended").textContent = formatNumber(sharedPassPlan.recommended_additional ?? plan.recommended_total);',
    'hero shared recommendation',
)
manage = replace_once(
    manage,
    '''  document.getElementById(
    "desktopRailRecommended"
  ).textContent =
    formatNumber(
      state.remote_raid_plan
        ?.recommended_raids ??
      state.remote_raid_plan
        ?.recommended_additional_raids ??
      0
    );''',
    '''  document.getElementById(
    "desktopRailRecommended"
  ).textContent =
    formatNumber(
      state.battle_resource_plan
        ?.remote_passes
        ?.recommended_additional ??
      state.remote_raid_plan
        ?.recommended_raids ??
      state.remote_raid_plan
        ?.recommended_additional_raids ??
      0
    );''',
    'desktop rail shared recommendation',
)

manage = replace_once(
    manage,
    '''  for (
    const rec of
    state.recommendations || []
  ) {
    entries.push({''',
    '''  for (
    const rec of
    state.recommendations || []
  ) {
    const recBattleLabel = battleLogLabel({
      battle_system: rec.battle_system || "raid",
      battle_variant: rec.battle_variant || null
    });

    entries.push({''',
    'command palette battle label',
)
manage = replace_once(
    manage,
    '''      meta:
        "Raid recommendation",''',
    '''      meta:
        `${recBattleLabel} recommendation`,''',
    'command recommendation meta',
)
manage = replace_once(
    manage,
    '''      label:
        `Log ${rec.pokemon_name} raid`,
      meta:
        "Quick action",
      action: () =>
        openRaidLogModal(
          rec.pokemon_name
        )''',
    '''      label:
        `Log ${rec.pokemon_name} ${recBattleLabel}`,
      meta:
        "Quick action",
      action: () =>
        openRaidLogModal(
          rec.pokemon_name,
          rec.target?.id || null,
          rec
        )''',
    'command log action',
)

manage_path.write_text(manage)

# Cache-bump every public page that loads the shared stylesheet.
for rel in ["public/index.html", "public/admin.html", "public/sources.html"]:
    path = Path(rel)
    text = path.read_text()
    if '/styles.css?v=35' not in text:
        raise RuntimeError(f'{rel}: expected styles v35 reference')
    path.write_text(text.replace('/styles.css?v=35', '/styles.css?v=36'))

styles_path = Path("public/styles.css")
styles = styles_path.read_text()
marker = "PART 8 UX POLISH + REGRESSION HARDENING · v36"
if marker in styles:
    raise RuntimeError('Part 8 CSS marker already exists')
styles += r'''


/* ============================================================
   PART 8 UX POLISH + REGRESSION HARDENING · v36
   ============================================================ */

/* Make the battle-type chooser read as a compact segmented control. */
.battle-plan-filter {
  width: fit-content;
  max-width: 100%;
  padding: 4px;
  border: 1px solid #dfe7f0;
  border-radius: 14px;
  background: #f4f7fb;
}

.battle-filter-button {
  min-height: 40px;
  border: 1px solid transparent;
  border-radius: 10px;
  background: transparent;
  color: #65788d;
  box-shadow: none;
}

.battle-filter-button:hover {
  transform: none;
  background: rgba(255,255,255,.7);
  box-shadow: none;
}

.battle-filter-button.active {
  border-color: #d4e2ef;
  background: #fff;
  color: #225f9b;
  box-shadow: 0 3px 10px rgba(39,78,116,.08);
}

.battle-filter-button[data-battle-filter="max"].active {
  color: #6248b7;
  border-color: #ddd5f6;
  background: #faf8ff;
}

/* Keep score priority on the left edge while making battle system scannable. */
.battle-card {
  border-top-width: 3px;
}

.battle-card-raid {
  border-top-color: #b9d7f5;
}

.battle-card-max {
  border-top-color: #cfc2f6;
  background: linear-gradient(180deg, #fdfcff 0, #fff 86px);
}

.battle-card-max .battle-system-badge,
.battle-card-max .max-capability-badge {
  color: #6047aa;
  border-color: #ddd4f5;
  background: #f4f0ff;
}

.battle-card-max .max-capability-gigantamax {
  color: #8a4e18;
  border-color: #f0d4ad;
  background: #fff7e9;
}

/* Details get the flexible column; primary actions stay aligned and tappable. */
.recommendation-footer-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto auto;
  gap: 8px;
  align-items: center;
}

.recommendation-footer-row .log-raid-button,
.recommendation-footer-row .small-button {
  min-height: 40px;
  white-space: nowrap;
}

/* The More sheet is a foreground surface: only it may scroll while open. */
@media (max-width: 760px) {
  html.mobile-more-open,
  body.mobile-more-open {
    overflow: hidden !important;
    overscroll-behavior: none;
  }

  body.mobile-more-open {
    height: 100%;
    touch-action: none;
  }

  .mobile-more-backdrop:not(.hidden) {
    overscroll-behavior: none;
    touch-action: none;
  }

  .mobile-more-sheet {
    max-height: min(82dvh, 680px);
    overflow-x: hidden;
    overflow-y: auto;
    overscroll-behavior: contain;
    -webkit-overflow-scrolling: touch;
    touch-action: pan-y;
    padding-bottom: calc(16px + env(safe-area-inset-bottom));
  }

  .battle-plan-filter {
    width: 100%;
  }

  .recommendation-footer-row {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    align-items: stretch;
  }

  .recommendation-footer-row .compact-details {
    grid-column: 1 / -1;
  }

  .recommendation-footer-row .log-raid-button,
  .recommendation-footer-row .small-button {
    width: 100%;
    min-width: 0;
    white-space: normal;
  }
}
'''
styles_path.write_text(styles)

# Permanent regression assertions ride the existing Battle Plan / logger test files.
plan_test_path = Path("tests/battle-plan-ui.test.mjs")
plan_test = plan_test_path.read_text()
plan_test = plan_test.replace('/styles\\.css\\?v=35/', '/styles\\.css\\?v=36/')
plan_test += r'''

// Part 8: shared-resource UX must stay battle-system aware.
assert.match(manage, /Additional worthwhile Remote Pass uses/);
assert.match(manage, /sharedPassPlan\.recommended_additional \?\? plan\.recommended_total/);
assert.match(manage, /battle_resource_plan[\s\S]*remote_passes[\s\S]*recommended_additional/);
assert.match(manage, /`\$\{recBattleLabel\} recommendation`/);
assert.match(manage, /openRaidLogModal\([\s\S]*rec\.pokemon_name,[\s\S]*rec\.target\?\.id \|\| null,[\s\S]*rec/);
assert.match(manage, /role="tablist"/);
assert.match(manage, /role="tabpanel"/);
assert.match(manage, /function lockPageForMobileMore/);
assert.match(manage, /function unlockPageForMobileMore/);
assert.match(styles, /PART 8 UX POLISH \+ REGRESSION HARDENING · v36/);
assert.match(styles, /html\.mobile-more-open/);
assert.match(styles, /\.battle-card-max[\s\S]*border-top-color/);
assert.match(styles, /recommendation-footer-row[\s\S]*grid-template-columns/);
assert.doesNotMatch(manage, /daily participation cap is not verified here/i);
assert.doesNotMatch(manage, /separate Raid-only rule/i);
'''
plan_test_path.write_text(plan_test)

logger_test_path = Path("tests/battle-logging-ui.test.mjs")
logger_test = logger_test_path.read_text()
logger_test += r'''
assert.match(manage,/Remote Raids and Remote Max Battles share the same official daily Remote participation limit/i);
assert.doesNotMatch(manage,/check the in-game limit/i);
'''
logger_test_path.write_text(logger_test)

print('Part 8 UX polish patch applied')
