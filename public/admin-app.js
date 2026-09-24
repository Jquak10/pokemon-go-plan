function key() {
  return document.getElementById("key").value;
}

function esc(value) {
  return String(value ?? "").replace(
    /[&<>"']/g,
    character => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;"
    }[character])
  );
}

async function requestJson(path, options = {}) {
  const url =
    new URL(
      path,
      location.origin
    );

  // Keep old ?key= links/API calls compatible server-side, but never send the
  // admin credential in a browser URL or JSON body from the current UI.
  url.searchParams.delete(
    "key"
  );

  const headers =
    new Headers(
      options.headers || {}
    );

  headers.set(
    "x-admin-key",
    key()
  );

  let body =
    options.body;

  if (
    typeof body === "string" &&
    /application\/json/i.test(
      headers.get(
        "content-type"
      ) || ""
    )
  ) {
    try {
      const parsed =
        JSON.parse(
          body
        );

      if (
        parsed &&
        typeof parsed === "object" &&
        !Array.isArray(
          parsed
        )
      ) {
        delete parsed.key;
        body =
          JSON.stringify(
            parsed
          );
      }
    } catch {}
  }

  return JsonApiClient.fetchJson(
    `${url.pathname}${url.search}${url.hash}`,
    {
      ...options,
      headers,
      body,
      referrerPolicy:
        "no-referrer"
    },
    {
      serviceName:
        "Admin service"
    }
  );
}

function setStage(name, state, message) {
  const card =
    document.querySelector(
      `[data-stage="${name}"]`
    );

  if (!card) return;

  card.classList.remove(
    "running",
    "complete",
    "failed"
  );

  if (state) {
    card.classList.add(state);
  }

  card
    .querySelector("small")
    .textContent =
      message;
}

function showAdminSection(name) {
  const map = {
    official:
      document.getElementById("adminOfficial"),

    overrides:
      document.getElementById("adminOverrides"),

    limits:
      document.getElementById("adminLimits"),

    meta:
      document.getElementById("adminMeta")
  };

  for (const [keyName, section] of Object.entries(map)) {
    section.classList.toggle(
      "hidden",
      keyName !== name
    );
  }

  document
    .querySelectorAll("[data-admin-section]")
    .forEach(button => {
      const active =
        button.dataset.adminSection === name;

      button.classList.toggle(
        "active",
        active
      );
      button.setAttribute(
        "aria-pressed",
        active
          ? "true"
          : "false"
      );
    });
}

document
  .querySelectorAll("[data-admin-section]")
  .forEach(button => {
    button.addEventListener(
      "click",
      () => showAdminSection(
        button.dataset.adminSection
      )
    );
  });

document
  .getElementById("key")
  .addEventListener(
    "input",
    () => {
      const badge =
        document.getElementById("adminAuthBadge");

      if (key()) {
        badge.textContent =
          "Key entered";

        badge.className =
          "status-badge badge-green";
      } else {
        badge.textContent =
          "Key required";

        badge.className =
          "status-badge badge-neutral";
      }
    }
  );

document
  .getElementById("sync")
  .addEventListener(
    "click",
    async () => {
      const out =
        document.getElementById("syncResult");

      const results = {};

      const runPhase =
        async (
          stage,
          name,
          path,
          message
        ) => {
          setStage(
            stage,
            "running",
            message
          );

          const data =
            await requestJson(
              path,
              {
                method: "POST",
                headers: {
                  "content-type":
                    "application/json"
                },
                body:
                  JSON.stringify({})
              }
            );

          results[name] = data;

          setStage(
            stage,
            "complete",
            "Complete ✓"
          );

          out.textContent =
            JSON.stringify(
              results,
              null,
              2
            );
        };

      try {
        await runPhase(
          "events",
          "events",
          "/api/admin/sync/events",
          "Syncing feeds…"
        );

        await runPhase(
          "official",
          "official",
          "/api/admin/sync/remote-limits",
          "Reading official pages…"
        );

        await runPhase(
          "meta",
          "automatic_meta",
          "/api/admin/sync/meta",
          "Updating assessments & rankings…"
        );

        await Promise.all([
          loadOfficialRaids(),
          loadSuppressions(),
          loadRemoteLimits(),
          loadMeta()
        ]);
      } catch (error) {
        out.textContent +=
          `\n\nError:\n${error.message}`;

        document
          .querySelectorAll(
            ".sync-stage.running"
          )
          .forEach(card => {
            card.classList.remove("running");
            card.classList.add("failed");
            card.querySelector("small").textContent =
              "Failed";
          });
      }
    }
  );

async function loadOfficialRaids() {
  const entries =
    document.getElementById("officialRaids");

  entries.textContent =
    "Loading…";

  try {
    const data =
      await requestJson(
        "/api/admin/official-raids"
      );

    entries.innerHTML =
      data.events.length
        ? data.events.map(event => `
            <article class="admin-data-card">
              <div class="admin-data-card-head">
                <div>
                  <span class="section-eyebrow">${event.source_type === "event" ? "OFFICIAL EVENT" : "OFFICIAL RAID"}</span>
                  <strong>${esc(event.summary)}</strong>
                </div>
                <span class="status-badge ${event.status === "active" ? "badge-green" : "badge-neutral"}">
                  ${esc(event.status)}
                </span>
              </div>

              <p>
                ${esc(event.start_date)}
                ${event.end_date !== event.start_date ? ` → ${esc(event.end_date)}` : ""}
              </p>

              <div class="assessment-notes">
                ${esc(event.description || "")}
              </div>

              ${event.source_url
                ? `<a class="admin-source-link" href="${esc(event.source_url)}" target="_blank" rel="noopener">Official source ↗</a>`
                : ""
              }
            </article>
          `).join("")
        : `
          <div class="empty-state">
            <span>⌕</span>
            <strong>No official supplemental raid entries stored yet.</strong>
            <p>Run the official schedule sync.</p>
          </div>
        `;
  } catch (error) {
    entries.textContent =
      error.message;
  }
}


async function loadSuppressions() {
  const entries =
    document.getElementById("suppressionRules");

  entries.textContent =
    "Loading…";

  try {
    const data =
      await requestJson(
        "/api/admin/suppressions"
      );

    entries.innerHTML =
      data.rules.length
        ? data.rules.map(rule => `
            <article class="admin-data-card">
              <div class="admin-data-card-head">
                <div>
                  <span class="section-eyebrow">OFFICIAL OVERRIDE</span>
                  <strong>${esc(rule.event_name)}</strong>
                </div>

                <span class="status-badge ${Number(rule.active) ? "badge-green" : "badge-neutral"}">
                  ${Number(rule.active) ? "ACTIVE" : "INACTIVE"}
                </span>
              </div>

              <p>
                ${esc(rule.start_date)}
                →
                ${esc(rule.end_date)}
              </p>

              <div class="admin-score-strip">
                ${rule.suppressed_source_types
                  .map(source => `
                    <span>
                      Hide
                      <strong>${esc(source)}</strong>
                    </span>
                  `)
                  .join("")
                }
              </div>

              <div class="assessment-notes">
                ${esc(rule.note || "")}
              </div>

              ${rule.source_url
                ? `<a class="admin-source-link" href="${esc(rule.source_url)}" target="_blank" rel="noopener">Official source ↗</a>`
                : ""
              }
            </article>
          `).join("")
        : `
          <div class="empty-state">
            <span>⌫</span>
            <strong>No official suppression rules stored yet.</strong>
            <p>Run the Official schedules sync.</p>
          </div>
        `;
  } catch (error) {
    entries.textContent =
      error.message;
  }
}


async function loadRemoteLimits() {
  const entries =
    document.getElementById("remoteLimits");

  entries.textContent =
    "Loading…";

  try {
    const data =
      await requestJson(
        "/api/admin/remote-limits"
      );

    entries.innerHTML =
      data.rules.length
        ? data.rules.map(rule => `
            <article class="admin-data-card">
              <div class="admin-data-card-head">
                <div>
                  <span class="section-eyebrow">REMOTE RAID RULE</span>
                  <strong>${esc(rule.event_name)}</strong>
                </div>

                <span class="status-badge badge-blue">
                  ${Number(rule.is_unlimited)
                    ? "Unlimited"
                    : esc(rule.remote_raid_limit)
                  }
                </span>
              </div>

              <p>
                ${esc(rule.start_date)}
                →
                ${esc(rule.end_date)}
              </p>

              <div class="field-help">
                ${Number(rule.detected_automatically)
                  ? "Automatically detected"
                  : "Seeded/manual rule"
                }
              </div>

              ${rule.source_url
                ? `<a class="admin-source-link" href="${esc(rule.source_url)}" target="_blank" rel="noopener">Official source ↗</a>`
                : ""
              }
            </article>
          `).join("")
        : `
          <div class="empty-state">
            <span>⚡</span>
            <strong>No temporary rules stored.</strong>
          </div>
        `;
  } catch (error) {
    entries.textContent =
      error.message;
  }
}

async function loadMeta() {
  const entries =
    document.getElementById("entries");

  entries.textContent =
    "Loading…";

  try {
    const data =
      await requestJson(
        "/api/admin/meta"
      );

    entries.innerHTML =
      data.metas.length
        ? data.metas.map(meta => `
            <article class="admin-data-card">
              <div class="admin-data-card-head">
                <div>
                  <span class="section-eyebrow">AUTOMATIC ASSESSMENT</span>
                  <strong>${esc(meta.pokemon_name)}</strong>
                </div>

                <span class="score-pill">
                  ${Number(meta.overall_score ?? 0).toFixed(0)}
                </span>
              </div>

              <div class="admin-score-strip">
                <span>PvE <strong>${meta.pve_score == null ? "—" : Number(meta.pve_score).toFixed(0)}</strong></span>
                <span>PvP <strong>${meta.pvp_score == null ? "—" : Number(meta.pvp_score).toFixed(0)}</strong></span>
                <span>Rarity <strong>${meta.rarity_score == null ? "—" : Number(meta.rarity_score).toFixed(0)}</strong></span>
                <span>Mega <strong>${meta.mega_score == null ? "—" : Number(meta.mega_score).toFixed(0)}</strong></span>
              </div>

              <p><strong>${esc(meta.verdict || "")}</strong></p>

              <details class="compact-details">
                <summary>Method details</summary>
                <div class="assessment-notes mono">${esc(meta.notes || "")}</div>
              </details>
            </article>
          `).join("")
        : `
          <div class="empty-state">
            <span>★</span>
            <strong>No automatic assessments yet.</strong>
          </div>
        `;
  } catch (error) {
    entries.textContent =
      error.message;
  }
}

document
  .getElementById("loadOfficialRaids")
  .addEventListener(
    "click",
    loadOfficialRaids
  );

document
  .getElementById("loadSuppressions")
  .addEventListener(
    "click",
    loadSuppressions
  );

document
  .getElementById("loadRemoteLimits")
  .addEventListener(
    "click",
    loadRemoteLimits
  );

document
  .getElementById("loadMeta")
  .addEventListener(
    "click",
    loadMeta
  );

showAdminSection("official");
