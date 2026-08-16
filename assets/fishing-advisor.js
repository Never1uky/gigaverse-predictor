/**
 * Fishing card patterns + bobber/card EV advisor (pure).
 */
import {
  isInBounds,
  legalBobberCells,
  posToCell,
} from "./fishing-grid.js";

/** Apply 3×3 card pattern around bobber onto 4×4 board. Center = miss. */
export function applyPattern(bobber, card) {
  if (!bobber || !isInBounds(bobber) || !card) {
    return { hits: [], crits: [], missCenter: null, clipped: [] };
  }
  const hits = [];
  const crits = [];
  const clipped = [];
  const missCenter = posToCell(bobber);
  const place = (off, bucket) => {
    const p = { x: bobber.x + off.dx, y: bobber.y + off.dy };
    if (!isInBounds(p)) {
      clipped.push({ ...off });
      return;
    }
    const cell = posToCell(p);
    if (cell != null && !bucket.includes(cell)) bucket.push(cell);
  };
  for (const off of card.critOffsets ?? []) place(off, crits);
  for (const off of card.hitOffsets ?? []) {
    if ((card.critOffsets ?? []).some((c) => c.dx === off.dx && c.dy === off.dy)) continue;
    place(off, hits);
  }
  hits.sort((a, b) => a - b);
  crits.sort((a, b) => a - b);
  return { hits, crits, missCenter, clipped };
}

export function patternAscii(card) {
  if (!card) return "";
  const grid = [
    [".", ".", "."],
    [".", "X", "."],
    [".", ".", "."],
  ];
  for (const o of card.hitOffsets ?? []) grid[o.dy + 1][o.dx + 1] = "H";
  for (const o of card.critOffsets ?? []) grid[o.dy + 1][o.dx + 1] = "C";
  return grid.map((row) => row.join(" ")).join("\n");
}

export function cellOutcomeOnBoard(card, bobber, fishCell) {
  const applied = applyPattern(bobber, card);
  if (applied.crits.includes(fishCell)) return { kind: "crit", delta: card.critValue };
  if (applied.hits.includes(fishCell)) return { kind: "hit", delta: card.hitValue };
  return { kind: "miss", delta: -Math.abs(card.missValue) };
}

export function scoreCardAtBobber(card, bobber, predictedCells, ctx = {}) {
  const cells = Array.isArray(predictedCells) ? predictedCells.filter((c) => c >= 1 && c <= 16) : [];
  const playable = ctx.mana == null || card.mana <= ctx.mana;
  if (!playable) {
    return { ev: null, hitProb: 0, playable: false, escapeRisk: false, worst: 0, covered: 0, coverCells: [] };
  }
  if (cells.length === 0) {
    return { ev: null, hitProb: 0, playable, escapeRisk: false, worst: 0, covered: 0, coverCells: [] };
  }
  let sum = 0;
  let hits = 0;
  let worst = Infinity;
  const cover = [];
  for (const cell of cells) {
    const out = cellOutcomeOnBoard(card, bobber, cell);
    sum += out.delta;
    if (out.kind !== "miss") {
      hits += 1;
      cover.push(cell);
    }
    worst = Math.min(worst, out.delta);
  }
  const ev = sum / cells.length;
  const escapeRisk = ctx.catchMeter != null && ctx.catchMeter + worst <= 0;
  return {
    ev,
    hitProb: hits / cells.length,
    playable,
    escapeRisk,
    worst,
    covered: hits,
    coverCells: cover.sort((a, b) => a - b),
  };
}

export function chooseFishingAdvice({
  predictedCells,
  bobberPos,
  focus,
  focusFound = false,
  hand,
  mana,
  catchMeter,
} = {}) {
  const predicted = Array.isArray(predictedCells) ? predictedCells.filter((c) => c >= 1 && c <= 16) : [];
  const cards = Array.isArray(hand) ? hand.filter(Boolean) : [];
  const legal = legalBobberCells(bobberPos, focusFound ? focus : null);
  const focusAssumption = !focusFound;

  const candidates = [];
  for (const bob of legal.cells) {
    const bobPos = { x: bob.x, y: bob.y };
    for (const card of cards) {
      if (mana != null && card.mana > mana) continue;
      const scored = scoreCardAtBobber(card, bobPos, predicted, { mana, catchMeter });
      if (!scored.playable || scored.ev == null) continue;
      candidates.push({
        bobber: bobPos,
        bobberCell: bob.cell,
        card,
        ...scored,
        stay: bobberPos != null && bob.x === bobberPos.x && bob.y === bobberPos.y,
      });
    }
  }

  const positiveExists = candidates.some((c) => (c.ev ?? -999) >= 0 && !c.escapeRisk);
  const ranked = candidates
    .filter((c) => !(c.escapeRisk && positiveExists))
    .sort((a, b) => {
      if (a.escapeRisk !== b.escapeRisk) return a.escapeRisk ? 1 : -1;
      if ((b.ev ?? -999) !== (a.ev ?? -999)) return (b.ev ?? -999) - (a.ev ?? -999);
      if (b.hitProb !== a.hitProb) return b.hitProb - a.hitProb;
      if (a.stay !== b.stay) return a.stay ? -1 : 1;
      return a.card.mana - b.card.mana;
    });

  const best = ranked[0] ?? null;
  const allNegative = ranked.length > 0 && ranked.every((r) => (r.ev ?? 0) < 0);
  const redrawCost = cards.length;
  const canRedraw = mana != null && redrawCost > 0 && mana >= redrawCost;

  let action = "wait";
  if (best && predicted.length === 0) action = "wait";
  else if (allNegative && canRedraw) action = "redraw";
  else if (best) action = "play";

  let why = "Waiting for fish position or hand";
  if (action === "redraw") {
    why = `All cards miss likely cells. Redraw costs ${redrawCost} mana.`;
  } else if (best && action === "play") {
    const parts = [];
    if (predicted.length) parts.push(`Fish likely ${predicted.join("/")}`);
    parts.push(`card covers ${best.coverCells.join(", ") || "none"}`);
    if (best.stay || (focusFound && focus === 0)) parts.push("bobber stay");
    else parts.push(`bobber → ${best.bobberCell} (${best.bobber.x},${best.bobber.y})`);
    if (focusAssumption) parts.push("Focus not in API — move unconstrained");
    else if (focus != null) parts.push(`Focus ${focus}`);
    why = `${parts.join(". ")}.`;
  } else if (focusFound && focus === 0 && bobberPos) {
    why = "Focus 0 — bobber cannot move.";
  }

  return {
    action,
    card: best?.card ?? null,
    bobber: best?.bobber ?? bobberPos ?? null,
    bobberCell: best?.bobberCell ?? (bobberPos ? posToCell(bobberPos) : null),
    stay: Boolean(best?.stay) || (focusFound && focus === 0),
    ev: best?.ev ?? null,
    hitProb: best?.hitProb ?? 0,
    escapeRisk: Boolean(best?.escapeRisk),
    ranked: ranked.slice(0, 8),
    why,
    focusAssumption,
    focusUnconstrained: legal.unconstrained,
    cardPick: {
      action,
      card: best?.card ?? null,
      ev: best?.ev ?? null,
      hitProb: best?.hitProb ?? 0,
      escapeRisk: Boolean(best?.escapeRisk),
      why,
    },
    patternAscii: best?.card ? patternAscii(best.card) : null,
  };
}

export function formatCardAdvice(pick) {
  if (!pick || pick.action === "wait" || (!pick.card && pick.action !== "redraw")) return null;
  if (pick.action === "redraw") return `PLAY: Redraw · ${pick.why}`;
  return `PLAY: ${pick.card.name} · ${pick.card.mana} mana`;
}

export function formatAdviceLine(advice) {
  if (!advice) return null;
  if (advice.action === "redraw") return `PLAY: Redraw · ${advice.why}`;
  if (advice.action !== "play" || !advice.card) return advice.why;
  const bobberTxt =
    advice.stay || !advice.bobberCell
      ? "BOBBER: stay"
      : `BOBBER: cell ${advice.bobberCell} (${advice.bobber.x},${advice.bobber.y})`;
  return `PLAY: ${advice.card.name} · ${advice.card.mana} mana · ${bobberTxt}`;
}

/** Legacy wrapper used by older tests: score cards with a fixed bobber. */
export function recommendCard(cards, possibleCells, ctx = {}) {
  const bobber = ctx.bobberPos ?? { x: 1, y: 1 };
  const advice = chooseFishingAdvice({
    predictedCells: possibleCells,
    bobberPos: bobber,
    focus: ctx.focus,
    focusFound: ctx.focus != null,
    hand: cards,
    mana: ctx.mana,
    catchMeter: ctx.catchMeter,
  });
  return advice.cardPick;
}

/** Legacy absolute-cell outcome helper (pattern-local 1..9). */
export function cellOutcome(card, cell) {
  if (card.crits?.includes(cell)) return { kind: "crit", delta: card.critValue };
  if (card.hits?.includes(cell)) return { kind: "hit", delta: card.hitValue };
  return { kind: "miss", delta: -Math.abs(card.missValue) };
}

export function scoreCard(card, possibleCells, ctx = {}) {
  return scoreCardAtBobber(card, ctx.bobberPos ?? { x: 1, y: 1 }, possibleCells, ctx);
}
