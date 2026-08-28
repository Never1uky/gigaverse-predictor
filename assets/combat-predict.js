/**
 * Phase 2 combat enemy-move distribution: enemyCid pooling, hierarchical backoff,
 * Dirichlet smoothing, calibration shrink. Hard constraints stay in ev.js.
 */
import { M as MOVE_ORDER } from "./constants.js";
import { applyHardConstraints } from "./ev.js";

export const COMBAT_PREDICT_ALPHA = 2;
export const COMBAT_PREDICT_MIN_N = 3;
export const COMBAT_CALIBRATION_N = 20;

const UNIFORM = { rock: 1 / 3, paper: 1 / 3, scissor: 1 / 3 };

/** Kill/transition often sends ENEMY_CID 0 — never pool or display that. */
export function isValidEnemyCid(enemyCid) {
  const n =
    typeof enemyCid === "number"
      ? enemyCid
      : typeof enemyCid === "string" && enemyCid.trim() !== ""
        ? Number(enemyCid)
        : NaN;
  return Number.isFinite(n) && n > 0;
}

export function enemyStatsKey(enemyCid) {
  if (!isValidEnemyCid(enemyCid)) return "e:unknown";
  return `e:${Number(enemyCid)}`;
}

export function emptyCounts() {
  return { rock: 0, paper: 0, scissor: 0 };
}

function cloneCounts(c) {
  return { rock: c.rock, paper: c.paper, scissor: c.scissor };
}

export function countTotal(counts) {
  if (!counts) return 0;
  return counts.rock + counts.paper + counts.scissor;
}

export function dirichletSmooth(counts, alpha = COMBAT_PREDICT_ALPHA) {
  const c = counts ?? emptyCounts();
  let sum = 0;
  const out = {};
  for (const m of MOVE_ORDER) {
    out[m] = c[m] + alpha;
    sum += out[m];
  }
  for (const m of MOVE_ORDER) out[m] /= sum;
  return out;
}

/** Shrink toward uniform when sample size is below calibration threshold. */
export function calibrationShrink(probs, n, calibrationN = COMBAT_CALIBRATION_N) {
  if (n >= calibrationN) return { ...probs };
  const shrink = (calibrationN - Math.max(0, n)) / calibrationN;
  const out = {};
  for (const m of MOVE_ORDER) {
    out[m] = (1 - shrink) * probs[m] + shrink * UNIFORM[m];
  }
  return out;
}

export function confidenceFromN(n, maxP) {
  if (n < COMBAT_CALIBRATION_N) return "Low";
  if (maxP >= 0.55) return "High";
  if (maxP >= 0.42) return "Medium";
  return "Low";
}

function blendLevels(primary, parent) {
  const blendW = Math.min(1, primary.n / (primary.n + 5));
  const out = {};
  for (const m of MOVE_ORDER) {
    out[m] = blendW * primary.p[m] + (1 - blendW) * parent.p[m];
  }
  return out;
}

/**
 * Hierarchical backoff: markov(prev enemy) → enemy base → global.
 * No seq3, stateKey, player-response, or recency.
 */
export function hierarchicalDistribution(store, features, opts = {}) {
  const alpha = opts.alpha ?? COMBAT_PREDICT_ALPHA;
  const minN = opts.minN ?? COMBAT_PREDICT_MIN_N;

  const statsKey = enemyStatsKey(features.enemyCid);
  const enemy = store.enemies?.[statsKey] ?? null;
  const global = store.global ?? emptyCounts();
  const n = enemy?.n ?? 0;

  const levels = [];

  if (enemy && features.prevEnemyMove) {
    const c = enemy.markov?.[features.prevEnemyMove];
    const tn = countTotal(c);
    if (tn >= minN) {
      levels.push({ p: dirichletSmooth(c, alpha), n: tn, name: "markov" });
    }
  }

  if (enemy && countTotal(enemy.base) >= minN) {
    levels.push({
      p: dirichletSmooth(enemy.base, alpha),
      n: countTotal(enemy.base),
      name: "enemy",
    });
  }

  if (countTotal(global) >= minN) {
    levels.push({
      p: dirichletSmooth(global, alpha),
      n: countTotal(global),
      name: "global",
    });
  }

  let raw;
  if (levels.length === 0) {
    raw = { ...UNIFORM };
  } else {
    const primary = levels[0];
    const parent = levels[1] ?? { p: { ...UNIFORM }, n: 0 };
    raw = blendLevels(primary, parent);
  }

  const probs = calibrationShrink(raw, n);
  return { probs, n, levels: levels.map((l) => l.name) };
}

export function constraintOptsFromFeatures(features) {
  return {
    enemyRockCharges: features.enemyRockCharges,
    enemyPaperCharges: features.enemyPaperCharges,
    enemyScissorCharges: features.enemyScissorCharges,
    enemyRockBlocked: features.enemyRockBlocked,
    enemyPaperBlocked: features.enemyPaperBlocked,
    enemyScissorBlocked: features.enemyScissorBlocked,
    ruledOutMove: features.ruledOutMove,
    uiUnavailableMoves: features.uiUnavailableMoves,
  };
}

/** Full distribution with Level-0 hard constraints applied. */
export function predictEnemyDistribution(store, features, opts = {}) {
  const { probs: raw, n } = hierarchicalDistribution(store, features, opts);
  const constrained = applyHardConstraints(raw, constraintOptsFromFeatures(features));
  return { ...constrained, n, rawBeforeConstraints: raw };
}

export function ensureEnemyStats(store, enemyCid) {
  const key = enemyStatsKey(enemyCid);
  if (!store.enemies[key]) {
    store.enemies[key] = {
      modelKey: key,
      enemyCid,
      n: 0,
      base: emptyCounts(),
      markov: {},
      updatedAt: new Date().toISOString(),
    };
  }
  return store.enemies[key];
}

function bumpCounts(counts, move) {
  if (!MOVE_ORDER.includes(move)) return;
  counts[move] += 1;
}

/** Update global + enemyCid-pooled counts (markov on prev enemy only). */
export function updateCombatStats(store, features, observedMove) {
  if (!MOVE_ORDER.includes(observedMove)) return store;
  if (!isValidEnemyCid(features?.enemyCid)) return store;

  if (!store.global) store.global = emptyCounts();
  bumpCounts(store.global, observedMove);
  store.globalN = (store.globalN ?? 0) + 1;

  const enemy = ensureEnemyStats(store, features.enemyCid);
  bumpCounts(enemy.base, observedMove);
  enemy.n += 1;

  if (features.prevEnemyMove) {
    const mk = features.prevEnemyMove;
    if (!enemy.markov[mk]) enemy.markov[mk] = emptyCounts();
    bumpCounts(enemy.markov[mk], observedMove);
  }

  enemy.updatedAt = new Date().toISOString();
  return store;
}

/** Adapter: convert backtest store shape → production store shape. */
export function storeFromBacktest(backtestStore) {
  const store = { enemies: {}, global: cloneCounts(backtestStore.global), globalN: countTotal(backtestStore.global) };
  for (const [cid, e] of backtestStore.byEnemy.entries()) {
    const key = enemyStatsKey(cid);
    const markov = {};
    if (e.markov) {
      for (const [k, c] of e.markov.entries()) markov[k] = cloneCounts(c);
    }
    store.enemies[key] = {
      modelKey: key,
      enemyCid: cid,
      n: e.n,
      base: cloneCounts(e.base),
      markov,
    };
  }
  return store;
}

/** Adapter: features from backtest context. */
export function featuresFromBacktest(ctx) {
  return {
    enemyCid: ctx.enemyCid,
    prevEnemyMove: ctx.prevEnemyMove,
    enemyRockCharges: ctx.preState?.enemyRockCharges,
    enemyPaperCharges: ctx.preState?.enemyPaperCharges,
    enemyScissorCharges: ctx.preState?.enemyScissorCharges,
    enemyRockBlocked: ctx.preState?.enemyRockBlocked,
    enemyPaperBlocked: ctx.preState?.enemyPaperBlocked,
    enemyScissorBlocked: ctx.preState?.enemyScissorBlocked,
    ruledOutMove: null,
    uiUnavailableMoves: [],
  };
}
