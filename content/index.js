const LABELS = {
  rock: "Sword",
  paper: "Shield",
  scissor: "Spell"
};
const ORDER = ["rock", "paper", "scissor"];
let lastPrediction = null;
let enabled = true;
let inCombat = false;
let panel = null;
let fishPanel = null;
let lastFishView = null;
let fishDebug = false;

function purgeExtraOverlays(keep = null) {
  document.querySelectorAll('#gdc-pred-overlay, [data-gdc="prediction-overlay"]').forEach((node) => {
    if (node !== keep) node.remove();
  });
}

function mountPanel(el) {
  const parent = document.body || document.documentElement;
  if (el.parentNode !== parent) parent.appendChild(el);
}

function ensurePanel() {
  const existing = document.getElementById("gdc-pred-overlay")
    || document.querySelector('[data-gdc="prediction-overlay"]');
  if (existing) {
    purgeExtraOverlays(existing);
    panel = existing;
    mountPanel(panel);
    return panel;
  }
  if (panel && (document.body?.contains(panel) || document.documentElement.contains(panel))) {
    purgeExtraOverlays(panel);
    mountPanel(panel);
    return panel;
  }
  panel = document.createElement("div");
  panel.id = "gdc-pred-overlay";
  panel.setAttribute("data-gdc", "prediction-overlay");
  Object.assign(panel.style, {
    position: "fixed",
    right: "12px",
    bottom: "96px",
    zIndex: "2147483646",
    minWidth: "180px",
    maxWidth: "260px",
    padding: "10px 12px",
    borderRadius: "10px",
    background: "rgba(12, 16, 22, 0.88)",
    color: "#f4f1ea",
    fontFamily: "Segoe UI, Trebuchet MS, sans-serif",
    fontSize: "12px",
    lineHeight: "1.35",
    boxShadow: "0 8px 24px rgba(0,0,0,0.35)",
    pointerEvents: "none",
    border: "1px solid rgba(255,255,255,0.12)",
    whiteSpace: "pre-wrap"
  });
  mountPanel(panel);
  return panel;
}

function escapeHtml(text) {
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function render() {
  if (!enabled || !inCombat) {
    if (panel) panel.style.display = "none";
    hideFishingOverlay();
    return;
  }
  hideFishingOverlay();
  const el = ensurePanel();
  el.style.display = "block";
  if (!lastPrediction) {
    el.innerHTML = `<div style="opacity:.75">GDC Predictor</div><div>learning…</div>`;
    return;
  }
  const p = lastPrediction;
  const unavailable = p.unavailable ?? [];
  const rows = ORDER.map((m) => {
    const pct = p.percents[m];
    const ruled = p.ruledOutMove === m || unavailable.includes(m);
    const mark = ruled ? p.ruledOutMove === m ? " · ruled out" : " · 0 charges" : "";
    const weight = p.topMove === m ? "font-weight:700;color:#9fe6b8" : "font-weight:500";
    return `<div style="${weight}">${LABELS[m]}  ${pct}%${mark}</div>`;
  }).join("");
  // Play must be EV recommendedMove — never topMove of the enemy.
  const playMove = p.recommendedMove ?? null;
  const play = playMove ? LABELS[playMove] : "—";
  const enemy = p.enemyCid != null ? `#${p.enemyCid}` : "—";
  const whyLines = buildCombatWhyLines(p);
  const whyHtml = whyLines
    .map((line) => {
      const warn = line.includes("⚠") || /you die|умираешь|Not /i.test(line);
      return `<div style="margin-top:3px;opacity:.85;${warn ? "color:#f0c36d;font-weight:600" : ""}">${escapeHtml(line)}</div>`;
    })
    .join("");
  el.innerHTML = `
    <div style="opacity:.8;margin-bottom:4px">Enemy ${enemy} · N=${p.n} · ${p.confidence}</div>
    ${rows}
    <div style="margin-top:8px;font-size:14px;font-weight:700;color:#9fe6b8">Play: ${play}</div>
    ${whyHtml}
  `;
}

function buildCombatWhyLines(p) {
  const lines = [];
  const top = p.topMove;
  const counter = p.counterMove;
  const rec = p.recommendedMove;
  const topPct = top != null ? p.percents?.[top] : null;

  if (top && counter && rec && rec === counter && topPct != null) {
    lines.push(`${LABELS[rec]}, because it beats their ${LABELS[top]} (${topPct}%)`);
  } else if (top && counter && rec && rec !== counter && topPct != null) {
    lines.push(`Their likely ${LABELS[top]} (${topPct}%) → counter would be ${LABELS[counter]}`);
  }

  if (p.hpKnown && (p.pDeath != null || p.expectedHpAfter != null)) {
    const deathPct = Math.round((p.pDeath ?? 0) * 100);
    const hp = p.expectedHpAfter == null ? "?" : Math.round(p.expectedHpAfter);
    const sh = p.expectedShieldAfter == null ? "?" : Math.round(p.expectedShieldAfter);
    lines.push(`Death ${deathPct}% · HP ~${hp} · Shield ~${sh}`);
  }
  if (p.locked && p.topMove) lines.push(`Enemy must play ${LABELS[p.topMove]}`);
  for (const note of p.vetoNotes ?? []) {
    lines.push(uiMoveNames(note));
  }
  if (p.burnOnShieldWin) lines.push("⚠ Shield win burns you");
  if (p.saferAlt?.move) {
    lines.push(`Safer: ${LABELS[p.saferAlt.move]} (death ${Math.round((p.saferAlt.pDeath ?? 0) * 100)}%)`);
  }

  const fromWhy = (p.why || p.strategyHint || "")
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line && !/^Play:/i.test(line) && !/^ev-max/i.test(line) && !/EV[-\s]max/i.test(line) && !/^EV\s/i.test(line))
    .map(uiMoveNames);

  for (const line of fromWhy) {
    if (!lines.some((existing) => existing.toLowerCase() === line.toLowerCase())) {
      // Prefer explicit counter/death lines already added; keep unique extras (lock, only legal, etc.)
      if (/because it beats|counter would be|Death \d|Enemy must|burns you|Safer:|you die|Not /i.test(line) &&
          lines.some((e) => e.includes(line.slice(0, 12)))) {
        continue;
      }
      lines.push(line);
    }
  }

  // Cap to 3 user-facing lines (prompt: 1–3)
  return lines.slice(0, 3);
}

function uiMoveNames(text) {
  return String(text)
    .replace(/\brock\b/gi, "Sword")
    .replace(/\bpaper\b/gi, "Shield")
    .replace(/\bscissor\b/gi, "Spell");
}

function hideFishingOverlay() {
  const el = document.getElementById("gfp-fish-overlay");
  if (el) el.style.display = "none";
  if (fishPanel) fishPanel.style.display = "none";
  lastFishView = null;
}

function updatePredictionOverlay(prediction, predictionEnabled, combatActive = false) {
  enabled = predictionEnabled;
  inCombat = combatActive;
  lastPrediction = combatActive ? prediction : null;
  render();
}

function detectMoveFromBlob(blob) {
  if (blob.includes("sword") || blob.includes("rock")) return "rock";
  if (blob.includes("shield") || blob.includes("paper")) return "paper";
  if (blob.includes("spell") || blob.includes("magic") || blob.includes("scissor")) {
    return "scissor";
  }
  return null;
}

function hasDepletedChargeSlot(el) {
  const html = el.innerHTML.toLowerCase();
  const cls = `${el.className}`.toLowerCase();
  if (cls.includes("depleted") || cls.includes("no-charge") || cls.includes("empty-charge")) {
    return true;
  }
  if (html.includes("charge") && (html.includes("#f") || html.includes("rgb(255") || html.includes("red"))) ;
  const redish = el.querySelectorAll('[style*="red"], [style*="#f"], [class*="red"], [class*="empty"], [class*="deplete"]');
  if (redish.length > 0 && (cls.includes("charge") || html.includes("charge") || el.querySelectorAll("[class*='charge'], [class*='slot']").length > 0)) {
    return true;
  }
  if (el.getAttribute("aria-disabled") === "true" || cls.includes("disabled")) {
    return true;
  }
  return false;
}

function startChargeDomWatcher(onUnavailable) {
  let lastKey = "";
  const scan = () => {
    if (!inCombat) return;
    const found = /* @__PURE__ */ new Set();
    const candidates = Array.from(
      document.querySelectorAll(
        '[class*="move"],[class*="action"],[class*="ability"],[class*="charge"],[class*="skill"],button,div'
      )
    ).slice(0, 400);
    for (const node of candidates) {
      const blob = `${node.className} ${node.getAttribute("aria-label") ?? ""} ${node.title ?? ""} ${node.textContent ?? ""}`.toLowerCase();
      const move = detectMoveFromBlob(blob);
      if (!move) continue;
      if (!hasDepletedChargeSlot(node) && !blob.includes("0/") && !blob.includes("charges: 0")) {
        const childHit = Array.from(node.querySelectorAll("*")).slice(0, 40).some((c) => hasDepletedChargeSlot(c));
        if (!childHit) continue;
      }
      found.add(move);
    }
    for (const node of candidates) {
      const text = (node.textContent ?? "").replace(/\s+/g, " ").trim().toLowerCase();
      if (!text) continue;
      if (/(sword|rock).{0,12}0(?:\s|\/|$)/.test(text) || /0.{0,6}(sword|rock)/.test(text)) {
        found.add("rock");
      }
      if (/(shield|paper).{0,12}0(?:\s|\/|$)/.test(text) || /0.{0,6}(shield|paper)/.test(text)) {
        found.add("paper");
      }
      if (/(spell|magic|scissor).{0,12}0(?:\s|\/|$)/.test(text) || /0.{0,6}(spell|magic|scissor)/.test(text)) {
        found.add("scissor");
      }
    }
    const moves = ORDER.filter((m) => found.has(m));
    // All-three depleted is a greedy false positive — ignore the scan.
    if (moves.length === 3) return;
    const key = moves.join(",");
    if (key !== lastKey) {
      lastKey = key;
      onUnavailable(moves);
    }
  };
  const obs = new MutationObserver(() => scan());
  obs.observe(document.documentElement, { childList: true, subtree: true, attributes: true });
  window.setInterval(scan, 1500);
}

function startIntuitionDomWatcher(onRuledOut) {
  let lastSent = null;
  const scan = () => {
    if (!inCombat) return;
    const nodes = Array.from(
      document.querySelectorAll(
        '[class*="ruled"],[class*="intuition"],[class*="forbidden"],[data-ruled],[aria-disabled="true"]'
      )
    );
    for (const node of nodes) {
      const text = `${node.className} ${node.getAttribute("aria-label") ?? ""} ${node.title ?? ""}`.toLowerCase();
      const looksRuled = text.includes("ruled") || text.includes("intuition") || text.includes("forbidden") || text.includes("predict");
      if (!looksRuled) continue;
      const blob = `${text} ${node.textContent ?? ""}`.toLowerCase();
      const move = detectMoveFromBlob(blob);
      if (move && move !== lastSent) {
        lastSent = move;
        onRuledOut(move);
      }
    }
  };
  const obs = new MutationObserver(() => scan());
  obs.observe(document.documentElement, { childList: true, subtree: true, attributes: true });
  window.setInterval(scan, 2e3);
}

const PAGE_MESSAGE_SOURCE = "GDC";
const PAGE_MESSAGE_TYPE = "DUNGEON_CAPTURE";
function isPageMessage(data) {
  if (!data || typeof data !== "object") return false;
  const msg = data;
  return msg.source === PAGE_MESSAGE_SOURCE && msg.type === PAGE_MESSAGE_TYPE;
}
function isStateUrl(url) {
  return url.includes("/api/game/dungeon/state");
}
async function isDebugEnabled() {
  try {
    const result = await chrome.storage.local.get("gdcDebug");
    return Boolean(result.gdcDebug);
  } catch {
    return false;
  }
}

purgeExtraOverlays();

window.addEventListener("message", (event) => {
  if (event.source !== window) return;
  if (!isPageMessage(event.data)) return;
  const payload = event.data.payload;
  const type = isStateUrl(payload.url) ? "STATE_CAPTURED" : "ACTION_CAPTURED";
  void (async () => {
    const debug = await isDebugEnabled();
    if (debug) console.log("[GDC] action detected");
    try {
      const result = await chrome.runtime.sendMessage({ type, payload });
      if (debug && result) {
        if (result.enemyCid != null) console.log("[GDC] enemyCid:", result.enemyCid);
        if (result.playerMove != null) console.log("[GDC] playerMove:", result.playerMove);
        if (result.enemyMove != null) console.log("[GDC] enemyMove:", result.enemyMove);
        if (result.actionToken != null) console.log("[GDC] actionToken:", result.actionToken);
        if (result.inCombat != null) console.log("[GDC] inCombat:", result.inCombat);
        if (result.saved) console.log("[GDC] saved");
        else if (result.duplicate) console.log("[GDC] skipped duplicate");
        else if (result.diagnostic) console.log("[GDC] diagnostic:", result.diagnostic);
        if (result.prediction) console.log("[GDC][PRED] updated");
      }
      if (result == null ? void 0 : result.ok) {
        updatePredictionOverlay(
          result.prediction ?? null,
          true,
          Boolean(result.inCombat)
        );
        if (result.inCombat) {
          updateFishingOverlay(null, false, Boolean(debug));
        } else if (result.fishing) {
          updateFishingOverlay(
            result.fishing.view ?? null,
            Boolean(result.fishing.inFishing),
            Boolean(debug),
          );
        }
      }
    } catch {
    }
  })();
});
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if ((message == null ? void 0 : message.type) === "PING_CONTENT") {
    sendResponse({ ok: true, type: "CONTENT_PONG", active: true });
    return true;
  }
  if ((message == null ? void 0 : message.type) === "PREDICTION_UPDATE") {
    updatePredictionOverlay(
      message.prediction ?? null,
      Boolean(message.enabled),
      Boolean(message.inCombat)
    );
    sendResponse({ ok: true });
    return true;
  }
  if ((message == null ? void 0 : message.type) === "FISHING_UPDATE") {
    if (inCombat) {
      updateFishingOverlay(null, false, false);
      sendResponse({ ok: true, hidden: "in_combat" });
      return true;
    }
    updateFishingOverlay(message.view ?? null, Boolean(message.inFishing), Boolean(message.debug));
    sendResponse({ ok: true });
    return true;
  }
  return false;
});
startIntuitionDomWatcher((ruledOutMove) => {
  void chrome.runtime.sendMessage({ type: "INTUITION_UI", ruledOutMove });
  console.log("[GDC][PRED] intuition ruled out:", ruledOutMove);
});
startChargeDomWatcher((moves) => {
  void chrome.runtime.sendMessage({ type: "UNAVAILABLE_MOVES_UI", moves });
  if (moves.length) console.log("[GDC][PRED] ui 0-charges:", moves.join(","));
});
function startHubWatcher() {
  let lastHub = false;
  const scan = () => {
    var _a;
    const text = (((_a = document.body) == null ? void 0 : _a.innerText) ?? "").toLowerCase();
    const hub = text.includes("choose your offering") || text.includes("press e to interact");
    if (hub && !lastHub) {
      lastHub = true;
      void chrome.runtime.sendMessage({ type: "HUB_UI", inCombat: false });
      updatePredictionOverlay(null, true, false);
      updateFishingOverlay(null, false, false);
      console.log("[GDC][PRED] hub detected — hide overlay");
    } else if (!hub) {
      lastHub = false;
    }
  };
  window.setInterval(scan, 2e3);
  scan();
}
startHubWatcher();
void chrome.runtime.sendMessage({ type: "GET_PREDICTION_META" }).then((res) => {
  if (res == null ? void 0 : res.ok) {
    updatePredictionOverlay(
      res.lastPrediction ?? null,
      Boolean(res.predictionEnabled),
      Boolean(res.inCombat)
    );
  }
}).catch(() => void 0);

function ensureFishPanel() {
  const existing = document.getElementById("gfp-fish-overlay");
  if (existing) {
    fishPanel = existing;
    return fishPanel;
  }
  fishPanel = document.createElement("div");
  fishPanel.id = "gfp-fish-overlay";
  Object.assign(fishPanel.style, {
    position: "fixed",
    right: "12px",
    bottom: "12px",
    zIndex: "2147483645",
    minWidth: "196px",
    maxWidth: "240px",
    padding: "10px 12px",
    borderRadius: "10px",
    background: "rgba(10, 22, 28, 0.9)",
    color: "#eaf6f2",
    fontFamily: "Segoe UI, Trebuchet MS, sans-serif",
    fontSize: "12px",
    lineHeight: "1.35",
    boxShadow: "0 8px 24px rgba(0,0,0,0.35)",
    pointerEvents: "none",
    border: "1px solid rgba(120, 220, 190, 0.22)",
    whiteSpace: "pre-wrap",
    display: "none",
  });
  (document.body || document.documentElement).appendChild(fishPanel);
  return fishPanel;
}

function fishCellStyle(n, current, possible, bobber) {
  if (n === current) return "background:#1d6b4f;color:#fff;font-weight:700";
  if (n === bobber) return "background:#6b3a5a;color:#fff;font-weight:700";
  if (possible.includes(n)) return "background:#3a5a2a;color:#d7f5c8;font-weight:600";
  return "background:#1a2428;color:#8aa";
}

function renderFishGrid(current, possible, bobber) {
  const cells = Array.from({ length: 16 }, (_, i) => i + 1).map((n) => {
    let label = String(n);
    if (n === current) label = "🐟";
    else if (n === bobber) label = "●";
    return `<div style="width:22px;height:22px;display:flex;align-items:center;justify-content:center;border-radius:3px;font-size:10px;${fishCellStyle(n, current, possible, bobber)}">${label}</div>`;
  }).join("");
  return `<div style="display:grid;grid-template-columns:repeat(4,22px);gap:3px;margin-top:6px">${cells}</div>`;
}

function updateFishingOverlay(view, inFishing, debug) {
  fishDebug = Boolean(debug);
  const el = ensureFishPanel();
  const active =
    Boolean(inFishing) &&
    Boolean(view) &&
    !inCombat &&
    Boolean(view.inFishing !== false) &&
    (view.currentCell != null ||
      view.bobberCell != null ||
      (Array.isArray(view.hand) && view.hand.length > 0 && view.mana != null));
  if (!active || /waiting for fishing/i.test(view?.status ?? "")) {
    lastFishView = null;
    el.style.display = "none";
    return;
  }
  lastFishView = view;
  el.style.display = "block";
  const hist = (view.history ?? []).join(" → ") || "—";
  const possible = view.possibleCells ?? [];
  const posList = possible.length ? possible.join(" / ") : "—";
  const fishLine =
    view.currentCell != null && view.currentPos
      ? `Fish: cell ${view.currentCell} (${view.currentPos.x},${view.currentPos.y})`
      : "Fish: unknown";
  const modeLine = `Mode: ${view.label || view.mode || "—"}`;
  const nextLine = `Next cells: ${posList}`;
  const playLine = escapeHtml(view.recommendation ?? "Waiting for hand...");
  const whyLine = view.why ? `<div style="margin-top:4px;opacity:.85">${escapeHtml(view.why)}</div>` : "";
  const focusNote = view.focusAssumption
    ? `<div style="margin-top:3px;opacity:.7;font-size:11px">Focus not in API — move unconstrained (assumption)</div>`
    : view.focus != null
      ? `<div style="margin-top:3px;opacity:.7;font-size:11px">Focus ${view.focus}${view.focusMax != null ? "/" + view.focusMax : ""}</div>`
      : "";
  const ascii = view.patternAscii
    ? `<pre style="margin:4px 0 0;opacity:.65;font-size:10px;line-height:1.2">${escapeHtml(view.patternAscii)}</pre>`
    : "";
  el.innerHTML = `
    <div style="opacity:.8;margin-bottom:4px">Fishing Advisor</div>
    <div>${escapeHtml(fishLine)}</div>
    <div>${escapeHtml(modeLine)}</div>
    <div>${escapeHtml(nextLine)}</div>
    <div style="margin-top:6px;font-weight:700;color:#9fe6b8">${playLine}</div>
    ${whyLine}
    ${focusNote}
    ${ascii}
    ${renderFishGrid(view.currentCell, possible, view.bobberCell ?? view.advice?.bobberCell)}
  `;
  if (fishDebug) console.log("[GFP] overlay", view.mode, view.currentCell, possible);
}

function startFishingHandWatcher() {
  let lastKey = "";
  const scan = () => {
    if (inCombat) return;
    const text = (document.body?.innerText ?? "").toLowerCase();
    // Require fishing-specific UI, not incidental "catch"/"mana" in combat chrome.
    const fishingUi =
      (text.includes("fishing") || text.includes("catch meter") || text.includes("fintuition")) &&
      (text.includes("mana") || text.includes("hand") || text.includes("redraw"));
    if (!fishingUi) return;
    const cards = parseHandFromDom();
    if (!cards.length) return;
    const key = JSON.stringify(cards.map((c) => [c.name, c.mana, c.hits, c.crits]));
    if (key === lastKey) return;
    lastKey = key;
    void chrome.runtime.sendMessage({ type: "FISHING_HAND_UI", cards });
    if (fishDebug) console.log("[GFP] hand from UI", cards.map((c) => c.name).join(", "));
  };
  window.setInterval(scan, 2000);
}

function parseHandFromDom() {
  const cards = [];
  const roots = Array.from(document.querySelectorAll('[class*="card"],[class*="spell"],[class*="hand"]')).slice(0, 40);
  for (const root of roots) {
    const kids = Array.from(root.querySelectorAll('[class*="cell"],[class*="tile"],[class*="grid"] > *')).slice(0, 20);
    let tiles = kids;
    if (tiles.length !== 9) {
      const grid = root.querySelector('[class*="grid"],[class*="board"],[class*="pattern"]');
      if (grid) tiles = Array.from(grid.children).slice(0, 9);
    }
    if (tiles.length !== 9) continue;
    const hits = [];
    const crits = [];
    const misses = [];
    tiles.forEach((el, i) => {
      const blob = `${el.className} ${el.getAttribute("aria-label") ?? ""} ${el.title ?? ""} ${(el.getAttribute("style") ?? "")}`.toLowerCase();
      const cell = i + 1;
      if (/crit|yellow|gold|#ff/.test(blob)) crits.push(cell);
      else if (/hit|blue|#0|#3|#4|success/.test(blob)) hits.push(cell);
      else if (/miss|red|grey|gray|fail/.test(blob)) misses.push(cell);
    });
    if (hits.length + crits.length === 0) continue;
    const label = (root.getAttribute("aria-label") || root.querySelector("h1,h2,h3,[class*='name']")?.textContent || `Card ${cards.length + 1}`).trim().slice(0, 32);
    const manaMatch = `${root.textContent ?? ""}`.match(/(\d+)\s*mana/i);
    cards.push({
      index: cards.length,
      id: `ui-${cards.length}`,
      name: label || `Card ${cards.length + 1}`,
      mana: manaMatch ? Number(manaMatch[1]) : 0,
      hits,
      crits,
      misses,
      hitValue: 1,
      critValue: 2,
      missValue: 1,
    });
  }
  return cards.slice(0, 6);
}


startFishingHandWatcher();
