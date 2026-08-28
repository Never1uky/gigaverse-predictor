/**
 * Fishing payload detection + JSON extraction (pure, no chrome).
 */
import {
  asFinite,
  asInt,
  localCellToOffset,
  parseApiCoordPair,
  parseBoardPosition,
  parseBoardPositionAuto,
  sizeForBoard,
} from "./fishing-grid.js";
import { detectFishingBoard } from "./community.js";

const FISHING_ACTION_RE =
  /^(play_cards|move_focus_point|use_fishing_item|start_fishing|stop_fishing|fishing|cast_line|redraw_hand|redraw)$/i;
const FISHING_PATH_RE =
  /\/(fish|fishing)(\/|$)|play_cards|move_focus|\/cards(?:\/|$)|\/(pond|bobber)(?:\/|$)|gamewebui|FISHING_GAME/i;
export const SENSITIVE_KEY_RE =
  /authorization|cookie|jwt|token$|password|secret|bearer|credential/i;
const COMBAT_SIGNAL_RE =
  /ENEMY_CID|ROOM_NUM_CID|currentCharges|rockAtk|paperAtk|scissorAtk|rockCharges|paperCharges|scissorCharges|lootPhase/i;
const BOBBER_KEY_RE =
  /^(bobber|focuspoint|focus_point|float|playerpos|playerposition|hookpos|castpos)$/i;
const HAND_KEY_RE = /^(hand|cards|spells|spellcards|fishingcards|currenthand)$/i;

export function isFishingActionName(action) {
  return typeof action === "string" && FISHING_ACTION_RE.test(action.trim());
}

export function isFishingUrl(url) {
  if (typeof url !== "string") return false;
  if (isDungeonGameUrl(url)) return false;
  try {
    return FISHING_PATH_RE.test(new URL(url, "https://gigaverse.io").pathname);
  } catch {
    return FISHING_PATH_RE.test(url);
  }
}

/** Dungeon APIs must never open fishing ingest/overlay. */
export function isDungeonGameUrl(url) {
  if (typeof url !== "string") return false;
  try {
    return /\/api\/game\/dungeon\//i.test(new URL(url, "https://gigaverse.io").pathname);
  } catch {
    return /\/api\/game\/dungeon\//i.test(url);
  }
}

function isGamewebuiUrl(url) {
  if (typeof url !== "string") return false;
  try {
    return /\/api\/gamewebui\//i.test(new URL(url, "https://gigaverse.io").pathname);
  } catch {
    return /\/api\/gamewebui\//i.test(url);
  }
}

function isFishingDocType(value) {
  return typeof value === "string" && value.toUpperCase() === "FISHING_GAME";
}

function looksLikeFishingState(obj) {
  if (!obj || typeof obj !== "object" || Array.isArray(obj)) return false;
  const gs = obj.gridSize;
  if ((gs === 3 || gs === 4) && Array.isArray(obj.fishPosition) && obj.fishPosition.length === 2) {
    return true;
  }
  return false;
}

/**
 * Walk to data.doc when docType === FISHING_GAME and return inner data
 * (gridSize, fishPosition, hand, deckCardData, …). Also accept a state
 * object with gridSize 3|4 and a 2-length fishPosition even if docType is missing.
 */
export function extractFishingGameState(response) {
  if (response == null || typeof response !== "object") return null;
  let fromDoc = null;
  let fromShape = null;
  const consider = (obj) => {
    if (!obj || typeof obj !== "object" || Array.isArray(obj)) return;
    if (isFishingDocType(obj.docType) && obj.data && typeof obj.data === "object" && !Array.isArray(obj.data)) {
      fromDoc = obj.data;
      return;
    }
    if (!fromShape && looksLikeFishingState(obj)) fromShape = obj;
  };
  const body = response.data ?? response;
  consider(body);
  consider(body?.doc);
  consider(response.doc);
  if (fromDoc) return fromDoc;
  if (fromShape) return fromShape;
  walk(response, "", (_key, value) => {
    if (fromDoc) return;
    consider(value);
  });
  return fromDoc ?? fromShape;
}

/** FISHING_GAME doc wrapper (COMPLETE_CID / SUCCESS_CID live here, not in inner data). */
export function extractFishingDoc(response) {
  if (response == null || typeof response !== "object") return null;
  let doc = null;
  const consider = (obj) => {
    if (obj && typeof obj === "object" && !Array.isArray(obj) && isFishingDocType(obj.docType)) {
      doc = obj;
    }
  };
  const body = response.data ?? response;
  consider(body);
  consider(body?.doc);
  if (doc) return doc;
  walk(response, "", (_key, value) => {
    if (doc) return;
    consider(value);
  });
  return doc;
}

export function detectFishingBoardFromState(state) {
  if (!state || typeof state !== "object") return null;
  if (state.gridSize === 3 || state.gridSize === 4) return state.gridSize;
  if (state.focusMechanicEnabled === true) return 4;
  const max = asFinite(state.focusMeterMax);
  if (max != null && max > 0) return 4;
  return null;
}

function fishHpAmount(effects) {
  if (!Array.isArray(effects)) return null;
  for (const e of effects) {
    if (!e || typeof e !== "object") continue;
    if (String(e.type ?? "").toUpperCase() === "FISH_HP") {
      const n = asFinite(e.amount);
      if (n != null) return n;
    }
  }
  return null;
}

export function safeJsonKeys(value, depth = 0) {
  if (value == null || depth > 6) return "";
  if (typeof value !== "object") return "";
  if (Array.isArray(value)) {
    return value.slice(0, 20).map((v) => safeJsonKeys(v, depth + 1)).join(" ");
  }
  const keys = Object.keys(value);
  let out = keys.join(" ");
  for (const k of keys) {
    if (SENSITIVE_KEY_RE.test(k)) continue;
    out += " " + safeJsonKeys(value[k], depth + 1);
  }
  return out;
}

export function hasStrongFishingSignals(response) {
  if (response == null || typeof response !== "object") return false;
  if (extractFishingGameState(response)) return true;
  const blob = safeJsonKeys(response);
  if (
    /\bfishing\b|\bfishId\b|\bfish_id\b|\bcatchMeter\b|\bfishCell\b|\bfintuition\b|\bplay_cards\b|\bmove_focus_point\b|\bbobber\b|\bfocusPoint\b|\bFISH_CID\b|\bFISHING_CID\b|\bFISHING_GAME\b|\bfishPosition\b|\bgridSize\b|\bdeckCardData\b|\bhitZones\b/i.test(
      blob,
    )
  ) {
    return true;
  }
  const body = response.data ?? response;
  if (body?.fishing || body?.fish || body?.bobber || body?.focusPoint) return true;
  if (isFishingDocType(body?.docType) || isFishingDocType(body?.doc?.docType)) return true;
  const entity = body?.entity;
  if (entity && (entity.FISH_CID != null || entity.FISH_ID_CID != null || entity.FISHING_CID != null)) {
    return true;
  }
  return false;
}

export function looksLikeCombatPayload(response) {
  if (response == null || typeof response !== "object") return false;
  // FISHING_GAME playerHp is mana, not combat HP — never treat as a fighter snapshot.
  if (extractFishingGameState(response)) return false;
  if (hasStrongFishingSignals(response)) return false;
  const blob = safeJsonKeys(response);
  if (COMBAT_SIGNAL_RE.test(blob)) return true;
  const body = response.data ?? response;
  const run = body?.run;
  if (run && Array.isArray(run.players) && run.players.length >= 2) {
    if (/rock|paper|scissor|Charges|ATK|DEF/i.test(safeJsonKeys(run))) return true;
  }
  if (body?.entity?.ENEMY_CID != null) return true;
  return false;
}

export function looksLikeFishingPayload(response, requestAction, url) {
  // Live QA: /api/game/dungeon/today was ingested as fishing during combat.
  if (isDungeonGameUrl(url)) return false;
  if (isFishingActionName(requestAction)) return true;
  if (isFishingUrl(url)) return true;
  if (looksLikeCombatPayload(response)) return false;
  // Weak blob signals only when URL is gamewebui or payload is real FISHING_GAME state.
  if (extractFishingGameState(response)) return true;
  if (isGamewebuiUrl(url) && hasStrongFishingSignals(response)) return true;
  return false;
}

/**
 * Ingest order helper: fishing-like payloads must never force-hide / clear UI,
 * even if the same /dungeon/action body still contains leftover combat `run.players`.
 */
export function shouldClearFishingForCapture({ forceHide = false, response, requestAction, url } = {}) {
  if (looksLikeFishingPayload(response, requestAction, url)) return false;
  return Boolean(forceHide) || looksLikeCombatPayload(response);
}

export function walk(obj, path, visit, depth = 0) {
  if (obj == null || typeof obj !== "object" || depth > 8) return;
  if (Array.isArray(obj)) {
    const limit = Math.min(obj.length, 30);
    for (let i = 0; i < limit; i += 1) walk(obj[i], `${path}[${i}]`, visit, depth + 1);
    return;
  }
  for (const [k, v] of Object.entries(obj)) {
    if (SENSITIVE_KEY_RE.test(k)) continue;
    visit(k, v, path);
    if (v && typeof v === "object") walk(v, path ? `${path}.${k}` : k, visit, depth + 1);
  }
}

export function fishingParentScore(path, key) {
  if (/fish|fishing|bobber|focus|float|catch|fintuition|pond|dendren/i.test(`${path}.${key}`)) return 10;
  return 0;
}

export function looksLikeFishingUiText(text) {
  const t = String(text ?? "").toLowerCase();
  if (/\bredraw\b/.test(t)) return true;
  if (t.includes("fintuition") || t.includes("catch meter")) return true;
  if (t.includes("fishing") && (t.includes("mana") || t.includes("hand") || t.includes("redraw"))) return true;
  return false;
}

export function looksLikeHubScreen(text) {
  const t = String(text ?? "").toLowerCase();
  if (looksLikeFishingUiText(t)) return false;
  if (t.includes("choose your offering") || t.includes("press e to interact")) return true;
  if (t.includes("adventure rewards")) return true;
  // Rewards / exit chrome without waiting for hub offering text.
  if (t.includes("retry") && (t.includes("exit") || t.includes("leave") || t.includes("adventure"))) {
    return true;
  }
  return false;
}

/** Fishing session ended or pre-cast dialog — hide stale Play / Redraw. */
export function looksLikeFishingEndedScreen(text) {
  const t = String(text ?? "").toLowerCase();
  if (t.includes("fish escaped")) return true;
  if (t.includes("cast again")) return true;
  if (t.includes("start fishing")) return true;
  return false;
}

/** Any UI where both combat and fishing overlays should clear immediately. */
export function looksLikeClearOverlaysScreen(text) {
  return looksLikeHubScreen(text) || looksLikeFishingEndedScreen(text);
}

export function shouldHideFishingOverlay({
  inCombat = false,
  hub = false,
  inFishing = false,
  fishingEnded = false,
} = {}) {
  if (inCombat) return true;
  if (hub) return true;
  if (fishingEnded) return true;
  if (!inFishing) return true;
  return false;
}

export function extractFishPosition(response, opts = {}) {
  if (response == null) return { pos: null, cell: null, source: null, candidates: [], diagnostic: null };
  const state = extractFishingGameState(response);
  const stateBoard = detectFishingBoardFromState(state);
  const board = stateBoard ?? opts.board ?? detectFishingBoard(null, response, opts.requestAction ?? null);
  const preferred = board === 3 || board === 4 ? board : null;
  const size = preferred ? sizeForBoard(preferred) : 4;
  if (state && Array.isArray(state.fishPosition)) {
    const parsed = parseApiCoordPair(state.fishPosition, size);
    let previousPos = null;
    let previousCell = null;
    if (Array.isArray(state.previousFishPosition) && state.previousFishPosition.length === 2) {
      const prev = parseApiCoordPair(state.previousFishPosition, size);
      previousPos = prev.pos;
      previousCell = prev.cell;
    }
    return {
      pos: parsed.pos,
      cell: parsed.cell,
      source: "FISHING_GAME.fishPosition",
      candidates: parsed.pos ? [{ pos: parsed.pos, cell: parsed.cell, source: "FISHING_GAME.fishPosition", score: 100, size }] : [],
      diagnostic: parsed.diagnostic,
      board: preferred,
      previousPos,
      previousCell,
    };
  }
  if (looksLikeCombatPayload(response)) {
    return { pos: null, cell: null, source: null, candidates: [], skipped: "combat_payload" };
  }
  const candidates = [];
  const diagnostics = [];
  const consider = (raw, source, score) => {
    const parsed = preferred ? parseBoardPosition(raw, size) : parseBoardPositionAuto(raw, preferred);
    if (parsed.diagnostic) {
      diagnostics.push({ source, diagnostic: parsed.diagnostic });
      return;
    }
    if (!parsed.pos || score < 10) return;
    candidates.push({ pos: parsed.pos, cell: parsed.cell, source, score, size: parsed.size ?? size });
  };
  walk(response, "", (key, value, path) => {
    const keyScore = fishingParentScore(path, key);
    // lastMovePath is unreliable (3x3 [x,y] vs 4x4 a single number) — never use it for fish cell.
    if (/^lastMovePath$/i.test(key)) return;
    if (/previousFishPosition/i.test(key)) return;
    if (/^(x|col|column)$/i.test(key)) return;
    if (
      /^(fish|fishpos|fishposition|fishcell|fishlocation|currentfish)$/i.test(key) ||
      (/pos|coord|loc|tile|cell/i.test(key) && /fish/i.test(path))
    ) {
      consider(value, `${path}.${key}`, keyScore + 12);
      if (value && typeof value === "object") consider(value, `${path}.${key}`, keyScore + 12);
    }
    if (
      /^(cell|cellindex|cellid|currentcell|fishcell|fishpos|fishtile|gridindex|tileindex)$/i.test(key) &&
      keyScore >= 10
    ) {
      consider(value, `${path}.${key}`, keyScore + 8);
    }
    if (keyScore >= 10 && value && typeof value === "object" && !Array.isArray(value)) {
      if (asInt(value.x ?? value.col ?? value.column) != null && asInt(value.y ?? value.row) != null) {
        if (/fish/i.test(path) || /fish/i.test(key)) consider(value, `${path}.${key}`, keyScore + 11);
      }
    }
  });
  if (!candidates.length) {
    return { pos: null, cell: null, source: null, candidates: [], diagnostic: diagnostics[0]?.diagnostic ?? null };
  }
  candidates.sort((a, b) => b.score - a.score);
  const best = candidates[0];
  return {
    pos: best.pos,
    cell: best.cell,
    source: best.source,
    candidates: candidates.slice(0, 6),
    diagnostic: null,
    board: best.size === 3 ? 3 : best.size === 4 ? 4 : preferred,
  };
}

export function extractBobberPosition(response, opts = {}) {
  if (response == null) return { pos: null, cell: null, source: null, candidates: [] };
  const state = extractFishingGameState(response);
  const stateBoard = detectFishingBoardFromState(state);
  const board = stateBoard ?? opts.board ?? detectFishingBoard(null, response, opts.requestAction ?? null);
  const size = board === 3 ? 3 : 4;
  if (state && Array.isArray(state.focusPoint)) {
    const parsed = parseApiCoordPair(state.focusPoint, size);
    return {
      pos: parsed.pos,
      cell: parsed.cell,
      source: "FISHING_GAME.focusPoint",
      candidates: parsed.pos ? [{ pos: parsed.pos, cell: parsed.cell, source: "FISHING_GAME.focusPoint", score: 100 }] : [],
      board,
    };
  }
  if (looksLikeCombatPayload(response)) {
    return { pos: null, cell: null, source: null, candidates: [], skipped: "combat_payload" };
  }
  const candidates = [];
  const consider = (raw, source, score) => {
    const parsed = parseBoardPosition(raw, size);
    if (!parsed.pos || score < 10) return;
    candidates.push({ pos: parsed.pos, cell: parsed.cell, source, score });
  };
  walk(response, "", (key, value, path) => {
    const keyScore = fishingParentScore(path, key);
    if (BOBBER_KEY_RE.test(key) || /bobber|focus.?point|float/i.test(key)) {
      consider(value, `${path}.${key}`, keyScore + 14);
      if (value && typeof value === "object") consider(value, `${path}.${key}`, keyScore + 14);
    }
    if (keyScore >= 10 && /^(position|pos|tile|cell)$/i.test(key) && /bobber|focus|float/i.test(path)) {
      consider(value, `${path}.${key}`, keyScore + 10);
    }
  });
  if (!candidates.length) return { pos: null, cell: null, source: null, candidates: [] };
  candidates.sort((a, b) => b.score - a.score);
  const best = candidates[0];
  return { pos: best.pos, cell: best.cell, source: best.source, candidates: candidates.slice(0, 6), board };
}

export function extractFocus(response) {
  const state = extractFishingGameState(response);
  if (state) {
    const current = asFinite(state.focusMeter);
    const max = asFinite(state.focusMeterMax);
    const enabled = state.focusMechanicEnabled === true || (max != null && max > 0);
    if (enabled || current != null || max != null) {
      return {
        current,
        max,
        source: "FISHING_GAME.focusMeter",
        found: Boolean(enabled || current != null),
        enabled: Boolean(enabled),
      };
    }
  }
  let current = null;
  let max = null;
  let source = null;
  walk(response, "", (key, value, path) => {
    if (SENSITIVE_KEY_RE.test(key)) return;
    const fishing = fishingParentScore(path, key) >= 10 || /focus/i.test(key);
    if (!fishing) return;
    if (
      /^focus(current|now|left|remaining|meter)?$/i.test(key) ||
      /^currentfocus$/i.test(key) ||
      /^focusMeter$/i.test(key)
    ) {
      if (typeof value === "object" && value) {
        const c = asFinite(value.current ?? value.value ?? value.now);
        const m = asFinite(value.max ?? value.currentMax);
        if (c != null) {
          current = c;
          source = `${path}.${key}`;
        }
        if (m != null) max = m;
      } else {
        const n = asFinite(value);
        if (n != null) {
          current = n;
          source = `${path}.${key}`;
        }
      }
    }
    if (/focusmax|maxfocus|focusMeterMax/i.test(key)) {
      const n = asFinite(value);
      if (n != null) max = n;
    }
  });
  const enabled = max != null && max > 0;
  return { current, max, source, found: current != null || enabled, enabled };
}

export function extractFishingIds(response, requestAction) {
  const ids = {
    actionToken: null,
    fishId: null,
    sessionHint: null,
    castId: null,
    requestAction: typeof requestAction === "string" ? requestAction : null,
    ended: false,
    started: false,
  };
  if (response == null || typeof response !== "object") return ids;
  const body = response.data ?? response;
  const run = body.run ?? {};
  const entity = body.entity ?? {};
  const token = response.actionToken ?? body.actionToken ?? run.actionToken;
  if (token != null) ids.actionToken = String(token);
  const fishId =
    entity.FISH_CID ??
    entity.FISH_ID_CID ??
    entity.FISHING_CID ??
    body.fishId ??
    body.fish_id ??
    body.castId ??
    body.fishingSessionId ??
    (body.fish && (body.fish.id ?? body.fish.cid));
  if (fishId != null) ids.fishId = String(fishId);
  const castId = body.castId ?? body.fishingSessionId ?? entity.CAST_CID;
  if (castId != null) ids.castId = String(castId);
  const runId = run.DUNGEON_ID_CID ?? entity.DUNGEON_ID_CID ?? body.runId ?? body.dungeonId;
  if (runId != null) ids.sessionHint = String(runId);
  const action = ids.requestAction ?? "";
  ids.started = isFishingActionName(action) && /start|cast/i.test(action);
  const doc = extractFishingDoc(response);
  const state = extractFishingGameState(response);
  const events = body.events ?? response.events;
  // Live fishing docs always include a complete-flag key; only true values end the session.
  if (doc || state) {
    ids.ended = false;
    if (doc && doc.COMPLETE_CID === true) ids.ended = true;
    if (doc && doc.SUCCESS_CID && (doc.COMPLETE_CID === true || doc.COMPLETE === true)) ids.ended = true;
    if (Array.isArray(events)) {
      for (const raw of events) {
        const typ = String(raw?.type ?? raw?.name ?? raw?.event ?? "").toUpperCase();
        if (typ.includes("FISH_ESCAPED") || typ === "ESCAPED") ids.ended = true;
        if (typ.includes("FISH_CAUGHT") || typ.includes("CATCH_SUCCESS") || typ.includes("FISH_CAUGHT_SUCCESS")) {
          ids.ended = true;
        }
      }
    }
    // Do not treat fishHp<=0 / fishHp==fishMaxHp as ended — those are catch-meter
    // values, not completion. Only COMPLETE_CID === true or FISH_ESCAPED / FISH_CAUGHT.
  } else {
    const blob = safeJsonKeys(response);
    ids.ended = /escaped|caught|complete|finished|ended/i.test(blob) && /fish/i.test(blob);
  }
  return ids;
}

function classifyTile(value) {
  if (value == null || value === false) return "empty";
  if (value === true) return "hit";
  if (typeof value === "string") {
    const s = value.toLowerCase();
    if (/crit|yellow|gold|orange/.test(s)) return "crit";
    if (/hit|blue|normal|success/.test(s)) return "hit";
    if (/miss|red|grey|gray|fail|x\b/.test(s)) return "miss";
  }
  if (typeof value === "number") {
    if (value >= 2) return "crit";
    if (value === 1) return "hit";
    if (value <= 0) return "miss";
  }
  if (typeof value === "object") {
    return classifyTile(value.type ?? value.kind ?? value.color ?? value.result ?? value.state);
  }
  return "empty";
}

function pushOffset(target, dx, dy, kind) {
  if (dx === 0 && dy === 0) {
    target.missCenter = true;
    return;
  }
  if (dx < -1 || dx > 1 || dy < -1 || dy > 1) return;
  const list = kind === "crit" ? target.critOffsets : target.hitOffsets;
  if (!list.some((o) => o.dx === dx && o.dy === dy)) list.push({ dx, dy });
}

function ingestPatternGrid(target, grid) {
  if (!Array.isArray(grid)) return false;
  if (grid.length === 9) {
    grid.forEach((value, i) => {
      const off = localCellToOffset(i + 1);
      if (!off) return;
      const kind = classifyTile(value);
      if (kind === "miss" || (off.dx === 0 && off.dy === 0)) {
        target.missCenter = true;
        return;
      }
      if (kind === "crit") pushOffset(target, off.dx, off.dy, "crit");
      else if (kind === "hit") pushOffset(target, off.dx, off.dy, "hit");
    });
    return true;
  }
  if (grid.length === 3 && Array.isArray(grid[0])) {
    for (let y = 0; y < 3; y += 1) {
      const row = grid[y] ?? [];
      for (let x = 0; x < 3; x += 1) {
        const dx = x - 1;
        const dy = y - 1;
        const kind = classifyTile(row[x]);
        if (kind === "miss" || (dx === 0 && dy === 0)) target.missCenter = true;
        else if (kind === "crit") pushOffset(target, dx, dy, "crit");
        else if (kind === "hit") pushOffset(target, dx, dy, "hit");
      }
    }
    return true;
  }
  return false;
}

export function normalizeSpellCard(raw, index = 0) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const hitOffsets = [];
  const critOffsets = [];
  const target = { hitOffsets, critOffsets, missCenter: true };
  const addLocalCells = (list, kind) => {
    const arr = Array.isArray(list) ? list : list == null ? [] : [list];
    for (const item of arr) {
      if (item && typeof item === "object" && (item.dx != null || item.dy != null)) {
        pushOffset(target, asInt(item.dx) ?? 0, asInt(item.dy) ?? 0, kind);
        continue;
      }
      if (item && typeof item === "object" && (item.x != null || item.col != null)) {
        const x = asInt(item.x ?? item.col ?? item.column);
        const y = asInt(item.y ?? item.row);
        if (x != null && y != null) pushOffset(target, x - 1, y - 1, kind);
        continue;
      }
      const n = asInt(item);
      if (n != null) {
        // hitZones/critZones are local 1-9. Only bare 0 is 0-indexed.
        const off = localCellToOffset(n) ?? (n === 0 ? localCellToOffset(1) : null);
        if (off) pushOffset(target, off.dx, off.dy, kind);
      }
    }
  };
  addLocalCells(raw.hits ?? raw.hitZones ?? raw.hitCells ?? raw.hitBoxes ?? raw.blue ?? raw.tiles ?? raw.covered, "hit");
  addLocalCells(raw.crits ?? raw.critZones ?? raw.critCells ?? raw.yellow ?? raw.gold ?? raw.critical, "crit");
  const patternGrid =
    raw.grid ?? raw.pattern ?? raw.hitGrid ?? raw.cells ?? raw.board ?? raw.hitboxes ?? raw.layout;
  ingestPatternGrid(target, patternGrid);
  // Keep existing parsers; do not invent fake cells. Accept Unity 3x3 pattern arrays
  // even when they live on `cells` / `hitGrid` rather than `grid`/`pattern`.
  if (hitOffsets.length + critOffsets.length === 0) return null;
  const mana = asFinite(raw.mana ?? raw.cost ?? raw.manaCost ?? raw.MANA ?? raw.energyCost) ?? 0;
  const hitValue = asFinite(raw.hitValue ?? raw.hit ?? raw.damage ?? raw.multiplier ?? raw.hitAmount) ?? 1;
  const critValue =
    asFinite(raw.critValue ?? raw.crit ?? raw.critHit ?? raw.critAmount) ?? Math.max(2, hitValue * 2);
  const missValue = Math.abs(asFinite(raw.missValue ?? raw.miss ?? raw.missAmount) ?? 1);
  const name = raw.name ?? raw.title ?? raw.spellName ?? raw.displayName ?? raw.id ?? `Card ${index + 1}`;
  const id = raw.id ?? raw.cid ?? raw.spellId ?? raw.instanceId ?? raw.cardId ?? index;
  const hits = hitOffsets
    .map((o) => (o.dy + 1) * 3 + (o.dx + 1) + 1)
    .filter((c) => c >= 1 && c <= 9)
    .sort((a, b) => a - b);
  const crits = critOffsets
    .map((o) => (o.dy + 1) * 3 + (o.dx + 1) + 1)
    .filter((c) => c >= 1 && c <= 9)
    .sort((a, b) => a - b);
  return {
    index,
    id: String(id),
    name: String(name),
    mana,
    hitOffsets: hitOffsets.slice(),
    critOffsets: critOffsets.slice(),
    hits,
    crits,
    misses: [5],
    hitValue,
    critValue,
    missValue,
  };
}

export function looksLikeCardObject(obj) {
  if (!obj || typeof obj !== "object" || Array.isArray(obj)) return false;
  return (
    obj.pattern != null ||
    obj.cells != null ||
    obj.hits != null ||
    obj.grid != null ||
    obj.mana != null ||
    obj.hitCells != null ||
    obj.hitZones != null ||
    obj.crits != null ||
    obj.critZones != null ||
    obj.hitGrid != null ||
    obj.hitboxes != null ||
    obj.layout != null ||
    obj.manaCost != null ||
    obj.cost != null
  );
}

export function extractFishingHand(response) {
  const cards = [];
  let mana = null;
  let manaMax = null;
  let catchMeter = null;
  let catchMax = null;
  let revealedCell = null;
  const seen = new Set();
  const considerCard = (raw, index) => {
    const card = normalizeSpellCard(raw, index);
    if (!card) return;
    const key = `${card.id}:${card.hitOffsets.map((o) => `${o.dx},${o.dy}`).join(";")}`;
    if (seen.has(key)) return;
    seen.add(key);
    cards.push(card);
  };
  const state = extractFishingGameState(response);
  if (state && Array.isArray(state.hand)) {
    mana = asFinite(state.playerHp);
    manaMax = asFinite(state.playerMaxHp);
    catchMeter = asFinite(state.fishHp);
    catchMax = asFinite(state.fishMaxHp);
    const catalog = Array.isArray(state.deckCardData)
      ? state.deckCardData
      : state.deckCardData && typeof state.deckCardData === "object"
        ? Object.values(state.deckCardData)
        : [];
    state.hand.forEach((id, i) => {
      const row = catalog.find((c) => c && (c.id === id || String(c.id) === String(id)));
      if (!row || typeof row !== "object") return;
      const hitAmt = fishHpAmount(row.hitEffects);
      const missAmt = fishHpAmount(row.missEffects);
      const critAmt = fishHpAmount(row.critEffects);
      considerCard(
        {
          ...row,
          hits: row.hitZones,
          crits: row.critZones,
          manaCost: row.manaCost,
          hitValue: hitAmt ?? undefined,
          missValue: missAmt != null ? Math.abs(missAmt) : undefined,
          critValue: critAmt ?? undefined,
        },
        i,
      );
    });
    return { cards, mana, manaMax, catchMeter, catchMax, revealedCell };
  }
  walk(response, "", (key, value, path) => {
    const fishingParent = fishingParentScore(path, key) >= 10;
    if (HAND_KEY_RE.test(key) && Array.isArray(value)) value.forEach((item, i) => considerCard(item, i));
    if (fishingParent && Array.isArray(value) && value.length && value.length <= 8) {
      value.forEach((item, i) => considerCard(item, i));
    }
    // Unity often nests a 3-6 card array without a `hand`/`cards` key.
    if (
      Array.isArray(value) &&
      value.length >= 3 &&
      value.length <= 6 &&
      value.every((item) => looksLikeCardObject(item))
    ) {
      value.forEach((item, i) => considerCard(item, i));
    }
    if (/^(mana|currentmana|manacurrent)$/i.test(key) && fishingParent && !/hand\[|cards\[|spells\[/i.test(path)) {
      const n = asFinite(value);
      if (n != null) mana = n;
    }
    if (/^(catch|catchmeter|capture|progress|points)$/i.test(key) && fishingParent) {
      if (typeof value === "object" && value) {
        const cur = asFinite(value.current ?? value.value ?? value.now);
        const max = asFinite(value.max ?? value.currentMax);
        if (cur != null) catchMeter = cur;
        if (max != null) catchMax = max;
      } else {
        const n = asFinite(value);
        if (n != null) catchMeter = n;
      }
    }
    if (/fintuition|revealed|nextcell|nexttile|hintcell|predictedcell/i.test(key)) {
      const parsed = parseBoardPosition(value?.cell ?? value?.position ?? value, sizeForBoard(detectFishingBoard(null, response) ?? 4));
      if (parsed.cell != null) revealedCell = parsed.cell;
    }
  });
  return { cards, mana, manaMax, catchMeter, catchMax, revealedCell };
}

export function redactForLog(value) {
  if (value == null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.slice(0, 20).map(redactForLog);
  const out = {};
  for (const [k, v] of Object.entries(value)) {
    if (SENSITIVE_KEY_RE.test(k)) continue;
    out[k] = typeof v === "object" ? redactForLog(v) : v;
  }
  return out;
}

export function isActiveFishingSession(session, extras = {}) {
  if (!session || session.endedAt) return false;
  if (session.currentPos || session.currentCell != null) return true;
  if (session.bobberPos || session.bobberCell != null) return true;
  const hand = extras.hand ?? session.hand ?? [];
  const mana = extras.mana ?? session.mana;
  if (Array.isArray(hand) && hand.length >= 3 && (extras.fishingUi || mana != null)) return true;
  if (Array.isArray(hand) && hand.length > 0 && mana != null) return true;
  if (session.lastAction && isFishingActionName(session.lastAction)) return true;
  return false;
}

export function visibleFishingOverlay({ inFishing, inCombat }) {
  return Boolean(inFishing) && !Boolean(inCombat);
}
