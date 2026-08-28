import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { applyHardConstraints } from "../assets/ev.js";
import {
  COMBAT_CALIBRATION_N,
  COMBAT_PREDICT_ALPHA,
  COMBAT_PREDICT_MIN_N,
  calibrationShrink,
  confidenceFromN,
  dirichletSmooth,
  emptyCounts,
  enemyStatsKey,
  featuresFromBacktest,
  hierarchicalDistribution,
  isValidEnemyCid,
  predictEnemyDistribution,
  storeFromBacktest,
  updateCombatStats,
} from "../assets/combat-predict.js";

function makeStore() {
  return { enemies: {}, global: emptyCounts(), globalN: 0 };
}

function features(partial = {}) {
  return {
    enemyCid: 63,
    prevEnemyMove: null,
    enemyRockCharges: 3,
    enemyPaperCharges: 3,
    enemyScissorCharges: 3,
    enemyRockBlocked: false,
    enemyPaperBlocked: false,
    enemyScissorBlocked: false,
    ruledOutMove: null,
    uiUnavailableMoves: [],
    ...partial,
  };
}

describe("enemyStatsKey / enemy-only pooling", () => {
  it("keys stats by enemyCid only, not dungeonId", () => {
    assert.equal(enemyStatsKey(63), "e:63");
    assert.equal(enemyStatsKey(63), enemyStatsKey(63));
    assert.notEqual(enemyStatsKey(63), "d24801092:63");
    assert.notEqual(enemyStatsKey(1), enemyStatsKey(63));
    assert.equal(isValidEnemyCid(0), false);
    assert.equal(isValidEnemyCid(63), true);
    assert.equal(enemyStatsKey(0), "e:unknown");
  });

  it("does not write model updates for enemyCid 0", () => {
    let store = makeStore();
    store = updateCombatStats(store, features({ enemyCid: 0 }), "rock");
    assert.equal(store.globalN ?? 0, 0);
    assert.equal(Object.keys(store.enemies).length, 0);
  });

  it("pools observations from different dungeon runs into one enemy bucket", () => {
    let store = makeStore();
    store = updateCombatStats(store, features({ enemyCid: 63 }), "rock");
    store = updateCombatStats(
      store,
      features({ enemyCid: 63, prevEnemyMove: "rock" }),
      "paper",
    );
    store = updateCombatStats(
      store,
      features({ enemyCid: 63, prevEnemyMove: "paper" }),
      "scissor",
    );
    const enemy = store.enemies["e:63"];
    assert.equal(enemy.n, 3);
    assert.equal(enemy.base.rock, 1);
    assert.equal(enemy.base.paper, 1);
    assert.equal(enemy.base.scissor, 1);
    assert.equal(store.globalN, 3);
  });
});

describe("hierarchical backoff", () => {
  it("uses markov when prev-enemy bucket has minN", () => {
    let store = makeStore();
    for (let i = 0; i < COMBAT_PREDICT_MIN_N; i += 1) {
      store = updateCombatStats(store, features({ prevEnemyMove: "rock" }), "paper");
    }
    const { probs, levels } = hierarchicalDistribution(
      store,
      features({ prevEnemyMove: "rock" }),
    );
    assert.ok(levels.includes("markov"));
    assert.ok(probs.paper > probs.rock);
  });

  it("falls back to enemy base then global when markov is sparse", () => {
    let store = makeStore();
    for (let i = 0; i < 10; i += 1) {
      store = updateCombatStats(store, features(), "rock");
    }
    const { levels } = hierarchicalDistribution(store, features({ prevEnemyMove: "paper" }));
    assert.ok(levels.includes("enemy"));
    assert.ok(!levels.includes("markov"));
  });

  it("uses global when enemy history is below minN", () => {
    let store = makeStore();
    store = updateCombatStats(store, features({ enemyCid: 99 }), "rock");
    for (let i = 0; i < 8; i += 1) {
      store = updateCombatStats(store, features({ enemyCid: 64 }), "paper");
    }
    const { levels } = hierarchicalDistribution(store, features({ enemyCid: 99 }));
    assert.ok(levels.includes("global"));
    assert.ok(!levels.includes("enemy"));
  });
});

describe("alpha smoothing", () => {
  it("uses Dirichlet alpha=2 by default", () => {
    const p = dirichletSmooth({ rock: 10, paper: 0, scissor: 0 });
    assert.equal(COMBAT_PREDICT_ALPHA, 2);
    assert.ok(Math.abs(p.rock - 12 / 16) < 1e-9);
    assert.ok(Math.abs(p.paper - 2 / 16) < 1e-9);
  });
});

describe("calibration shrink", () => {
  it("shrinks toward uniform when n < 20", () => {
    const peaked = { rock: 0.8, paper: 0.1, scissor: 0.1 };
    const shrunk = calibrationShrink(peaked, 5);
    assert.ok(shrunk.rock < peaked.rock);
    assert.ok(shrunk.paper > peaked.paper);
    const sum = shrunk.rock + shrunk.paper + shrunk.scissor;
    assert.ok(Math.abs(sum - 1) < 1e-9);
  });

  it("does not shrink when n >= calibration threshold", () => {
    const peaked = { rock: 0.8, paper: 0.1, scissor: 0.1 };
    const same = calibrationShrink(peaked, COMBAT_CALIBRATION_N);
    assert.deepEqual(same, peaked);
  });

  it("never labels High confidence below n=20", () => {
    assert.equal(confidenceFromN(5, 0.9), "Low");
    assert.equal(confidenceFromN(19, 0.9), "Low");
    assert.equal(confidenceFromN(25, 0.6), "High");
  });
});

describe("sparse enemy history", () => {
  it("returns near-uniform for unseen enemy with empty global", () => {
    const store = makeStore();
    const { probs } = hierarchicalDistribution(store, features({ enemyCid: 67 }));
    assert.ok(Math.abs(probs.rock - 1 / 3) < 0.01);
    assert.ok(Math.abs(probs.paper - 1 / 3) < 0.01);
  });

  it("blends enemy-specific signal with global under low n", () => {
    let store = makeStore();
    for (let i = 0; i < 6; i += 1) {
      store = updateCombatStats(store, features({ enemyCid: 63 }), "rock");
    }
    for (let i = 0; i < 6; i += 1) {
      store = updateCombatStats(store, features({ enemyCid: 64 }), "paper");
    }
    const { probs } = hierarchicalDistribution(store, features({ enemyCid: 63 }));
    assert.ok(probs.rock > probs.paper);
    assert.ok(probs.rock < 0.75, "calibration shrink caps overconfidence");
  });
});

describe("hard constraints integration", () => {
  it("zero charges zero out move before EV path", () => {
    const store = makeStore();
    for (let i = 0; i < 10; i += 1) {
      updateCombatStats(store, features(), "rock");
    }
    const { probs, unavailable } = predictEnemyDistribution(
      store,
      features({ enemyPaperCharges: 0 }),
    );
    assert.equal(probs.paper, 0);
    assert.ok(unavailable.includes("paper"));
    assert.ok(probs.rock + probs.scissor > 0.99);
  });

  it("locked single legal move skips history mix mass", () => {
    const store = makeStore();
    for (let i = 0; i < 20; i += 1) {
      updateCombatStats(store, features(), "rock");
    }
    const { probs, locked } = predictEnemyDistribution(
      store,
      features({ enemyRockCharges: 0, enemyPaperCharges: 0, enemyScissorCharges: 2 }),
    );
    assert.equal(locked, true);
    assert.equal(probs.scissor, 1);
  });

  it("applyHardConstraints unchanged for ruled-out move", () => {
    const { probs } = applyHardConstraints(
      { rock: 0.5, paper: 0.25, scissor: 0.25 },
      { ruledOutMove: "rock" },
    );
    assert.equal(probs.rock, 0);
    assert.ok(probs.paper + probs.scissor > 0.99);
  });

  it("ruledOutMove zeros enemy move in predictEnemyDistribution", () => {
    const store = makeStore();
    for (let i = 0; i < 30; i += 1) {
      updateCombatStats(store, features(), "rock");
    }
    const { probs } = predictEnemyDistribution(store, features({ ruledOutMove: "rock" }));
    assert.equal(probs.rock, 0);
    assert.ok(probs.paper + probs.scissor > 0.99);
  });
});

describe("no dungeonId leakage in prediction features", () => {
  it("storeFromBacktest pools by enemyCid regardless of dungeonId on rows", () => {
    const backtestStore = {
      global: emptyCounts(),
      byEnemy: new Map([
        [
          "63",
          {
            n: 10,
            base: { rock: 10, paper: 0, scissor: 0 },
            markov: new Map([["rock", { rock: 0, paper: 10, scissor: 0 }]]),
          },
        ],
      ]),
    };
    backtestStore.global = { rock: 5, paper: 5, scissor: 5 };
    const prodStore = storeFromBacktest(backtestStore);
    assert.ok(prodStore.enemies["e:63"]);
    assert.equal(prodStore.enemies["d999:63"], undefined);

    const ctx = {
      enemyCid: 63,
      prevEnemyMove: "rock",
      preState: { enemyRockCharges: 2, enemyPaperCharges: 2, enemyScissorCharges: 2 },
    };
    const feat = featuresFromBacktest(ctx);
    assert.equal(feat.enemyCid, 63);
    assert.equal(feat.dungeonId, undefined);
    const { levels } = hierarchicalDistribution(prodStore, feat);
    assert.ok(levels.includes("markov"));
    const { probs } = predictEnemyDistribution(prodStore, feat);
    assert.ok(probs.paper > probs.rock);
  });

  it("uses preState charges (row t-1), not post-exchange row", () => {
    const ctx = {
      enemyCid: 63,
      prevEnemyMove: null,
      preState: { enemyRockCharges: 0, enemyPaperCharges: 2, enemyScissorCharges: 2 },
    };
    const feat = featuresFromBacktest(ctx);
    const { probs } = predictEnemyDistribution(makeStore(), feat);
    assert.equal(probs.rock, 0);
  });
});
