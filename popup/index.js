import { a as MOVE_UI_LABELS } from "../assets/constants.js";
import {
  extractMovesFromParsed,
  isLiveFightsQaPayload,
  looksLikeCommunityText,
  mergeMovesById,
} from "../assets/import-parse.js";
function $(id) {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Missing element #${id}`);
  return el;
}
function maybe$(id) {
  return document.getElementById(id);
}
function bindClick(id, handler) {
  const el = maybe$(id);
  if (el) el.addEventListener("click", handler);
}
function showMessage(text) {
  const el = $("message");
  el.hidden = false;
  el.textContent = text;
  window.setTimeout(() => {
    el.hidden = true;
  }, 2500);
}
function downloadText(filename, content, mime) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
async function sendMessage(message) {
  try {
    return await chrome.runtime.sendMessage(message);
  } catch {
    return null;
  }
}
async function pingContentScript() {
  var _a;
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!(tab == null ? void 0 : tab.id) || !((_a = tab.url) == null ? void 0 : _a.includes("gigaverse.io"))) {
      return { onPlay: false, playOpenElsewhere: await hasPlayTab() };
    }
    const response = await chrome.tabs.sendMessage(tab.id, { type: "PING_CONTENT" });
    return {
      onPlay: Boolean((response == null ? void 0 : response.ok) && (response == null ? void 0 : response.active)),
      playOpenElsewhere: false
    };
  } catch {
    return { onPlay: false, playOpenElsewhere: await hasPlayTab() };
  }
}

async function hasPlayTab() {
  try {
    const tabs = await chrome.tabs.query({
      url: ["https://gigaverse.io/play*", "https://*.gigaverse.io/*", "https://builds.gigaverse.io/*"]
    });
    return tabs.some((t) => /gigaverse\.io\/play/i.test(t.url ?? ""));
  } catch {
    return false;
  }
}
function renderTransitions(stats) {
  const t = stats.transitions;
  const line = (label, block) => `After ${label}: Rock ${block.rockPercent}% / Paper ${block.paperPercent}% / Scissor ${block.scissorPercent}%`;
  return [
    `Enemy #${stats.enemyCid} — ${stats.totalMoves} moves`,
    `Enemy moves: Rock ${stats.rockPercent}% · Paper ${stats.paperPercent}% · Scissor ${stats.scissorPercent}%`,
    line("Rock", t.afterRock),
    line("Paper", t.afterPaper),
    line("Scissor", t.afterScissor)
  ].join("\n");
}

function formatEv(ev) {
  if (ev == null || !Number.isFinite(ev)) return "—";
  const sign = ev >= 0 ? "+" : "";
  return `${sign}${ev.toFixed(2)}`;
}

function renderFishGrid(current, possible, bobber = null, board = 4) {
  const el = maybe$("fish-grid");
  if (!el) return;
  el.innerHTML = "";
  const size = board === 3 ? 3 : 4;
  el.style.gridTemplateColumns = `repeat(${size}, 28px)`;
  const next = new Set(possible ?? []);
  for (let n = 1; n <= size * size; n += 1) {
    const cell = document.createElement("div");
    cell.className = "fish-cell";
    if (n === current) cell.classList.add("current");
    else if (board !== 3 && n === bobber) cell.classList.add("bobber");
    else if (next.has(n)) cell.classList.add("next");
    cell.textContent = n === current ? "🐟" : board !== 3 && n === bobber ? "●" : String(n);
    el.appendChild(cell);
  }
}

async function refreshFishing() {
  try {
    const res = await sendMessage({ type: "GET_FISHING" });
    const status = $("fish-status");
    const summary = $("fish-summary");
    const diag = maybe$("fish-diag");
    const statsEl = maybe$("fish-stats");
    if (!res?.ok) {
      status.className = "muted";
      status.textContent = "Idle";
      summary.textContent = "";
      if (diag) diag.textContent = "";
      return;
    }
    const active = Boolean(res.inFishing) && Boolean(res.view);
    const v = res.view ?? {};
    status.className = active ? "status on" : "muted";
    status.textContent = active ? (v.status ?? "Fishing") : "Idle";

    const d = res.lastDiagnostic;
    const path = typeof d?.urlPath === "string" ? d.urlPath : "";
    const act = typeof d?.requestAction === "string" ? d.requestAction : "";
    const reason = typeof d?.reason === "string" ? d.reason : "";
    const keys = Array.isArray(d?.keys) ? d.keys.slice(0, 12).join(",") : "";
    const diagLine = [path, act, reason, keys ? `keys ${keys}` : ""].filter(Boolean).join(" · ");
    if (diag) {
      diag.textContent = diagLine
        ? `Last capture: ${diagLine}`
        : "No fishing API capture yet";
    }

    if (!active) {
      summary.className = "muted";
      summary.textContent = "";
      renderFishGrid(null, [], null, 4);
    } else {
      const possible = (v.possibleCells ?? []).join(" / ") || "—";
      summary.className = "";
      summary.textContent = [
        v.currentCell != null && v.currentPos
          ? `Fish: cell ${v.currentCell} (${v.currentPos.x},${v.currentPos.y})`
          : "Fish: unknown",
        `Next: ${possible}`,
        v.recommendation ? String(v.recommendation) : "Play: waiting for hand",
        v.why ? `Why: ${v.why}` : "",
        v.mana != null ? `Mana: ${v.mana}${v.manaMax != null ? "/" + v.manaMax : ""}` : "",
      ].filter(Boolean).join("\n");
      renderFishGrid(v.currentCell ?? null, v.possibleCells ?? [], v.bobberCell ?? null, v.board === 3 ? 3 : 4);
    }
    if (statsEl) {
      const st = res.stats ?? {};
      statsEl.textContent = `Sessions: ${st.totalSessions ?? 0}
1-cell: ${st.modeOne ?? 0} (${st.modeOnePct ?? 0}%)
2-cell: ${st.modeTwo ?? 0} (${st.modeTwoPct ?? 0}%)
Alternating: ${st.alternating ?? 0} (${st.alternatingPct ?? 0}%)
Unknown: ${st.unknown ?? 0} (${st.unknownPct ?? 0}%)`;
    }
  } catch {
  }
}

async function refresh() {
  try {
    const ping = await pingContentScript();
    const statusEl = $("status");
    if (ping.onPlay) {
      statusEl.textContent = "● Collecting";
      statusEl.className = "status on";
    } else if (ping.playOpenElsewhere) {
      statusEl.textContent = "○ Open popup from /play tab";
      statusEl.className = "status off";
    } else {
      statusEl.textContent = "○ Not on Gigaverse";
      statusEl.className = "status off";
    }
    const statsRes = await sendMessage({ type: "GET_STATS" });
    if (!(statsRes == null ? void 0 : statsRes.ok)) {
      if (!statsRes) {
        statusEl.textContent = "○ Background unavailable";
        statusEl.className = "status off";
        showMessage("Reload the extension on chrome://extensions");
      }
      return;
    }
  const { overall, byEnemy, lastEnemy } = statsRes.stats;
  $("total-moves").textContent = String(overall.totalMoves);
  $("unique-enemies").textContent = String(overall.uniqueEnemies);
  $("runs").textContent = String(overall.runs);
  const lastData = maybe$("last-data");
  const lastOk = lastEnemy && typeof lastEnemy.enemyCid === "number" && lastEnemy.enemyCid > 0;
  if (lastData) {
    if (!lastOk) {
      lastData.textContent = "No moves captured yet.";
      lastData.className = "muted";
    } else {
      lastData.className = "";
      lastData.innerHTML = `Enemy #${lastEnemy.enemyCid}<br/>Moves: ${lastEnemy.moves}<br/>Last move: ${lastEnemy.lastMove ?? "—"}`;
    }
  }
  const enemyList = maybe$("enemy-list");
  const details = maybe$("enemy-details");
  if (enemyList) {
    enemyList.innerHTML = "";
    const enemies = (byEnemy ?? []).filter((e) => typeof e.enemyCid === "number" && e.enemyCid > 0);
    if (enemies.length === 0) {
      const li = document.createElement("li");
      li.className = "muted";
      li.textContent = "No enemies yet.";
      enemyList.appendChild(li);
    } else {
      for (const enemy of enemies) {
        const li = document.createElement("li");
        li.innerHTML = `<button type="button" data-enemy="${enemy.enemyCid}" class="enemy-link">Enemy #${enemy.enemyCid} — ${enemy.totalMoves} moves</button>`;
        enemyList.appendChild(li);
      }
    }
    if (details) {
      if (enemies[0]) {
        details.className = "enemy-details";
        details.textContent = renderTransitions(enemies[0]);
      } else {
        details.className = "enemy-details muted";
        details.textContent = "";
      }
      enemyList.querySelectorAll("button[data-enemy]").forEach((btn) => {
        btn.addEventListener("click", () => {
          const cid = Number(btn.dataset.enemy);
          const enemy = enemies.find((e) => e.enemyCid === cid);
          if (!enemy) return;
          details.className = "enemy-details";
          details.textContent = renderTransitions(enemy);
        });
      });
    }
  }
  const debugRes = await sendMessage({ type: "GET_DEBUG" });
  const debugBtn = $("btn-debug");
  const debugPanel = maybe$("debug-panel");
  const debugOn = Boolean((debugRes == null ? void 0 : debugRes.ok) && debugRes.debug);
  if (debugOn) {
    debugBtn.textContent = "Debug ON";
    debugBtn.classList.add("active");
    if (debugPanel) debugPanel.open = true;
  } else {
    debugBtn.textContent = "Debug";
    debugBtn.classList.remove("active");
  }
  await refreshFishing();
  const pred = await sendMessage({ type: "GET_PREDICTION_META" });
  const predBtn = $("btn-prediction");
  if ((pred == null ? void 0 : pred.ok) && pred.predictionEnabled) {
    predBtn.textContent = "Prediction ON";
    predBtn.classList.add("active");
  } else {
    predBtn.textContent = "Prediction OFF";
    predBtn.classList.remove("active");
  }
  const combatMeta = $("combat-meta");
  const combatProbs = $("combat-probs");
  const combatEv = $("combat-ev");
  const combatPlay = $("combat-play");
  const combatReason = $("combat-reason");
  const combatConfidence = $("combat-confidence");
  const summary = maybe$("pred-summary");
  const accuracy = maybe$("pred-accuracy");
  const intuition = maybe$("pred-intuition");
  if ((pred == null ? void 0 : pred.ok) && pred.lastPrediction) {
    const p = pred.lastPrediction;
    const rec = p.recommendedMove
      ? MOVE_UI_LABELS[p.recommendedMove]
      : p.counterMove
        ? MOVE_UI_LABELS[p.counterMove]
        : "—";
    const cid = p.enemyCid != null && p.enemyCid > 0 ? `#${p.enemyCid}` : "—";
    combatMeta.className = "";
    combatMeta.textContent = `Enemy ${cid} · N=${p.n ?? 0}${p.locked ? " · locked" : ""}`;
    combatProbs.className = "";
    combatProbs.textContent = [
      `Sword   ${p.percents?.rock ?? 0}%`,
      `Shield  ${p.percents?.paper ?? 0}%`,
      `Spell   ${p.percents?.scissor ?? 0}%`,
    ].join("\n");
    const rankedBy = Object.fromEntries((p.ranked ?? []).map((r) => [r.move, r]));
    combatEv.className = "";
    combatEv.textContent = [
      `Sword   ${formatEv(rankedBy.rock?.ev)}`,
      `Shield  ${formatEv(rankedBy.paper?.ev)}`,
      `Spell   ${formatEv(rankedBy.scissor?.ev)}`,
    ].join("\n");
    combatPlay.className = "play-line";
    combatPlay.textContent = `PLAY  ${rec}`;
    const whyLine = typeof p.why === "string" ? p.why.split("\n")[0] : "";
    combatReason.className = whyLine ? "small" : "muted small";
    combatReason.textContent = whyLine || "";
    combatConfidence.className = "small";
    combatConfidence.textContent = `Confidence: ${p.confidence ?? "—"}`;
    if (summary) {
      summary.className = "";
      summary.textContent = `Play ${rec} · Sword ${p.percents.rock}% · Shield ${p.percents.paper}% · Spell ${p.percents.scissor}% (N=${p.n}, ${p.confidence})`;
    }
    if (accuracy) {
      const top1 =
        pred.accuracyPredictions > 0
          ? Math.round((pred.accuracyTop1Hits / pred.accuracyPredictions) * 1e3) / 10
          : 0;
      const mf =
        pred.accuracyPredictions > 0
          ? Math.round((pred.accuracyMostFrequentHits / pred.accuracyPredictions) * 1e3) / 10
          : 0;
      accuracy.className = "";
      accuracy.textContent = `Accuracy top1 ${top1}% vs most-frequent ${mf}% (${pred.accuracyPredictions} scored) · boons ${pred.runBoonsCount}`;
    }
    if (intuition) {
      if (pred.activeIntuition) {
        intuition.className = "";
        intuition.textContent = `Intuition ruled out: ${MOVE_UI_LABELS[pred.activeIntuition.ruledOutMove]}`;
      } else {
        intuition.className = "muted";
        intuition.textContent = "No active intuition constraint";
      }
    }
  } else {
    combatMeta.className = "muted";
    combatMeta.textContent = "No combat prediction yet.";
    combatProbs.textContent = "";
    combatEv.textContent = "";
    combatPlay.className = "play-line muted";
    combatPlay.textContent = "";
    combatReason.textContent = "";
    combatConfidence.textContent = "";
    if (summary) {
      summary.className = "muted";
      summary.textContent = "No prediction yet.";
    }
    if (accuracy) accuracy.textContent = "";
    if (intuition) intuition.textContent = "";
  }
  } catch {
    const statusEl = maybe$("status");
    if (statusEl) {
      statusEl.textContent = "○ Popup error";
      statusEl.className = "status off";
    }
    showMessage("Popup failed to refresh — reload extension");
  }
}
function wireActions() {
  bindClick("btn-community-export", async () => {
    const step1 = window.confirm(
      "Export community file includes:\n• Combat moves (dungeonId, fight, HP/charges, rock/paper/scissor)\n• Fishing steps (board 3|4, fish/bobber positions)\n\nDoes NOT include: login, JWT, cookies, wallet, actionToken.\n\nThe file is saved ONLY to your disk. The extension does not upload it.",
    );
    if (!step1) return;
    const understood = window.confirm(
      "I understand this file should only be sent to people I trust.\n\nContinue to save giga-community-YYYY-MM-DD.jsonl?",
    );
    if (!understood) return;
    const res = await sendMessage({ type: "EXPORT_COMMUNITY", confirmed: true });
    if (!(res == null ? void 0 : res.ok)) {
      showMessage(res?.error === "secrets_detected" ? "Export blocked: secrets detected" : "Community export failed");
      return;
    }
    downloadText(res.filename, res.jsonl, "application/x-ndjson");
    showMessage(`Community export: ${res.count} rows (combat ${res.combat}, fishing ${res.fishing})`);
  });

  bindClick("btn-community-import", () => {
    const ok = window.confirm(
      "Import adds other players' move logs into your local database.\nYour login is NOT sent anywhere.\nYou can select multiple files; duplicates are skipped.",
    );
    if (!ok) return;
    maybe$("community-import-file")?.click();
  });
  const communityImportFile = maybe$("community-import-file");
  if (communityImportFile) communityImportFile.addEventListener("change", async (event) => {
    const input = event.target;
    const files = [...(input.files ?? [])];
    if (!files.length) return;
    try {
      let combatSaved = 0;
      let combatSkipped = 0;
      let fishingSaved = 0;
      let fishingSkipped = 0;
      let skippedQa = 0;
      let failed = 0;
      for (let i = 0; i < files.length; i += 1) {
        const file = files[i];
        const text = await file.text();
        const trimmed = text.trim();
        if (!trimmed) {
          failed += 1;
          continue;
        }
        const rebuild = i === files.length - 1;
        // Prefer detecting Export JSON / QA before community JSONL.
        try {
          if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
            const parsed = JSON.parse(trimmed);
            const extracted = extractMovesFromParsed(parsed);
            if (extracted.reason === "live_fights_qa") {
              skippedQa += 1;
              continue;
            }
            if (extracted.moves) {
              const resMoves = await sendMessage({
                type: "IMPORT_MOVES",
                moves: extracted.moves,
                rebuildModel: rebuild,
              });
              if (resMoves?.ok) {
                combatSaved += resMoves.saved ?? 0;
                combatSkipped += resMoves.skipped ?? 0;
              } else failed += 1;
              continue;
            }
          }
        } catch {
          // fall through to community JSONL parse
        }
        if (!looksLikeCommunityText(trimmed)) {
          failed += 1;
          continue;
        }
        const res = await sendMessage({
          type: "IMPORT_COMMUNITY",
          text,
          rebuildModel: rebuild,
        });
        if (!(res == null ? void 0 : res.ok)) {
          failed += 1;
          continue;
        }
        combatSaved += res.combatSaved ?? 0;
        combatSkipped += res.combatSkipped ?? 0;
        fishingSaved += res.fishingSaved ?? 0;
        fishingSkipped += res.fishingSkipped ?? 0;
      }
      const parts = [
        `Files ${files.length}`,
        `combat +${combatSaved}/skip ${combatSkipped}`,
        `fishing +${fishingSaved}/skip ${fishingSkipped}`,
      ];
      if (skippedQa) parts.push(`QA skipped ${skippedQa}`);
      if (failed) parts.push(`failed ${failed}`);
      showMessage(parts.join(", "));
      await refresh();
      await refreshFishing();
    } catch {
      showMessage("Invalid community file");
    } finally {
      input.value = "";
    }
  });

  bindClick("btn-community-bundled", async () => {
    const ok = window.confirm(
      "Load the community dataset bundled with this extension?\nAdds shared move logs only. Your login is not sent.\n(Empty placeholder files do nothing.)",
    );
    if (!ok) return;
    const res = await sendMessage({ type: "LOAD_BUNDLED_COMMUNITY", confirmed: true, rebuildModel: true });
    if (!(res == null ? void 0 : res.ok)) {
      showMessage(res?.error === "bundled_empty" ? "Bundled dataset is empty" : "Bundled load failed");
      return;
    }
    showMessage(`Bundled: combat +${res.combatSaved}, fishing +${res.fishingSaved}`);
    await refresh();
    await refreshFishing();
  });

  bindClick("btn-community-pull", async () => {
    const res = await sendMessage({ type: "PULL_COMMUNITY" });
    if (!(res == null ? void 0 : res.ok)) {
      showMessage(res?.hint ?? "Pull disabled — use Import file");
      return;
    }
    showMessage(`Pulled: combat +${res.combatSaved}, fishing +${res.fishingSaved}`);
    await refresh();
    await refreshFishing();
  });

  void (async () => {
    try {
      const meta = await sendMessage({ type: "GET_COMMUNITY_META" });
      const pullBtn = maybe$("btn-community-pull");
      const bundledBtn = maybe$("btn-community-bundled");
      const hint = maybe$("community-pull-hint");
      if (!pullBtn || !hint) return;
      if (meta?.canPull) {
        pullBtn.disabled = false;
        pullBtn.title = "Read-only GET of configured HTTPS URL";
        hint.textContent = "Pull URL configured (read-only).";
      } else {
        pullBtn.disabled = true;
        hint.textContent = "Pull disabled — download merged/*.jsonl from the repo and Import file.";
      }
      if (bundledBtn && meta?.bundledEmpty === true) {
        bundledBtn.disabled = true;
        bundledBtn.title = "Bundled community files are empty placeholders";
      }
    } catch {
      // community meta is optional — never block popup
    }
  })();

  bindClick("btn-import", () => {
    $("import-file").click();
  });
  $("import-file").addEventListener("change", async (event) => {
    const input = event.target;
    const files = [...(input.files ?? [])];
    if (!files.length) return;
    try {
      const lists = [];
      let skippedQa = 0;
      let skippedBad = 0;
      let fileOk = 0;
      for (const file of files) {
        let parsed;
        try {
          parsed = JSON.parse(await file.text());
        } catch {
          skippedBad += 1;
          continue;
        }
        const extracted = extractMovesFromParsed(parsed);
        if (extracted.reason === "live_fights_qa") {
          skippedQa += 1;
          continue;
        }
        if (!extracted.moves) {
          skippedBad += 1;
          continue;
        }
        fileOk += 1;
        lists.push(extracted.moves);
      }
      const allMoves = mergeMovesById(lists);
      if (!allMoves.length) {
        if (skippedQa && !fileOk) {
          showMessage("Live-fights QA JSON is not importable — use Export JSON / community");
        } else {
          showMessage("JSON must be moves[] or { moves: [] }");
        }
        return;
      }
      const res = await sendMessage({ type: "IMPORT_MOVES", moves: allMoves, rebuildModel: true });
      if (!(res == null ? void 0 : res.ok)) {
        showMessage("Import failed");
        return;
      }
      const parts = [
        `Files ${fileOk}/${files.length}`,
        `+${res.saved} skip ${res.skipped}`,
        `enemies≈${res.uniqueEnemies}`,
      ];
      if (skippedQa) parts.push(`QA skipped ${skippedQa}`);
      if (skippedBad) parts.push(`bad ${skippedBad}`);
      showMessage(parts.join(", "));
      await refresh();
    } catch {
      showMessage("Invalid JSON file");
    } finally {
      input.value = "";
    }
  });
  bindClick("btn-clear", async () => {
    const confirmed = window.confirm("Clear all collected combat data?");
    if (!confirmed) return;
    await sendMessage({ type: "CLEAR_DATA" });
    showMessage("Data cleared");
    await refresh();
  });
  bindClick("btn-debug", async () => {
    const current = await sendMessage({ type: "GET_DEBUG" });
    const enabled = !((current == null ? void 0 : current.ok) && current.debug);
    await sendMessage({ type: "SET_DEBUG", enabled });
    showMessage(enabled ? "Debug enabled" : "Debug disabled");
    await refresh();
  });
  bindClick("btn-prediction", async () => {
    const current = await sendMessage({ type: "GET_PREDICTION_META" });
    const enabled = !((current == null ? void 0 : current.ok) && current.predictionEnabled);
    await sendMessage({ type: "SET_PREDICTION", enabled });
    showMessage(enabled ? "Prediction enabled" : "Prediction disabled");
    await refresh();
  });
  bindClick("btn-reset-model", async () => {
    const confirmed = window.confirm("Reset prediction model counts/accuracy? Raw moves stay.");
    if (!confirmed) return;
    await sendMessage({ type: "RESET_MODEL" });
    showMessage("Model reset");
    await refresh();
  });
}
function boot() {
  wireActions();
  void refresh();
}
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", boot);
} else {
  boot();
}
