/**
 * Community dataset helpers — pure logic, no chrome, no network, no secrets.
 * Schema v1 jsonl records for shared combat/fishing knowledge.
 */
const SENSITIVE_KEY_RE =
  /authorization|cookie|jwt|token$|password|secret|bearer|wallet|address|credential/i;

const MOVE_SET = new Set(["rock", "paper", "scissor"]);

export function isSensitiveKey(key) {
  return typeof key === "string" && SENSITIVE_KEY_RE.test(key);
}

/** Deep sanitize: drop sensitive keys; never keep actionToken. */
export function sanitizeForCommunity(value, depth = 0) {
  if (value == null || depth > 8) return value;
  if (Array.isArray(value)) return value.map((v) => sanitizeForCommunity(v, depth + 1));
  if (typeof value !== "object") return value;
  const out = {};
  for (const [k, v] of Object.entries(value)) {
    if (isSensitiveKey(k)) continue;
    if (/^actionToken$/i.test(k)) continue;
    out[k] = sanitizeForCommunity(v, depth + 1);
  }
  return out;
}

export function communityExportContainsSecrets(text) {
  if (typeof text !== "string") return false;
  return /actionToken|"jwt"|"cookie"|Bearer |0x[a-fA-F0-9]{40}/i.test(text);
}

/** SHA-256 hex. Works in SW (subtle) and Node tests. */
export async function sha256Hex(text) {
  const data = String(text);
  if (typeof globalThis.crypto?.subtle?.digest === "function") {
    const buf = await globalThis.crypto.subtle.digest("SHA-256", new TextEncoder().encode(data));
    return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
  }
  const { createHash } = await import("node:crypto");
  return createHash("sha256").update(data).digest("hex");
}

export function makeFightId(dungeonId, roomNumber, enemyCid, roomSeq = null) {
  const room = roomNumber ?? roomSeq ?? "na";
  return `${dungeonId ?? "na"}:${room}:${enemyCid ?? "na"}`;
}

/** Model key: dungeon type MUST be part of the key so Normal ≠ Underhaul. */
export function combatModelKey(dungeonId, enemyCid, loadoutIds, enemyMaxHp) {
  const cid = enemyCid ?? enemyMaxHp ?? null;
  if (cid == null) return `d${dungeonId ?? "x"}:unknown`;
  const base = `d${dungeonId ?? "x"}:${cid}`;
  if (!loadoutIds || loadoutIds.length === 0) return base;
  return `${base}:${loadoutIds.slice().sort().join(",")}`;
}

export async function combatCommunityId(rec) {
  const parts = [
    rec.dungeonId ?? "",
    rec.fightId ?? "",
    rec.fightRound ?? "",
    rec.playerMove ?? "",
    rec.enemyMove ?? "",
  ];
  return sha256Hex(parts.join("|"));
}

export async function fishingCommunityId(rec) {
  const parts = [
    rec.board ?? "",
    rec.sessionId ?? "",
    rec.step ?? "",
    JSON.stringify(rec.prevFish ?? null),
    JSON.stringify(rec.fish ?? null),
    JSON.stringify(rec.bobber ?? null),
    JSON.stringify(rec.card?.pattern ?? null),
  ];
  return sha256Hex(parts.join("|"));
}

function hpPair(cur, max) {
  if (cur == null && max == null) return null;
  return [cur ?? null, max ?? null];
}

function chargeMap(move) {
  return {
    rock: move.enemyRockCharges ?? move.playerRockCharges ?? null,
    paper: move.enemyPaperCharges ?? move.playerPaperCharges ?? null,
    scissor: move.enemyScissorCharges ?? move.playerScissorCharges ?? null,
  };
}

/**
 * Build a community combat record from a local MoveRecord.
 * Returns null if required fields missing.
 */
export async function combatRecordFromMove(move, extras = {}) {
  if (!move || !MOVE_SET.has(move.playerMove) || !MOVE_SET.has(move.enemyMove)) return null;
  if (move.dungeonId == null) return null;

  const fightId =
    move.fightId ??
    makeFightId(move.dungeonId, move.roomNumber, move.enemyCid, move.roomSeq ?? null);
  const fightRound = move.fightRound ?? extras.fightRound ?? null;

  const draft = {
    v: 1,
    kind: "combat",
    dungeonId: move.dungeonId,
    fightId,
    fightRound,
    enemyId: move.enemyCid ?? null,
    player: {
      hp: hpPair(move.playerHp, move.playerMaxHp),
      charges: {
        rock: move.playerRockCharges ?? null,
        paper: move.playerPaperCharges ?? null,
        scissor: move.playerScissorCharges ?? null,
      },
    },
    enemy: {
      hp: hpPair(move.enemyHp, move.enemyMaxHp),
      lastMove: move.enemyMove,
      charges: {
        rock: move.enemyRockCharges ?? null,
        paper: move.enemyPaperCharges ?? null,
        scissor: move.enemyScissorCharges ?? null,
      },
    },
    playerMove: move.playerMove,
    enemyMove: move.enemyMove,
    result: move.result ?? extras.result ?? null,
  };

  const id = await combatCommunityId(draft);
  return sanitizeForCommunity({ ...draft, id });
}

/**
 * Detect fishing board size from session/response signals.
 * 4 = Dendren (bobber/focus), 3 = pier. null = unknown (skip export).
 */
function readFishingGridSize(response) {
  if (!response || typeof response !== "object") return null;
  const stack = [response];
  const seen = new Set();
  let n = 0;
  while (stack.length && n < 80) {
    const obj = stack.pop();
    n += 1;
    if (!obj || typeof obj !== "object" || seen.has(obj)) continue;
    seen.add(obj);
    if (obj.gridSize === 3 || obj.gridSize === 4) return obj.gridSize;
    const vals = Array.isArray(obj) ? obj.slice(0, 12) : Object.values(obj).slice(0, 24);
    for (const v of vals) if (v && typeof v === "object") stack.push(v);
  }
  return null;
}

function readFocusMechanic(response) {
  if (!response || typeof response !== "object") return false;
  const stack = [response];
  const seen = new Set();
  let n = 0;
  while (stack.length && n < 80) {
    const obj = stack.pop();
    n += 1;
    if (!obj || typeof obj !== "object" || seen.has(obj)) continue;
    seen.add(obj);
    if (obj.focusMechanicEnabled === true) return true;
    const max = obj.focusMeterMax;
    if (typeof max === "number" && max > 0) return true;
    const vals = Array.isArray(obj) ? obj.slice(0, 12) : Object.values(obj).slice(0, 24);
    for (const v of vals) if (v && typeof v === "object") stack.push(v);
  }
  return false;
}

export function detectFishingBoard(session = null, response = null, requestAction = null) {
  if (typeof requestAction === "string" && /move_focus_point/i.test(requestAction)) return 4;
  if (session?.board === 3 || session?.board === 4) return session.board;
  if (session?.bobberPos || session?.bobberCell != null) return 4;
  if (session?.focusFound || session?.focus != null) return 4;

  const gs = readFishingGridSize(response);
  if (gs === 3 || gs === 4) return gs;
  if (readFocusMechanic(response)) return 4;

  const body = response?.data ?? response;
  if (body && typeof body === "object") {
    const explicit =
      body.board ??
      body.gridSize ??
      body.fishing?.board ??
      body.fishing?.gridSize ??
      body.fish?.board;
    if (explicit === 3 || explicit === 4) return explicit;
    if (body.bobber || body.focusPoint || body.fishing?.bobber || body.fishing?.focusPoint) return 4;
  }

  const cell = session?.currentCell;
  if (typeof cell === "number") {
    if (cell > 9) return 4;
    if (cell >= 1 && cell <= 9 && !session?.bobberPos) return 3;
  }
  return null;
}

function axisOf(prev, next) {
  if (!prev || !next) return null;
  if (prev.x === next.x && prev.y !== next.y) return "v";
  if (prev.y === next.y && prev.x !== next.x) return "h";
  return null;
}

/**
 * Build fishing community records from a local session.
 * A session with currentPos but no movements still emits one snapshot step
 * (first_position / movement: null). Board 4 without bobber is included (bobber: null).
 */
export async function fishingRecordsFromSession(session) {
  if (!session) return [];
  const board =
    session.gridSize === 3 || session.gridSize === 4
      ? session.gridSize
      : session.board === 3 || session.board === 4
        ? session.board
        : detectFishingBoard(session);
  if (board !== 3 && board !== 4) return [];

  const location = board === 4 ? "dendren" : "pier";
  const movements = Array.isArray(session.movements) ? session.movements : [];
  const out = [];
  const bobber = session.bobberPos ? { x: session.bobberPos.x, y: session.bobberPos.y } : null;
  const focus =
    session.focusFound || session.focus != null
      ? { cur: session.focus ?? null, max: session.focusMax ?? null }
      : null;
  const mana = session.mana != null ? { cur: session.mana, max: session.manaMax ?? null } : null;
  const catchMeter =
    session.catchMeter != null ? { cur: session.catchMeter, max: session.catchMax ?? null } : null;
  const handLength = Array.isArray(session.hand) ? session.hand.length : null;
  const sessionId = String(session.id ?? `local-${session.startedAt ?? "t"}`);

  const base = {
    v: 1,
    kind: "fishing",
    board,
    location,
    sessionId,
    bobber,
    focus,
    mana,
    catch: catchMeter,
    handLength,
    card: null,
    mode: mapDetectedMode(session.detectedMode),
  };

  const steps = [];
  if (movements.length === 0) {
    if (session.currentPos) {
      steps.push({
        step: 0,
        fish: { x: session.currentPos.x, y: session.currentPos.y },
        prevFish: null,
        distance: null,
        axis: null,
      });
    }
  } else {
    for (let i = 0; i < movements.length; i += 1) {
      const m = movements[i];
      const fish = m?.to ? { x: m.to.x, y: m.to.y } : null;
      if (!fish) continue;
      const prevFish = m?.from ? { x: m.from.x, y: m.from.y } : null;
      steps.push({
        step: i + 1,
        fish,
        prevFish,
        distance: m.distance ?? null,
        axis: axisOf(prevFish, fish),
      });
    }
  }

  for (const step of steps) {
    const draft = { ...base, ...step };
    const id = await fishingCommunityId(draft);
    out.push(sanitizeForCommunity({ ...draft, id }));
  }
  return out;
}

function mapDetectedMode(mode) {
  if (mode === "MODE_ONE") return "one";
  if (mode === "MODE_TWO") return "two";
  if (mode === "MODE_ALTERNATING") return "alternating";
  if (mode === "UNCERTAIN") return "uncertain";
  return null;
}

export function validateCommunityRecord(rec) {
  if (!rec || typeof rec !== "object") return { ok: false, reason: "not_object" };
  if (rec.v !== 1) return { ok: false, reason: "bad_version" };
  if (!rec.id || typeof rec.id !== "string") return { ok: false, reason: "missing_id" };
  if (rec.kind === "combat") {
    if (rec.dungeonId == null) return { ok: false, reason: "missing_dungeonId" };
    if (!MOVE_SET.has(rec.playerMove) || !MOVE_SET.has(rec.enemyMove)) {
      return { ok: false, reason: "bad_moves" };
    }
    return { ok: true };
  }
  if (rec.kind === "fishing") {
    if (rec.board !== 3 && rec.board !== 4) return { ok: false, reason: "bad_board" };
    if (!rec.fish || typeof rec.fish.x !== "number") return { ok: false, reason: "missing_fish" };
    // Bobber is optional on board 4 (Dendren snapshot may lack focusPoint).
    return { ok: true };
  }
  return { ok: false, reason: "bad_kind" };
}

/** Parse jsonl or JSON array; skip bad lines. */
export function parseCommunityPayload(text) {
  const raw = String(text ?? "").trim();
  const records = [];
  const errors = [];
  if (!raw) return { records, errors };

  if (raw.startsWith("[")) {
    try {
      const arr = JSON.parse(raw);
      if (!Array.isArray(arr)) return { records, errors: ["root_not_array"] };
      arr.forEach((row, i) => {
        const v = validateCommunityRecord(row);
        if (v.ok) records.push(sanitizeForCommunity(row));
        else errors.push(`row ${i}: ${v.reason}`);
      });
      return { records, errors };
    } catch (e) {
      return { records, errors: [`json_parse: ${e.message}`] };
    }
  }

  const lines = raw.split(/\r?\n/);
  lines.forEach((line, i) => {
    const t = line.trim();
    if (!t) return;
    try {
      const row = JSON.parse(t);
      const v = validateCommunityRecord(row);
      if (v.ok) records.push(sanitizeForCommunity(row));
      else errors.push(`line ${i + 1}: ${v.reason}`);
    } catch (e) {
      errors.push(`line ${i + 1}: ${e.message}`);
    }
  });
  return { records, errors };
}

export function toJsonl(records) {
  return records.map((r) => JSON.stringify(r)).join("\n") + (records.length ? "\n" : "");
}

/** Convert community combat record → MoveRecord-shaped object for IndexedDB. */
export function communityCombatToMove(rec) {
  const v = validateCommunityRecord(rec);
  if (!v.ok || rec.kind !== "combat") return null;
  return {
    id: `community:${rec.id}`,
    communityId: rec.id,
    source: "community",
    timestamp: new Date().toISOString(),
    dungeonId: rec.dungeonId,
    fightId: rec.fightId ?? makeFightId(rec.dungeonId, null, rec.enemyId),
    fightRound: rec.fightRound ?? null,
    roomNumber: null,
    enemyCid: rec.enemyId ?? null,
    playerMove: rec.playerMove,
    enemyMove: rec.enemyMove,
    playerHp: rec.player?.hp?.[0] ?? null,
    playerMaxHp: rec.player?.hp?.[1] ?? null,
    enemyHp: rec.enemy?.hp?.[0] ?? null,
    enemyMaxHp: rec.enemy?.hp?.[1] ?? null,
    playerRockCharges: rec.player?.charges?.rock ?? null,
    playerPaperCharges: rec.player?.charges?.paper ?? null,
    playerScissorCharges: rec.player?.charges?.scissor ?? null,
    enemyRockCharges: rec.enemy?.charges?.rock ?? null,
    enemyPaperCharges: rec.enemy?.charges?.paper ?? null,
    enemyScissorCharges: rec.enemy?.charges?.scissor ?? null,
    result: rec.result ?? null,
  };
}

export function partitionCommunityRecords(records) {
  const combat = [];
  const fishing = [];
  for (const r of records) {
    if (r.kind === "combat") combat.push(r);
    else if (r.kind === "fishing") fishing.push(r);
  }
  return { combat, fishing };
}

/** Pull is only allowed when a non-empty https URL is configured. */
export function canPullFromUrl(url) {
  if (typeof url !== "string" || !url.trim()) return false;
  try {
    const u = new URL(url.trim());
    return u.protocol === "https:";
  } catch {
    return false;
  }
}

void chargeMap;
