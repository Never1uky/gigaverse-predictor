/**
 * Fish move modes + session apply (pure).
 */
import {
  getReachableCells,
  isAxisAligned,
  isInBounds,
  manhattan,
  parseBoardPosition,
  posToCell,
  sizeForBoard,
  stepDistance,
} from "./fishing-grid.js";
import { chooseFishingAdvice, formatAdviceLine } from "./fishing-advisor.js";

export function detectMode(distances) {
  const ds = distances.filter((d) => d === 1 || d === 2);
  if (ds.length === 0) {
    return {
      mode: "UNKNOWN",
      confidence: "none",
      nextDistance: null,
      nextDistances: [1, 2],
      label: "No fish moves yet",
    };
  }
  const allOne = ds.every((d) => d === 1);
  const allTwo = ds.every((d) => d === 2);
  const altFrom1 = ds.every((d, i) => d === (i % 2 === 0 ? 1 : 2));
  const altFrom2 = ds.every((d, i) => d === (i % 2 === 0 ? 2 : 1));
  const isAlt = altFrom1 || altFrom2;
  if (ds.length === 1) {
    return ds[0] === 1
      ? { mode: "MODE_ONE", confidence: "low", nextDistance: 1, nextDistances: [1], label: "1-cell · low confidence" }
      : { mode: "MODE_TWO", confidence: "low", nextDistance: 2, nextDistances: [2], label: "2-cell · low confidence" };
  }
  const conf = ds.length >= 4 ? "high" : "med";
  if (allOne) return { mode: "MODE_ONE", confidence: conf, nextDistance: 1, nextDistances: [1], label: `1-cell · ${conf}` };
  if (allTwo) return { mode: "MODE_TWO", confidence: conf, nextDistance: 2, nextDistances: [2], label: `2-cell · ${conf}` };
  if (isAlt) {
    const next = ds[ds.length - 1] === 1 ? 2 : 1;
    return { mode: "MODE_ALTERNATING", confidence: conf, nextDistance: next, nextDistances: [next], label: `1-2 · ${conf}` };
  }
  return { mode: "UNCERTAIN", confidence: "low", nextDistance: null, nextDistances: [1, 2], label: "Pattern uncertain · showing 1+2" };
}

function predictedFromState(currentPos, detected, revealedCell, size) {
  const possible = [];
  if (revealedCell != null) {
    const parsed = parseBoardPosition(revealedCell, size);
    if (parsed.pos) possible.push({ pos: parsed.pos, cell: parsed.cell });
    return possible;
  }
  if (!currentPos) return possible;
  const distances = detected.nextDistances?.length
    ? detected.nextDistances
    : detected.nextDistance
      ? [detected.nextDistance]
      : [1, 2];
  const seen = new Set();
  for (const d of distances) {
    for (const p of getReachableCells(currentPos, d, size)) {
      const cell = posToCell(p, size);
      if (cell != null && !seen.has(cell)) {
        seen.add(cell);
        possible.push({ pos: p, cell });
      }
    }
  }
  return possible;
}

export function predictFishing(input = {}) {
  const { currentPos, distances, hand, mana, catchMeter, revealedCell, bobberPos, focus, focusFound, board } = input;
  const size = sizeForBoard(board);
  const detected = detectMode(distances ?? []);
  const possible = predictedFromState(currentPos, detected, revealedCell, size);
  const possibleCells = possible.map((p) => p.cell);
  const advice = chooseFishingAdvice({
    predictedCells: possibleCells,
    bobberPos: bobberPos ?? null,
    focus: focus ?? null,
    focusFound: Boolean(focusFound),
    hand: hand ?? [],
    mana,
    catchMeter,
    board: board ?? null,
  });
  return {
    ...detected,
    currentCell: currentPos ? posToCell(currentPos, size) : null,
    currentPos: currentPos ?? null,
    bobberPos: bobberPos ?? null,
    bobberCell: bobberPos ? posToCell(bobberPos, 4) : null,
    history: (distances ?? []).slice(),
    possibleCells,
    possiblePositions: possible,
    revealedCell: revealedCell ?? null,
    advice,
    cardPick: advice.cardPick,
    recommendedCard: advice.card,
    recommendedBobber: advice.bobber,
    recommendation: formatAdviceLine(advice),
    focusAssumption: advice.focusAssumption,
    board: board ?? advice.board ?? null,
  };
}

export function movementFingerprint({ sessionId, fromCell, toCell, actionToken, timestamp }) {
  if (actionToken) return `tok:${actionToken}:${fromCell ?? ""}:${toCell ?? ""}`;
  return `fp:${sessionId}:${timestamp}:${fromCell ?? ""}:${toCell ?? ""}`;
}

export function makeSessionId({ fishId, sessionHint, startedAt }) {
  return ["fish", sessionHint ?? "run", fishId ?? "unknown", startedAt ?? "t"].join(":");
}

export function applyFishPosition(session, nextPos, meta = {}) {
  const size = sizeForBoard(session.board);
  const cell = posToCell(nextPos, size);
  if (cell == null) return { session, accepted: false, reason: "unknown_position" };
  const token = meta.actionToken != null ? String(meta.actionToken) : null;
  if (token && session.seenTokens.includes(token)) return { session, accepted: false, reason: "duplicate" };
  const fingerprint = movementFingerprint({
    sessionId: session.id,
    fromCell: session.currentCell,
    toCell: cell,
    actionToken: token,
    timestamp: meta.timestamp ?? "",
  });
  if (session.seenFingerprints.includes(fingerprint)) return { session, accepted: false, reason: "duplicate" };
  if (session.currentPos == null) {
    const next = {
      ...session,
      currentPos: nextPos,
      currentCell: cell,
      positions: [...session.positions, { x: nextPos.x, y: nextPos.y, cell, timestamp: meta.timestamp ?? null }],
      seenFingerprints: [...session.seenFingerprints, fingerprint],
      seenTokens: token ? [...session.seenTokens, token] : session.seenTokens,
      fishId: session.fishId ?? meta.fishId ?? null,
    };
    return { session: next, accepted: true, reason: "first_position", movement: null };
  }
  const dist = stepDistance(session.currentPos, nextPos, size);
  if (dist == null) {
    const d = manhattan(session.currentPos, nextPos);
    if (d === 0) return { session, accepted: false, reason: "same_cell" };
    if (!isAxisAligned(session.currentPos, nextPos)) return { session, accepted: false, reason: "diagonal" };
    return { session, accepted: false, reason: "invalid_distance" };
  }
  const movement = {
    from: { ...session.currentPos, cell: session.currentCell },
    to: { x: nextPos.x, y: nextPos.y, cell },
    distance: dist,
    timestamp: meta.timestamp ?? null,
    fingerprint,
  };
  const next = {
    ...session,
    currentPos: nextPos,
    currentCell: cell,
    positions: [...session.positions, { x: nextPos.x, y: nextPos.y, cell, timestamp: meta.timestamp ?? null }],
    movements: [...session.movements, movement],
    seenFingerprints: [...session.seenFingerprints, fingerprint],
    seenTokens: token ? [...session.seenTokens, token] : session.seenTokens,
    fishId: session.fishId ?? meta.fishId ?? null,
  };
  const detected = detectMode(next.movements.map((m) => m.distance));
  next.detectedMode = detected.mode;
  next.confidence = detected.confidence;
  return { session: next, accepted: true, reason: "moved", movement };
}

export function applyBobberPosition(session, bobberPos, meta = {}) {
  if (!bobberPos || !isInBounds(bobberPos, 4)) return { session, accepted: false, reason: "unknown_bobber" };
  const next = {
    ...session,
    board: 4,
    bobberPos: { x: bobberPos.x, y: bobberPos.y },
    bobberCell: posToCell(bobberPos, 4),
    lastAction: meta.requestAction ?? session.lastAction ?? null,
  };
  if (meta.focus != null) next.focus = meta.focus;
  if (meta.focusMax != null) next.focusMax = meta.focusMax;
  if (meta.focusFound != null) next.focusFound = meta.focusFound;
  return { session: next, accepted: true, reason: "bobber_set" };
}

export function emptySession(partial = {}) {
  const startedAt = partial.startedAt ?? new Date().toISOString();
  return {
    id: partial.id ?? makeSessionId({ fishId: partial.fishId, sessionHint: partial.sessionHint, startedAt }),
    timestamp: startedAt,
    startedAt,
    sessionHint: partial.sessionHint ?? null,
    fishId: partial.fishId ?? null,
    castId: partial.castId ?? null,
    board: partial.board ?? null,
    positions: [],
    movements: [],
    seenFingerprints: [],
    seenTokens: [],
    detectedMode: "UNKNOWN",
    confidence: "none",
    currentPos: null,
    currentCell: null,
    bobberPos: null,
    bobberCell: null,
    focus: null,
    focusMax: null,
    focusFound: false,
    hand: [],
    mana: null,
    manaMax: null,
    catchMeter: null,
    catchMax: null,
    revealedCell: null,
    lastAction: partial.lastAction ?? null,
    endedAt: null,
  };
}

export function shouldOpenNewSession(session, ids, nowIso) {
  if (!session) return true;
  if (session.endedAt) return true;
  if (ids.started && session.movements.length > 0) return true;
  if (ids.fishId && session.fishId && ids.fishId !== session.fishId) return true;
  if (ids.castId && session.castId && ids.castId !== session.castId) return true;
  if (session.currentPos && nowIso) {
    const last = session.positions[session.positions.length - 1]?.timestamp;
    if (last) {
      const gap = Date.parse(nowIso) - Date.parse(last);
      if (Number.isFinite(gap) && gap > 15 * 60 * 1000) return true;
    }
  }
  return false;
}

export function sessionShouldEnd({ mana, catchMeter, catchMax, ids } = {}) {
  // Do not end on catchMeter<=0 (Dendren often starts at 0) or catchMeter>=catchMax
  // (live 4x4 dumps can have fishHp == fishMaxHp while FISH_ESCAPED / SUCCESS_CID is still false).
  // End only on explicit ids.ended (COMPLETE_CID === true, FISH_ESCAPED, FISH_CAUGHT) or mana<=0.
  void catchMeter;
  void catchMax;
  if (ids && ids.ended) return "ids_ended";
  if (mana != null && mana <= 0) return "mana_empty";
  return null;
}

export function summarizeFishingStats(sessions, extras = {}) {
  const total = sessions.length;
  const counts = { MODE_ONE: 0, MODE_TWO: 0, MODE_ALTERNATING: 0, UNCERTAIN: 0, UNKNOWN: 0 };
  let movements = 0;
  const byBoard = { 3: 0, 4: 0, unknown: 0 };
  for (const s of sessions) {
    movements += s.movements?.length ?? 0;
    const mode = s.detectedMode ?? "UNKNOWN";
    if (counts[mode] == null) counts.UNKNOWN += 1;
    else counts[mode] += 1;
    if (s.board === 3) byBoard[3] += 1;
    else if (s.board === 4) byBoard[4] += 1;
    else byBoard.unknown += 1;
  }
  const pct = (n) => (total === 0 ? 0 : Math.round((n / total) * 1000) / 10);
  return {
    totalSessions: total,
    totalMovements: movements,
    modeOne: counts.MODE_ONE,
    modeTwo: counts.MODE_TWO,
    alternating: counts.MODE_ALTERNATING,
    unknown: counts.UNCERTAIN + counts.UNKNOWN,
    modeOnePct: pct(counts.MODE_ONE),
    modeTwoPct: pct(counts.MODE_TWO),
    alternatingPct: pct(counts.MODE_ALTERNATING),
    unknownPct: pct(counts.UNCERTAIN + counts.UNKNOWN),
    sessionsByBoard: byBoard,
    communityByBoard: extras.communityByBoard ?? { 3: 0, 4: 0 },
  };
}

export function renderAsciiGrid(currentCell, possibleCells = [], bobberCell = null, size = 4) {
  const possible = new Set(possibleCells);
  const glyph = (n) => {
    if (n === currentCell) return "F";
    if (n === bobberCell) return "B";
    if (possible.has(n)) return "*";
    return "·";
  };
  const rows = [];
  for (let y = 0; y < size; y += 1) {
    const cells = [];
    for (let x = 0; x < size; x += 1) cells.push(glyph(posToCell({ x, y }, size)));
    rows.push(cells.join(" "));
  }
  return rows.join("\n");
}
