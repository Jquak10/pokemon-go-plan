(() => {
  if (window.__pogoBattlePlanUiInstalled) return;
  window.__pogoBattlePlanUiInstalled = true;

  const MAX_SOURCE_TYPES = new Set([
    "max_battles",
    "max_mondays"
  ]);

  const FILTERS = new Set([
    "all",
    "raid",
    "max"
  ]);

  let battlePlanFilter = (() => {
    try {
      const saved = sessionStorage.getItem("pogo-battle-plan-filter");
      return FILTERS.has(saved) ? saved : "all";
    } catch {
      return "all";
    }
  })();

  function battleSystemForRecommendation(rec) {
    return MAX_SOURCE_TYPES.has(String(rec?.source_type || ""))
      ? "max"
      : "raid";
  }

  function maxVariantForRecommendation(rec) {
    if (battleSystemForRecommendation(rec) !== "max") return null;

    const text = `${rec?.pokemon_name || ""} ${rec?.event_title || ""}`;
    return /\bgigantamax\b|\bg[\s-]?max\b/i.test(text)
      ? "gigantamax"
      : "dynamax";
  }

  function battleSystemLabel(rec) {
    return battleSystemForRecommendation(rec) === "max"
      ? "Max Battle"
      : "Raid";
  }

  function maxVariantLabel(rec) {
    const variant = maxVariantForRecommendation(rec);
    if (variant === "gigantamax") return "Gigantamax";
    if (variant === "dynamax") return "Dynamax";
    return "";
  }

  function normalizedMaxIdentity(value) {
    return normalizePickerName(value)
      .replace(/\b(?:gigantamax|dynamax|g[\s-]?max)\b/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function exactGigantamaxCatalogEntry(rec) {
    if (!pokemonCatalog?.length) return null;

    const wanted = normalizedMaxIdentity(rec?.pokemon_name || "");

    return pokemonCatalog.find(entry => {
      const name = String(entry?.name || "");
      const kind = String(entry?.kind || "");
      const exactForm =
        /\bgigantamax\b|\bg[\s-]?max\b/i.test(name) ||
        /gigantamax|g[\s-]?max/i.test(kind);

      if (!exactForm) return false;
      if (!wanted) return true;

      const candidate = normalizedMaxIdentity(name);
      return candidate === wanted ||
        candidate.includes(wanted) ||
        wanted.includes(candidate);
    }) || null;
  }

  function battleSpriteHtml(rec, className = "pokemon-sprite recommendation-sprite") {
    const system = battleSystemForRecommendation(rec);
    const variant = maxVariantForRecommendation(rec);

    if (system === "max" && variant === "gigantamax") {
      const exact = exactGigantamaxCatalogEntry(rec);
      return exact?.sprite_url
        ? spriteImg(exact.sprite_url, exact.name, className)
        : "";
    }

    if (system === "max") {
      const encounter =
        raidEncounterEntry(rec?.pokemon_name) ||
        catalogEntryByName(rec?.pokemon_name);

      const url = encounter?.sprite_url || rec?.sprite_url || rec?.meta?.sprite_url;
      const name = encounter?.name || rec?.pokemon_name;
      return spriteImg(url, name, className);
    }

    return spriteImg(
      rec?.sprite_url || rec?.meta?.sprite_url,
      rec?.pokemon_name,
      className
    );
  }

  function battleIdentityBadges(rec) {
    const system = battleSystemForRecommendation(rec);
    const variant = maxVariantLabel(rec);

    return `
      <span class="battle-system-badge battle-system-${esc(system)}">
        ${esc(battleSystemLabel(rec))}
      </span>
      ${variant ? `<span class="battle-variant-badge battle-variant-${esc(variant.toLowerCase())}">${esc(variant)}</span>` : ""}
    `;
  }

  function injectBattlePlanStyles() {
    if (document.getElementById("battlePlanUiStyles")) return;

    const style = document.createElement("style");
    style.id = "battlePlanUiStyles";
    style.textContent = `
      .mobile-plan-label { display: none; }

      .battle-plan-heading-actions {
        display: flex;
        align-items: center;
        justify-content: flex-end;
        gap: 10px;
        flex-wrap: wrap;
      }

      .battle-plan-filters {
        display: inline-grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        gap: 4px;
        padding: 4px;
        border: 1px solid rgba(127, 127, 127, 0.24);
        border-radius: 12px;
        background: rgba(127, 127, 127, 0.07);
      }

      .battle-plan-filter-button {
        min-height: 40px;
        padding: 8px 12px;
        border-radius: 9px;
        border: 0;
        background: transparent;
        color: inherit;
        white-space: nowrap;
        font: inherit;
        font-weight: 700;
      }

      .battle-plan-filter-button.active {
        background: var(--accent-soft, rgba(31, 111, 235, 0.14));
        color: var(--accent, #1f6feb);
      }

      .battle-plan-filter-count {
        display: inline-flex;
        min-width: 20px;
        min-height: 20px;
        align-items: center;
        justify-content: center;
        margin-left: 4px;
        padding: 0 5px;
        border-radius: 999px;
        background: rgba(127, 127, 127, 0.14);
        font-size: 0.78em;
      }

      .recommendation-card.is-max-battle {
        border-style: solid;
      }

      .battle-identity-row {
        display: flex;
        gap: 6px;
        align-items: center;
        flex-wrap: wrap;
      }

      .battle-system-badge,
      .battle-variant-badge,
      .battle-resource-badge,
      .battle-planning-only {
        display: inline-flex;
        min-height: 28px;
        align-items: center;
        padding: 4px 8px;
        border-radius: 999px;
        font-size: 0.76rem;
        font-weight: 800;
        line-height: 1;
      }

      .battle-system-badge {
        border: 1px solid rgba(127, 127, 127, 0.28);
        background: rgba(127, 127, 127, 0.08);
      }

      .battle-system-max,
      .battle-variant-dynamax,
      .battle-variant-gigantamax {
        border: 1px solid rgba(148, 84, 219, 0.34);
        background: rgba(148, 84, 219, 0.10);
      }

      .battle-resource-badge {
        border: 1px solid rgba(127, 127, 127, 0.24);
        background: rgba(127, 127, 127, 0.07);
      }

      .battle-planning-only {
        color: inherit;
        opacity: 0.72;
      }

      .max-catch-note {
        margin-top: 10px;
        padding: 10px 12px;
        border-radius: 10px;
        background: rgba(127, 127, 127, 0.07);
        font-size: 0.88rem;
        line-height: 1.45;
      }

      .battle-plan-empty-filter {
        grid-column: 1 / -1;
      }

      @media (max-width: 760px) {
        .desktop-plan-label { display: none; }
        .mobile-plan-label { display: inline; }

        .battle-plan-heading-actions {
          width: 100%;
          justify-content: stretch;
        }

        .battle-plan-filters {
          width: 100%;
        }

        .battle-plan-filter-button {
          min-height: 44px;
          padding: 8px 7px;
          font-size: 0.86rem;
        }

        .battle-plan-heading-actions > .status-badge {
          margin-left: auto;
        }
      }

      @media (min-width: 761px) {
        .battle-plan-filter-button {
          min-height: 44px;
        }
      }
    `;

    document.head.appendChild(style);
  }

  function updatePlanTabLabel() {
    const label = document.querySelector('[data-tab="plan"] > span:nth-child(2)');
    if (!label) return;

    label.innerHTML = `
      <span class="desktop-plan-label">Battle Plan</span>
      <span class="mobile-plan-label">Plan</span>
    `;
  }

  function renameStaticBattleUi() {
    document.title = "My Pokémon GO Battle Planner";

    const kicker = document.querySelector(".brand-kicker");
    if (kicker) {
      kicker.innerHTML = '<span class="brand-mark" aria-hidden="true">⚡</span> PERSONAL BATTLE STRATEGY';
    }

    const heroTitle = document.querySelector(".hero-copy h1");
    if (heroTitle) heroTitle.textContent = "Pokémon GO Battle Planner";

    const heroCopy = document.querySelector(".hero-copy p");
    if (heroCopy) {
      heroCopy.textContent =
        "A live, personalized battle plan using current Raid and Max Battle value, your goals, and your Remote Raid preferences.";
    }

    updatePlanTabLabel();

    const card = document.querySelector(".raid-recommendations-card");
    const eyebrow = card?.querySelector(".section-eyebrow");
    const heading = card?.querySelector("h2");
    const subtitle = card?.querySelector(".section-subtitle");

    if (eyebrow) eyebrow.textContent = "BATTLE RECOMMENDATIONS";
    if (heading) heading.textContent = "Battle Plan";
    if (subtitle) {
      subtitle.textContent =
        "Compare current Raids and Max Battles, then open battle details for weaknesses and form-specific context.";
    }

    const zeroSummary = document.querySelector(".zero-raid-details > summary");
    if (zeroSummary) zeroSummary.textContent = "Raid bosses receiving 0 Remote Raids";
  }

  function ensureBattlePlanFilters() {
    if (document.getElementById("battlePlanFilters")) return;

    const card = document.querySelector(".raid-recommendations-card");
    const headingRow = card?.querySelector(".section-heading-row");
    const allocationBadge = document.getElementById("allocationTotalBadge");
    if (!headingRow || !allocationBadge) return;

    const actions = document.createElement("div");
    actions.className = "battle-plan-heading-actions";
    actions.innerHTML = `
      <div id="battlePlanFilters" class="battle-plan-filters" role="group" aria-label="Battle type">
        <button type="button" class="battle-plan-filter-button" data-battle-filter="all" aria-pressed="false">
          All <span id="battleFilterAllCount" class="battle-plan-filter-count">0</span>
        </button>
        <button type="button" class="battle-plan-filter-button" data-battle-filter="raid" aria-pressed="false">
          Raids <span id="battleFilterRaidCount" class="battle-plan-filter-count">0</span>
        </button>
        <button type="button" class="battle-plan-filter-button" data-battle-filter="max" aria-pressed="false">
          Max Battles <span id="battleFilterMaxCount" class="battle-plan-filter-count">0</span>
        </button>
      </div>
    `;

    allocationBadge.parentNode?.removeChild(allocationBadge);
    actions.appendChild(allocationBadge);
    headingRow.appendChild(actions);

    actions.addEventListener("click", event => {
      const button = event.target.closest("[data-battle-filter]");
      if (!button) return;

      const next = String(button.dataset.battleFilter || "all");
      battlePlanFilter = FILTERS.has(next) ? next : "all";

      try {
        sessionStorage.setItem("pogo-battle-plan-filter", battlePlanFilter);
      } catch {}

      renderRecommendations();
    });
  }

  function syncBattlePlanFilterUi(allRecommendations) {
    const raids = allRecommendations.filter(
      rec => battleSystemForRecommendation(rec) === "raid"
    );
    const maxBattles = allRecommendations.filter(
      rec => battleSystemForRecommendation(rec) === "max"
    );

    const counts = {
      all: allRecommendations.length,
      raid: raids.length,
      max: maxBattles.length
    };

    document.getElementById("battleFilterAllCount")?.replaceChildren(
      document.createTextNode(formatNumber(counts.all))
    );
    document.getElementById("battleFilterRaidCount")?.replaceChildren(
      document.createTextNode(formatNumber(counts.raid))
    );
    document.getElementById("battleFilterMaxCount")?.replaceChildren(
      document.createTextNode(formatNumber(counts.max))
    );

    document.querySelectorAll("[data-battle-filter]").forEach(button => {
      const active = button.dataset.battleFilter === battlePlanFilter;
      button.classList.toggle("active", active);
      button.setAttribute("aria-pressed", active ? "true" : "false");
    });

    document.querySelector(".zero-raid-details")?.classList.toggle(
      "hidden",
      battlePlanFilter === "max"
    );
  }

  function enhancedRaidIntelHtml(rec) {
    const intel = raidIntelForRecommendation(rec);

    if (!intel) {
      return pokemonCatalogPromise
        ? '<div class="raid-intel-loading">Loading battle intel…</div>'
        : "";
    }

    const weaknessPills = [
      ...intel.extraWeak.map(item => typePill(item.type, "extra-weak")),
      ...intel.weak.map(item => typePill(item.type))
    ].join("");

    const isMax = battleSystemForRecommendation(rec) === "max";
    const variant = maxVariantLabel(rec);
    const battleName = variant
      ? `${variant} ${intel.boss.name}`
      : intel.boss.name;

    return `
      <div class="raid-intel">
        <div class="raid-intel-row">
          <span class="raid-intel-label">Weak to</span>
          <div class="type-pill-row">
            ${weaknessPills || '<span class="muted">No weakness data</span>'}
          </div>
        </div>

        ${
          !isMax && intel.normalCp && intel.boostedCp
            ? `
              <div class="raid-hundo-cp">
                <span class="raid-intel-label">100% IV CP</span>
                <span><strong>${formatNumber(intel.normalCp)}</strong> normal</span>
                <span><strong>${formatNumber(intel.boostedCp)}</strong> weather boosted</span>
              </div>
            `
            : ""
        }

        <details class="battle-details">
          <summary>Battle details</summary>
          <div class="battle-details-grid">
            <div>
              <span class="mini-label">BOSS TYPE</span>
              <div class="type-pill-row">
                ${intel.boss.types.map(type => typePill(type)).join("")}
              </div>
            </div>

            <div>
              <span class="mini-label">RESISTS</span>
              <div class="type-pill-row">
                ${intel.resist.map(item => typePill(item.type)).join("") || '<span class="muted">None</span>'}
              </div>
            </div>

            ${
              isMax
                ? `
                  <div class="max-catch-note">
                    Battle: <strong>${esc(battleName)}</strong><br>
                    Catch encounter: <strong>${esc(intel.encounter?.name || rec.pokemon_name)}</strong> · Max-capable Pokémon<br>
                    <span class="muted">Raid-level Hundo CP is intentionally not reused for Max Battles.</span>
                  </div>
                `
                : (
                    intel.encounter &&
                    catalogKey(intel.encounter.name) !== catalogKey(intel.boss.name)
                      ? `
                        <div class="battle-catch-note">
                          Raid battle form: <strong>${esc(intel.boss.name)}</strong><br>
                          Catch encounter used for hundo CP: <strong>${esc(intel.encounter.name)}</strong>
                        </div>
                      `
                      : ""
                  )
            }
          </div>
        </details>
      </div>
    `;
  }

  function enhancedRecommendationCard(rec, allocation) {
    const system = battleSystemForRecommendation(rec);
    const isMax = system === "max";
    const allocated = Number(allocation?.allocated || 0);
    const allocationClass = allocated > 0 ? "has-allocation" : "no-allocation";

    return `
      <article class="recommendation-card compact-recommendation-card ${scoreTone(rec.score)} ${isMax ? "is-max-battle" : "is-raid-battle"}">
        <div class="recommendation-card-head">
          <div class="recommendation-pokemon">
            ${battleSpriteHtml(rec)}

            <div>
              <span class="section-eyebrow" title="${esc(rec.source_label ? `Source: ${rec.source_label}` : "")}">${esc(rec.event_title || (isMax ? "ACTIVE MAX BATTLE" : "ACTIVE RAID"))}</span>
              <h3>${esc(rec.emoji)} ${esc(rec.pokemon_name)}</h3>
              <div class="battle-identity-row">
                ${battleIdentityBadges(rec)}
              </div>
            </div>
          </div>

          <div class="score-ring">${formatNumber(rec.score)}</div>
        </div>

        <div class="recommendation-card-meta">
          <span class="status-badge ${scoreTone(rec.score)}">${esc(rec.label)}</span>

          ${
            isMax
              ? '<span class="battle-resource-badge">Remote: Pass + MP</span>'
              : `
                <span class="allocation-inline-badge ${allocationClass}">
                  ${allocated > 0
                    ? `${formatNumber(allocated)} Remote raid${allocated === 1 ? "" : "s"}`
                    : "0 Remote raids"}
                </span>
              `
          }

          ${
            rec.source_label && rec.source_kind === "official"
              ? `<span class="source-confidence-badge source-official">✓ ${esc(rec.source_label)}</span>`
              : ""
          }
        </div>

        ${isMax ? "" : raidRankingsHtml(rec.meta?.raid_rankings_json)}

        ${enhancedRaidIntelHtml(rec)}

        <div class="recommendation-footer-row">
          <details class="compact-details">
            <summary>Why?</summary>
            <ul>
              ${(rec.reasons || []).map(reason => `<li>${esc(reason)}</li>`).join("")}
            </ul>
          </details>

          ${
            isMax
              ? '<span class="battle-planning-only">Planning only</span>'
              : `
                <button
                  type="button"
                  class="log-raid-button"
                  data-log-raid="${esc(rec.pokemon_name)}"
                >
                  + Log raid
                </button>
              `
          }
        </div>
      </article>
    `;
  }

  function enhancedRenderRecommendations() {
    const container = document.getElementById("recommendations");
    if (!container) return;

    const allRecommendations = state?.recommendations || [];
    syncBattlePlanFilterUi(allRecommendations);

    const recommendations = allRecommendations.filter(rec => {
      if (battlePlanFilter === "all") return true;
      return battleSystemForRecommendation(rec) === battlePlanFilter;
    });

    const allocations = state?.remote_raid_plan?.allocations || [];
    const allocationByName = new Map(
      allocations.map(allocation => [
        normalizePickerName(allocation.pokemon_name),
        allocation
      ])
    );

    const badge = document.getElementById("allocationTotalBadge");
    if (badge) {
      const noun = battlePlanFilter === "raid"
        ? `raid${recommendations.length === 1 ? "" : "s"}`
        : battlePlanFilter === "max"
          ? `Max Battle${recommendations.length === 1 ? "" : "s"}`
          : `opportunit${recommendations.length === 1 ? "y" : "ies"}`;
      badge.textContent = `${formatNumber(recommendations.length)} ${noun}`;
    }

    if (!recommendations.length) {
      const label = battlePlanFilter === "max"
        ? "Max Battles"
        : battlePlanFilter === "raid"
          ? "Raids"
          : "battle opportunities";

      container.innerHTML = `
        <div class="empty-state battle-plan-empty-filter">
          <span aria-hidden="true">⌕</span>
          <strong>No active ${esc(label)} matched this view.</strong>
          <p>Try another battle filter or check the Calendar for upcoming availability.</p>
        </div>
      `;
      return;
    }

    const primary = recommendations.slice(0, 4);
    const additional = recommendations.slice(4);

    const renderCard = rec => enhancedRecommendationCard(
      rec,
      allocationByName.get(normalizePickerName(rec.pokemon_name))
    );

    container.innerHTML = `
      ${primary.map(renderCard).join("")}

      ${
        additional.length
          ? `
            <details class="more-recommendations">
              <summary>
                <span>
                  More battle opportunities
                  <strong>${formatNumber(additional.length)}</strong>
                </span>
                <span class="details-chevron" aria-hidden="true">⌄</span>
              </summary>

              <div class="recommendation-grid more-recommendation-grid">
                ${additional.map(renderCard).join("")}
              </div>
            </details>
          `
          : ""
      }
    `;
  }

  function refreshTopPickSprites() {
    const picks = state?.dashboard?.top_picks?.length
      ? state.dashboard.top_picks
      : state?.dashboard?.top_pick
        ? [state.dashboard.top_pick]
        : [];

    const wrap = document.querySelector("#todayTopPick .today-leader-sprites");
    if (!wrap || !picks.length) return;

    wrap.innerHTML = picks
      .slice(0, 3)
      .map(pick => battleSpriteHtml(pick, "pokemon-sprite today-leader-sprite"))
      .join("");

    if (!wrap.innerHTML.trim()) wrap.remove();
  }

  const baseRenderTodayBriefing = renderTodayBriefing;
  renderTodayBriefing = function battleAwareTodayBriefing() {
    baseRenderTodayBriefing();

    const topPick = document.getElementById("todayTopPick");
    if (topPick?.textContent.includes("No urgent paid raid target")) {
      topPick.innerHTML = topPick.innerHTML.replace(
        "No urgent paid raid target",
        "No urgent battle target"
      );
    }

    refreshTopPickSprites();
  };

  raidIntelHtml = enhancedRaidIntelHtml;
  renderRecommendationCard = enhancedRecommendationCard;
  renderRecommendations = enhancedRenderRecommendations;

  const baseRender = render;
  render = function battleAwareRender() {
    ensureBattlePlanFilters();
    baseRender();
    renameStaticBattleUi();
    ensureBattlePlanFilters();
  };

  injectBattlePlanStyles();
  renameStaticBattleUi();
  ensureBattlePlanFilters();
})();
