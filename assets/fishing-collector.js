/**
 * Fishing collector — separate IndexedDB (gfp), does not touch combat stores.
 */
import {
  applyBobberPosition,
  applyFishPosition,
  emptySession,
  extractBobberPosition,
  extractFishPosition,
  extractFishingHand,
  extractFishingIds,
  extractFocus,
  isActiveFishingSession,
  isFishingActionName,
  isDungeonGameUrl,
  looksLikeFishingPayload,
  shouldClearFishingForCapture,
  predictFishing,
  redactForLog,
  SENSITIVE_KEY_RE,
  sessionShouldEnd,
  shouldOpenNewSession,
  summarizeFishingStats,
  detectFishingBoard,
} from "./fishing.js";
import { sanitizeForCommunity, validateCommunityRecord } from "./community.js";

const DB_NAME = "gfp";
const DB_VERSION = 2;
const STORE_SESSIONS = "sessions";
const STORE_META = "meta";
const STORE_COMMUNITY = "community";
const META_KEY = "state";

function openDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onerror = () => reject(request.error ?? new Error("gfp open failed"));
    request.onsuccess = () => resolve(request.result);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_SESSIONS)) {
        const store = db.createObjectStore(STORE_SESSIONS, { keyPath: "id" });
        store.createIndex("startedAt", "startedAt", { unique: false });
      }
      if (!db.objectStoreNames.contains(STORE_META)) {
        db.createObjectStore(STORE_META, { keyPath: "key" });
      }
      if (!db.objectStoreNames.contains(STORE_COMMUNITY)) {
        const c = db.createObjectStore(STORE_COMMUNITY, { keyPath: "id" });
        c.createIndex("board", "board", { unique: false });
      }
    };
  });
}

function reqToPromise(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function putSession(session) {
  const db = await openDb();
  const tx = db.transaction(STORE_SESSIONS, "readwrite");
  tx.objectStore(STORE_SESSIONS).put(session);
  await new Promise((resolve, reject) => {
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
}

export async function getAllFishingSessions() {
  const db = await openDb();
  const tx = db.transaction(STORE_SESSIONS, "readonly");
  const rows = await reqToPromise(tx.objectStore(STORE_SESSIONS).getAll());
  return Array.isArray(rows) ? rows : [];
}

export async function getFishingMeta() {
  const db = await openDb();
  const tx = db.transaction(STORE_META, "readonly");
  const row = await reqToPromise(tx.objectStore(STORE_META).get(META_KEY));
  return row ?? { key: META_KEY, currentSessionId: null, lastPrediction: null, inFishing: false };
}

async function setFishingMeta(patch) {
  const prev = await getFishingMeta();
  const next = { ...prev, key: META_KEY, ...patch };
  const db = await openDb();
  const tx = db.transaction(STORE_META, "readwrite");
  tx.objectStore(STORE_META).put(next);
  await new Promise((resolve, reject) => {
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
  return next;
}

export async function clearFishingData() {
  const db = await openDb();
  const names = [STORE_SESSIONS, STORE_META];
  if (db.objectStoreNames.contains(STORE_COMMUNITY)) names.push(STORE_COMMUNITY);
  const tx = db.transaction(names, "readwrite");
  tx.objectStore(STORE_SESSIONS).clear();
  tx.objectStore(STORE_META).put({
    key: META_KEY,
    currentSessionId: null,
    lastPrediction: null,
    inFishing: false,
  });
  if (db.objectStoreNames.contains(STORE_COMMUNITY)) {
    tx.objectStore(STORE_COMMUNITY).clear();
  }
  await new Promise((resolve, reject) => {
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
}

export async function upsertCommunityFishing(records) {
  const list = Array.isArray(records) ? records : [];
  let saved = 0;
  let skipped = 0;
  const db = await openDb();
  if (!db.objectStoreNames.contains(STORE_COMMUNITY)) {
    return { saved: 0, skipped: list.length, reason: "no_store" };
  }
  for (const rec of list) {
    const v = validateCommunityRecord(rec);
    if (!v.ok || rec.kind !== "fishing") {
      skipped += 1;
      continue;
    }
    const existing = await reqToPromise(
      db.transaction(STORE_COMMUNITY, "readonly").objectStore(STORE_COMMUNITY).get(rec.id),
    );
    if (existing) {
      skipped += 1;
      continue;
    }
    const tx = db.transaction(STORE_COMMUNITY, "readwrite");
    tx.objectStore(STORE_COMMUNITY).put({ ...rec, source: "community", importedAt: new Date().toISOString() });
    await new Promise((resolve, reject) => {
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
    saved += 1;
  }
  return { saved, skipped };
}

export async function getCommunityFishing(board = null) {
  const db = await openDb();
  if (!db.objectStoreNames.contains(STORE_COMMUNITY)) return [];
  const tx = db.transaction(STORE_COMMUNITY, "readonly");
  const rows = await reqToPromise(tx.objectStore(STORE_COMMUNITY).getAll());
  const list = Array.isArray(rows) ? rows : [];
  if (board === 3 || board === 4) return list.filter((r) => r.board === board);
  return list;
}

function gfpLog(debug, ...args) {
  if (!debug) return;
  console.log("[GFP]", ...args);
}

export function buildFishingView(session, extras = {}) {
  const hand = extras.hand ?? session?.hand ?? [];
  const mana = extras.mana ?? session?.mana ?? null;
  const catchMeter = extras.catchMeter ?? session?.catchMeter ?? null;
  const catchMax = extras.catchMax ?? session?.catchMax ?? null;
  const revealedCell = extras.revealedCell ?? session?.revealedCell ?? null;
  const bobberPos = extras.bobberPos ?? session?.bobberPos ?? null;
  const focus = extras.focus ?? session?.focus ?? null;
  const focusFound = extras.focusFound ?? session?.focusFound ?? false;
  if (!session) {
    return {
      status: "Waiting for fishing...",
      currentCell: null,
      currentPos: null,
      bobberCell: null,
      history: [],
      mode: "UNKNOWN",
      confidence: "none",
      nextDistance: null,
      possibleCells: [],
      recommendation: "Waiting for fishing...",
      recommendedCard: null,
      cardAdvice: null,
      hand,
      mana,
      manaMax: extras.manaMax ?? null,
      catchMeter,
      inFishing: false,
      source: null,
      diagnostic: null,
      focusAssumption: true,
      board: null,
    };
  }
  const sessionDists = (session.movements ?? []).map((m) => m.distance).filter((d) => d === 1 || d === 2);
  // Same-board community prior only when the live session is still short (do not mix board 3↔4).
  const communityDists = Array.isArray(extras.communityDistances)
    ? extras.communityDistances.filter((d) => d === 1 || d === 2)
    : [];
  const distances =
    sessionDists.length >= 2
      ? sessionDists
      : [...communityDists.slice(-12), ...sessionDists];
  const pred = predictFishing({
    currentPos: session.currentPos,
    distances,
    hand,
    mana,
    catchMeter,
    revealedCell,
    bobberPos,
    focus,
    focusFound,
    board: session.board ?? extras.board ?? null,
  });
  const active = isActiveFishingSession(session, {
    hand,
    mana,
    revealedCell,
    fishingUi: extras.fishingUi,
  });
  const fishLabel =
    pred.currentCell != null && pred.currentPos
      ? `Fish: cell ${pred.currentCell} (${pred.currentPos.x},${pred.currentPos.y})`
      : session.endedAt
        ? "Fishing ended"
        : hand.length < 3 && pred.currentCell == null
          ? "Fishing · waiting for hand/API"
          : pred.currentCell == null && (hand.length || bobberPos)
            ? "Fish: unknown"
            : "Fishing detected";
  return {
    status: fishLabel,
    currentCell: pred.currentCell,
    currentPos: pred.currentPos,
    bobberCell: pred.bobberCell,
    bobberPos: pred.bobberPos,
    history: pred.history,
    mode: pred.mode,
    confidence: pred.confidence,
    nextDistance: pred.nextDistance,
    possibleCells: pred.possibleCells,
    recommendation: pred.recommendation,
    recommendedCard: pred.recommendedCard,
    recommendedBobber: pred.recommendedBobber,
    cardAdvice: pred.recommendation,
    cardPick: pred.cardPick,
    advice: pred.advice,
    why: pred.advice?.why ?? null,
    patternAscii: pred.advice?.patternAscii ?? null,
    hand,
    mana,
    manaMax: extras.manaMax ?? session.manaMax ?? null,
    catchMeter,
    catchMax,
    focus,
    focusMax: session.focusMax ?? null,
    focusFound,
    focusAssumption: pred.focusAssumption,
    revealedCell,
    inFishing: active,
    sessionId: session.id,
    fishId: session.fishId,
    detectedMode: session.detectedMode,
    board: session.board ?? pred.board ?? null,
    gridSize: session.gridSize ?? session.board ?? pred.board ?? null,
    label: pred.label,
  };
}

async function communityDistancesForBoard(board) {
  if (board !== 3 && board !== 4) return [];
  const rows = await getCommunityFishing(board);
  return rows.map((r) => r.distance).filter((d) => d === 1 || d === 2);
}

async function viewForSession(session, extras = {}) {
  const board = session?.board ?? detectFishingBoard(session);
  const communityDistances =
    extras.communityDistances ?? (await communityDistancesForBoard(board));
  return buildFishingView(session, { ...extras, communityDistances });
}

function patchSessionResources(session, handInfo, focusInfo, bobber, requestAction, response = null) {
  let next = { ...session, lastAction: requestAction ?? session.lastAction };
  const board = detectFishingBoard(next, response, requestAction);
  if (board === 3 || board === 4) next.board = board;
  if (handInfo.cards.length) next.hand = handInfo.cards;
  if (handInfo.mana != null) next.mana = handInfo.mana;
  if (handInfo.manaMax != null) next.manaMax = handInfo.manaMax;
  if (handInfo.catchMeter != null) next.catchMeter = handInfo.catchMeter;
  if (handInfo.catchMax != null) next.catchMax = handInfo.catchMax;
  if (handInfo.revealedCell != null) next.revealedCell = handInfo.revealedCell;
  if (focusInfo.found) {
    next.focus = focusInfo.current;
    next.focusMax = focusInfo.max;
    next.focusFound = true;
  }
  if (bobber.pos && next.board !== 3) {
    const applied = applyBobberPosition(next, bobber.pos, {
      requestAction,
      focus: next.focus,
      focusMax: next.focusMax,
      focusFound: next.focusFound,
    });
    next = applied.session;
  }
  const endReason = sessionShouldEnd({
    mana: next.mana,
    catchMeter: next.catchMeter,
    catchMax: next.catchMax,
  });
  if (endReason && !next.endedAt) {
    next = { ...next, endedAt: new Date().toISOString(), endReason };
  }
  return next;
}

export async function ingestFishingCapture(payload, options = {}) {
  const debug = Boolean(options.debug);
  const forceHide = Boolean(options.forceHide || options.inCombat);
  const url = payload?.url ?? "";
  const requestAction = payload?.requestAction ?? null;
  const response = payload?.response;
  const capturedAt = payload?.capturedAt ?? new Date().toISOString();

  if (isDungeonGameUrl(url)) {
    return {
      handled: false,
      reason: "dungeon_url",
      inFishing: false,
      view: null,
      diagnostic: {
        at: capturedAt,
        urlPath: safePath(url),
        requestAction,
        reason: "dungeon_url",
      },
    };
  }

  const fishingLike = looksLikeFishingPayload(response, requestAction, url);
  // FISHING_GAME / gamewebui must never force-hide fishing (playerHp is mana).
  // Fishing-like payloads must never be force-hidden by leftover combat `run.players`.
  if (shouldClearFishingForCapture({ forceHide, response, requestAction, url })) {
    const diagnostic = {
      at: capturedAt,
      urlPath: safePath(url),
      requestAction,
      keys: collectSafeKeys(response),
      reason: forceHide ? "in_combat" : "combat_payload",
    };
    const cleared = await clearFishingUiState({ reason: diagnostic.reason, lastDiagnostic: diagnostic });
    return { handled: false, reason: cleared.reason, inFishing: false, view: null, diagnostic };
  }

  const boardHint = detectFishingBoard(null, response, requestAction);
  const extracted = extractFishPosition(response, { board: boardHint, requestAction });
  const bobber = extractBobberPosition(response);
  const focusInfo = extractFocus(response);
  const ids = extractFishingIds(response, requestAction);
  const handInfo = extractFishingHand(response);
  const shouldOpen =
    fishingLike ||
    focusInfo.found ||
    handInfo.mana != null ||
    handInfo.catchMeter != null ||
    isFishingActionName(requestAction);

  if (!shouldOpen && !extracted.pos && !bobber.pos) {
    const diagnostic = {
      at: capturedAt,
      urlPath: safePath(url),
      requestAction,
      keys: collectSafeKeys(response),
      reason: "not_fishing",
    };
    await setFishingMeta({ lastDiagnostic: diagnostic });
    return { handled: false, reason: "not_fishing", inFishing: false, diagnostic };
  }

  gfpLog(debug, "Fishing detected", requestAction ?? "");
  if (extracted.cell != null) gfpLog(debug, "Fish position:", extracted.cell, extracted.source);
  if (extracted.diagnostic) gfpLog(debug, "Fish diagnostic:", extracted.diagnostic);
  if (bobber.cell != null) gfpLog(debug, "Bobber:", bobber.cell, bobber.source);
  if (focusInfo.found) gfpLog(debug, "Focus:", focusInfo.current, focusInfo.source);
  else gfpLog(debug, "Focus not in API — bobber move unconstrained (assumption)");

  const sessions = await getAllFishingSessions();
  const meta = await getFishingMeta();
  let session = sessions.find((s) => s.id === meta.currentSessionId) ?? null;
  const inferredBoard =
    boardHint ?? extracted.board ?? (bobber.pos || focusInfo.found ? 4 : null);
  if (session && !session.board && inferredBoard) session = { ...session, board: inferredBoard };

  const diagnostic = {
    at: capturedAt,
    urlPath: safePath(url),
    requestAction,
    keys: collectSafeKeys(response),
    ids: { fishId: ids.fishId, actionToken: ids.actionToken ? "present" : null },
    fishDiagnostic: extracted.diagnostic ?? null,
    reason: extracted.pos || bobber.pos ? "ok" : "diagnostic_only",
  };

  if (!extracted.pos && !bobber.pos) {
    gfpLog(debug, "No fish/bobber pos — diagnostic only");
    if ((!session || session.endedAt) && shouldOpen) {
      session = emptySession({
        startedAt: capturedAt,
        board: inferredBoard,
        fishId: ids.fishId,
        sessionHint: ids.sessionHint,
        lastAction: requestAction ?? "fishing",
      });
    }
    if (session && !session.endedAt) {
      session = patchSessionResources(session, handInfo, focusInfo, bobber, requestAction, response);
      await putSession(session);
    }
    const view = await viewForSession(session, { fishingUi: fishingLike, board: session?.board });
    const active = Boolean(view.inFishing);
    await setFishingMeta({
      currentSessionId: session?.id ?? meta.currentSessionId ?? null,
      inFishing: active,
      lastDiagnostic: diagnostic,
      lastPrediction: keepFishingView(session, view, active),
      lastHand: handInfo.cards.length ? handInfo.cards : meta.lastHand ?? null,
    });
    return {
      handled: true,
      reason: "diagnostic_only",
      inFishing: active,
      view: keepFishingView(session, view, active),
      diagnostic,
    };
  }

  if (shouldOpenNewSession(session, ids, capturedAt)) {
    if (session && !session.endedAt) {
      session = { ...session, endedAt: capturedAt };
      await putSession(session);
    }
    session = emptySession({
      fishId: ids.fishId,
      castId: ids.castId,
      sessionHint: ids.sessionHint,
      startedAt: capturedAt,
      board: boardHint ?? extracted.board ?? (bobber.pos || focusInfo.found ? 4 : null),
      lastAction: requestAction ?? "fishing",
    });
    gfpLog(debug, "New session:", session.id);
  }

  if (extracted.pos) {
    if (!session.board && extracted.board) session = { ...session, board: extracted.board };
    if (!session.currentPos && extracted.previousPos) {
      const seeded = applyFishPosition(session, extracted.previousPos, {
        timestamp: capturedAt,
        fishId: ids.fishId,
      });
      session = seeded.session;
    }
    const applied = applyFishPosition(session, extracted.pos, {
      timestamp: capturedAt,
      actionToken: ids.actionToken,
      fishId: ids.fishId,
    });
    session = applied.session;
    if (applied.accepted && applied.movement) {
      gfpLog(debug, "Fish moved:", applied.movement.to.cell, "d=", applied.movement.distance);
    } else if (!applied.accepted) {
      gfpLog(debug, "Fish pos ignored:", applied.reason);
    }
  }

  session = patchSessionResources(session, handInfo, focusInfo, bobber, requestAction, response);
  if (ids.ended && !session.endedAt) session = { ...session, endedAt: capturedAt };
  if (ids.castId) session.castId = ids.castId;
  await putSession(session);

  const view = await viewForSession(session);
  view.source = extracted.source ?? bobber.source;
  await setFishingMeta({
    currentSessionId: session.id,
    lastPrediction: keepFishingView(session, view, Boolean(view.inFishing)),
    inFishing: Boolean(view.inFishing),
    lastDiagnostic: diagnostic,
  });

  gfpLog(debug, "Mode:", view.mode, view.confidence);
  if (view.possibleCells?.length) gfpLog(debug, "Predicted cells:", view.possibleCells.join(","));
  if (view.recommendation) gfpLog(debug, view.recommendation);

  return {
    handled: true,
    inFishing: Boolean(view.inFishing),
    view: keepFishingView(session, view, Boolean(view.inFishing)),
    diagnostic,
  };
}

export async function clearFishingUiState(options = {}) {
  const reason = options.reason ?? "cleared";
  const patch = { inFishing: false, lastPrediction: null };
  if (options.lastDiagnostic) patch.lastDiagnostic = options.lastDiagnostic;
  await setFishingMeta(patch);
  return { reason, inFishing: false, view: null };
}

export async function getFishingStatus() {
  const sessions = await getAllFishingSessions();
  const meta = await getFishingMeta();
  const current = sessions.find((s) => s.id === meta.currentSessionId) ?? null;
  const view = meta.lastPrediction ?? (await viewForSession(current));
  const sessionActive = isActiveFishingSession(current, {
    hand: view?.hand ?? current?.hand,
    mana: view?.mana ?? current?.mana,
    fishingUi: Boolean(view?.inFishing),
  });
  const inFishing = sessionActive || Boolean(meta.inFishing) || Boolean(view?.inFishing);
  const community3 = await getCommunityFishing(3);
  const community4 = await getCommunityFishing(4);
  // lastPrediction is cleared on hub/combat; do not revive overlay from a stored
  // session just because currentPos still exists after returning to the hub.
  const overlayView = meta.lastPrediction ?? (inFishing ? view : null);
  return {
    ok: true,
    view: overlayView,
    stats: summarizeFishingStats(sessions, {
      communityByBoard: { 3: community3.length, 4: community4.length },
    }),
    inFishing,
    sessionCount: sessions.length,
    lastDiagnostic: meta.lastDiagnostic ?? null,
    communityFishing: { board3: community3.length, board4: community4.length },
  };
}

function safePath(url) {
  try {
    return new URL(url, "https://gigaverse.io").pathname;
  } catch {
    return String(url).split("?")[0];
  }
}

function collectSafeKeys(value, depth = 0, acc = []) {
  if (value == null || typeof value !== "object" || depth > 4) return acc;
  const obj = Array.isArray(value) ? value[0] : value;
  if (!obj || typeof obj !== "object") return acc;
  for (const k of Object.keys(obj)) {
    if (SENSITIVE_KEY_RE.test(k)) continue;
    acc.push(k);
    collectSafeKeys(obj[k], depth + 1, acc);
  }
  return [...new Set(acc)].slice(0, 40);
}


function keepFishingView(session, view, inFishing) {
  // Never persist a sticky fish-cell view when the session is idle — that caused
  // Loading/combat false-positive overlays via lastPrediction.
  if (inFishing && view) return view;
  return null;
}

function redactFishingSession(session) {
  const s = sanitizeForCommunity(session ?? {});
  if (Array.isArray(s.seenTokens)) s.seenTokens = s.seenTokens.map(() => "present");
  if (Array.isArray(s.seenFingerprints)) {
    s.seenFingerprints = s.seenFingerprints.map((fp) =>
      typeof fp === "string" && fp.startsWith("tok:") ? "tok:redacted" : fp,
    );
  }
  return s;
}

/** Raw gfp sessions for debug ingest — no actionToken / jwt / cookie values. */
export async function exportFishingDebugPayload() {
  const sessions = await getAllFishingSessions();
  const meta = await getFishingMeta();
  return {
    exportedAt: new Date().toISOString(),
    sessions: sessions.map(redactFishingSession),
    meta: {
      lastDiagnostic: meta.lastDiagnostic ?? null,
      inFishing: Boolean(meta.inFishing),
      currentSessionId: meta.currentSessionId ?? null,
      sessionCount: sessions.length,
    },
  };
}

export { redactForLog };

export async function ingestFishingHandUi(cards, extras = {}) {
  const debug = Boolean(extras.debug);
  // Stale meta.inCombat must not block a live fishing UI. Caller should pass
  // inCombat:false when fishingUi is true.
  if (extras.inCombat && !extras.fishingUi) {
    const cleared = await clearFishingUiState({ reason: "hand_ui_in_combat" });
    return { ok: true, view: null, inFishing: false, reason: cleared.reason };
  }
  const meta = await getFishingMeta();
  const sessions = await getAllFishingSessions();
  let session = sessions.find((s) => s.id === meta.currentSessionId) ?? null;
  const parsedCards = Array.isArray(cards) ? cards : [];
  if (!session || session.endedAt) {
    if (extras.fishingUi) {
      const board =
        extras.board === 3 || extras.board === 4
          ? extras.board
          : 4; // Dendren default when UI says fishing (16-cell / bobber / focus)
      session = emptySession({
        startedAt: new Date().toISOString(),
        board,
        lastAction: "fishing",
      });
      gfpLog(debug, "Session from fishing UI", parsedCards.length, "board", board);
    } else {
      return { ok: true, view: null, inFishing: false, reason: "no_session" };
    }
  }
  session = {
    ...session,
    hand: parsedCards.length ? parsedCards : session.hand,
    mana: extras.mana ?? session.mana,
    catchMeter: extras.catchMeter ?? session.catchMeter,
    revealedCell: extras.revealedCell ?? session.revealedCell,
    lastAction: extras.lastAction ?? session.lastAction ?? "fishing",
  };
  if (extras.board === 3 || extras.board === 4) session.board = extras.board;
  else if (!session.board) session.board = 4;
  await putSession(session);
  const view = await viewForSession(session, {
    hand: parsedCards.length ? parsedCards : session.hand,
    mana: extras.mana ?? session.mana,
    catchMeter: extras.catchMeter,
    revealedCell: extras.revealedCell,
    fishingUi: extras.fishingUi,
    board: session.board,
  });
  await setFishingMeta({
    currentSessionId: session.id,
    lastPrediction: view.inFishing ? view : null,
    lastHand: parsedCards.length ? parsedCards : meta.lastHand ?? null,
    inFishing: Boolean(view.inFishing),
  });
  if (view.recommendedCard) gfpLog(debug, "Play card:", view.recommendedCard.name);
  return { ok: true, view: view.inFishing ? view : null, inFishing: Boolean(view.inFishing) };
}
