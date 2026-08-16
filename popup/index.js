import { a as MOVE_UI_LABELS } from "../assets/constants.js";
function $(id) {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Missing element #${id}`);
  return el;
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
  return chrome.runtime.sendMessage(message);
}
async function pingContentScript() {
  var _a;
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!(tab == null ? void 0 : tab.id) || !((_a = tab.url) == null ? void 0 : _a.includes("gigaverse.io/play"))) {
      return false;
    }
    const response = await chrome.tabs.sendMessage(tab.id, { type: "PING_CONTENT" });
    return Boolean((response == null ? void 0 : response.ok) && (response == null ? void 0 : response.active));
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

function renderFishGrid(current, possible, bobber = null) {
  const el = $("fish-grid");
  el.innerHTML = "";
  const next = new Set(possible ?? []);
  for (let n = 1; n <= 16; n += 1) {
    const cell = document.createElement("div");
    cell.className = "fish-cell";
    if (n === current) cell.classList.add("current");
    else if (n === bobber) cell.classList.add("bobber");
    else if (next.has(n)) cell.classList.add("next");
    cell.textContent = n === current ? "🐟" : n === bobber ? "●" : String(n);
    el.appendChild(cell);
  }
}

async function refreshFishing() {
  try {
    const res = await sendMessage({ type: "GET_FISHING" });
    const status = $("fish-status");
    const summary = $("fish-summary");
    const statsEl = $("fish-stats");
    if (!res?.ok) {
      status.className = "muted";
      status.textContent = "Fishing idle";
      return;
    }
    const active = Boolean(res.inFishing) && Boolean(res.view);
    const v = res.view ?? {};
    status.className = active ? "status on" : "muted";
    status.textContent = active ? (v.status ?? "Fishing") : "Fishing idle";
    if (!active) {
      summary.className = "muted";
      summary.textContent = "Overlay shows only during an active fishing session (Dendren 4×4).";
      renderFishGrid(null, []);
    } else {
      const possible = (v.possibleCells ?? []).join(" / ") || "—";
      summary.className = "";
      summary.textContent = [
        v.currentCell != null && v.currentPos
          ? `Fish: cell ${v.currentCell} (${v.currentPos.x},${v.currentPos.y})`
          : "Fish: unknown",
        `Mode: ${v.label || v.mode || "—"}`,
        `Next cells: ${possible}`,
        v.bobberCell != null ? `Bobber: cell ${v.bobberCell}` : "Bobber: —",
        v.recommendation ? String(v.recommendation) : "Play: waiting for hand",
        v.why ? `Why: ${v.why}` : "",
        v.focusAssumption ? "Focus: not in API (unconstrained assumption)" : v.focus != null ? `Focus: ${v.focus}` : "",
      ].filter(Boolean).join("\n");
      summary.style.whiteSpace = "pre-wrap";
      renderFishGrid(v.currentCell ?? null, v.possibleCells ?? [], v.bobberCell ?? null);
    }
    const st = res.stats ?? {};
    statsEl.className = "muted";
    statsEl.textContent = `Fishing sessions: ${st.totalSessions ?? 0}
1-cell: ${st.modeOne ?? 0} (${st.modeOnePct ?? 0}%)
2-cell: ${st.modeTwo ?? 0} (${st.modeTwoPct ?? 0}%)
Alternating: ${st.alternating ?? 0} (${st.alternatingPct ?? 0}%)
Unknown: ${st.unknown ?? 0} (${st.unknownPct ?? 0}%)`;
    statsEl.style.whiteSpace = "pre-wrap";
  } catch {
  }
}

async function refresh() {
  const onPlay = await pingContentScript();
  const statusEl = $("status");
  if (onPlay) {
    statusEl.textContent = "● Collecting";
    statusEl.className = "status on";
  } else {
    statusEl.textContent = "○ Not on Gigaverse";
    statusEl.className = "status off";
  }
  const statsRes = await sendMessage({ type: "GET_STATS" });
  if (!(statsRes == null ? void 0 : statsRes.ok)) return;
  const { overall, byEnemy, lastEnemy } = statsRes.stats;
  $("total-moves").textContent = String(overall.totalMoves);
  $("unique-enemies").textContent = String(overall.uniqueEnemies);
  $("runs").textContent = String(overall.runs);
  const lastData = $("last-data");
  if (!lastEnemy || lastEnemy.enemyCid == null) {
    lastData.textContent = "No moves captured yet.";
    lastData.className = "muted";
  } else {
    lastData.className = "";
    lastData.innerHTML = `Enemy #${lastEnemy.enemyCid}<br/>Moves: ${lastEnemy.moves}<br/>Last move: ${lastEnemy.lastMove ?? "—"}`;
  }
  const enemyList = $("enemy-list");
  enemyList.innerHTML = "";
  if (byEnemy.length === 0) {
    const li = document.createElement("li");
    li.className = "muted";
    li.textContent = "No enemies yet.";
    enemyList.appendChild(li);
  } else {
    for (const enemy of byEnemy) {
      const li = document.createElement("li");
      li.innerHTML = `<button type="button" data-enemy="${enemy.enemyCid}" class="enemy-link">Enemy #${enemy.enemyCid} — ${enemy.totalMoves} moves</button>`;
      enemyList.appendChild(li);
    }
  }
  const details = $("enemy-details");
  if (byEnemy[0]) {
    details.className = "enemy-details";
    details.textContent = renderTransitions(byEnemy[0]);
  } else {
    details.className = "enemy-details muted";
    details.textContent = "";
  }
  enemyList.querySelectorAll("button[data-enemy]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const cid = Number(btn.dataset.enemy);
      const enemy = byEnemy.find((e) => e.enemyCid === cid);
      if (!enemy) return;
      details.className = "enemy-details";
      details.textContent = renderTransitions(enemy);
    });
  });
  const debugRes = await sendMessage({ type: "GET_DEBUG" });
  const debugBtn = $("btn-debug");
  if ((debugRes == null ? void 0 : debugRes.ok) && debugRes.debug) {
    debugBtn.textContent = "Debug ON";
    debugBtn.classList.add("active");
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
  const summary = $("pred-summary");
  const accuracy = $("pred-accuracy");
  const intuition = $("pred-intuition");
  if ((pred == null ? void 0 : pred.ok) && pred.lastPrediction) {
    const p = pred.lastPrediction;
    summary.className = "";
    const rec = p.recommendedMove ? MOVE_UI_LABELS[p.recommendedMove] : p.counterMove ? MOVE_UI_LABELS[p.counterMove] : "—";
    const lock = p.locked ? " · locked" : "";
    summary.textContent = `Play ${rec}${lock} · Sword ${p.percents.rock}% · Shield ${p.percents.paper}% · Spell ${p.percents.scissor}% (N=${p.n}, ${p.confidence})`;
    const top1 = pred.accuracyPredictions > 0 ? Math.round(pred.accuracyTop1Hits / pred.accuracyPredictions * 1e3) / 10 : 0;
    const mf = pred.accuracyPredictions > 0 ? Math.round(pred.accuracyMostFrequentHits / pred.accuracyPredictions * 1e3) / 10 : 0;
    accuracy.className = "";
    accuracy.textContent = `Accuracy top1 ${top1}% vs most-frequent ${mf}% (${pred.accuracyPredictions} scored) · boons ${pred.runBoonsCount}`;
    if (pred.activeIntuition) {
      intuition.className = "";
      intuition.textContent = `Intuition ruled out: ${MOVE_UI_LABELS[pred.activeIntuition.ruledOutMove]}`;
    } else {
      intuition.className = "muted";
      intuition.textContent = "No active intuition constraint";
    }
  } else {
    summary.className = "muted";
    summary.textContent = "No prediction yet.";
    accuracy.textContent = "";
    intuition.textContent = "";
  }
}
function wireActions() {
  $("btn-export-json").addEventListener("click", async () => {
    const res = await sendMessage({ type: "EXPORT_JSON" });
    if (!(res == null ? void 0 : res.ok)) {
      showMessage("Export failed");
      return;
    }
    downloadText(res.filename, res.json, "application/json");
    showMessage("JSON exported");
  });
  $("btn-export-csv").addEventListener("click", async () => {
    const res = await sendMessage({ type: "EXPORT_CSV" });
    if (!(res == null ? void 0 : res.ok)) {
      showMessage("Export failed");
      return;
    }
    downloadText(res.filename, res.csv, "text/csv");
    showMessage("CSV exported");
  });
  $("btn-export-full").addEventListener("click", async () => {
    const ok = window.confirm(
      "Export Full is ONLY for yourself.\nIt may contain actionToken.\nDo NOT share Full files — use Export community / JSON / CSV instead.",
    );
    if (!ok) return;
    const res = await sendMessage({ type: "EXPORT_FULL" });
    if (!(res == null ? void 0 : res.ok)) {
      showMessage("Export failed");
      return;
    }
    downloadText(res.filename, res.json, "application/json");
    showMessage("Full export saved (do not share)");
  });

  $("btn-community-export").addEventListener("click", async () => {
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

  $("btn-community-import").addEventListener("click", () => {
    const ok = window.confirm(
      "Import adds other players' move logs into your local database.\nYour login is NOT sent anywhere.\nDuplicates are skipped.",
    );
    if (!ok) return;
    $("community-import-file").click();
  });
  $("community-import-file").addEventListener("change", async (event) => {
    const input = event.target;
    const file = input.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const res = await sendMessage({ type: "IMPORT_COMMUNITY", text, rebuildModel: true });
      if (!(res == null ? void 0 : res.ok)) {
        showMessage("Community import failed");
        return;
      }
      showMessage(
        `Imported combat +${res.combatSaved}/skip ${res.combatSkipped}, fishing +${res.fishingSaved}/skip ${res.fishingSkipped}`,
      );
      await refresh();
      await refreshFishing();
    } catch {
      showMessage("Invalid community file");
    } finally {
      input.value = "";
    }
  });

  $("btn-community-bundled").addEventListener("click", async () => {
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

  $("btn-community-pull").addEventListener("click", async () => {
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
    const meta = await sendMessage({ type: "GET_COMMUNITY_META" });
    const pullBtn = $("btn-community-pull");
    const bundledBtn = $("btn-community-bundled");
    const hint = $("community-pull-hint");
    if (meta?.canPull) {
      pullBtn.disabled = false;
      pullBtn.title = "Read-only GET of configured HTTPS URL";
      hint.textContent = "Pull URL configured (read-only).";
    } else {
      pullBtn.disabled = true;
      hint.textContent = "Pull disabled — download merged/*.jsonl from the repo and Import file.";
    }
    // Bundled placeholders are empty until a shared dataset is added to the package.
    if (bundledBtn && meta?.bundledEmpty === true) {
      bundledBtn.disabled = true;
      bundledBtn.title = "Bundled community files are empty placeholders";
    }
  })();

  $("btn-import").addEventListener("click", () => {
    $("import-file").click();
  });
  $("import-file").addEventListener("change", async (event) => {
    var _a;
    const input = event.target;
    const file = (_a = input.files) == null ? void 0 : _a[0];
    if (!file) return;
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      const moves = Array.isArray(parsed) ? parsed : Array.isArray(parsed.moves) ? parsed.moves : null;
      if (!moves) {
        showMessage("JSON must be moves[] or { moves: [] }");
        return;
      }
      const res = await sendMessage({ type: "IMPORT_MOVES", moves, rebuildModel: true });
      if (!(res == null ? void 0 : res.ok)) {
        showMessage("Import failed");
        return;
      }
      showMessage(`Imported ${res.saved} (skip ${res.skipped}), enemies≈${res.uniqueEnemies}`);
      await refresh();
    } catch {
      showMessage("Invalid JSON file");
    } finally {
      input.value = "";
    }
  });
  $("btn-clear").addEventListener("click", async () => {
    const confirmed = window.confirm("Clear all collected combat data?");
    if (!confirmed) return;
    await sendMessage({ type: "CLEAR_DATA" });
    showMessage("Data cleared");
    await refresh();
  });
  $("btn-debug").addEventListener("click", async () => {
    const current = await sendMessage({ type: "GET_DEBUG" });
    const enabled = !((current == null ? void 0 : current.ok) && current.debug);
    await sendMessage({ type: "SET_DEBUG", enabled });
    showMessage(enabled ? "Debug enabled" : "Debug disabled");
    await refresh();
  });
  $("btn-prediction").addEventListener("click", async () => {
    const current = await sendMessage({ type: "GET_PREDICTION_META" });
    const enabled = !((current == null ? void 0 : current.ok) && current.predictionEnabled);
    await sendMessage({ type: "SET_PREDICTION", enabled });
    showMessage(enabled ? "Prediction enabled" : "Prediction disabled");
    await refresh();
  });
  $("btn-reset-model").addEventListener("click", async () => {
    const confirmed = window.confirm("Reset prediction model counts/accuracy? Raw moves stay.");
    if (!confirmed) return;
    await sendMessage({ type: "RESET_MODEL" });
    showMessage("Model reset");
    await refresh();
  });
}
wireActions();
void refresh();
