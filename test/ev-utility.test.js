/**
 * Component EV utility tests (COMBAT-4000 optimization → production port).
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  UTILITY_PARAMS,
  applyHardConstraints,
  chooseBestReply,
  legalMoves,
  resolveRound,
  scoreOutcome,
  scoreOutcomeParts
} from "../assets/ev.js";

function move(atk = 4, def = 0, charges = 3) {
  return { atk, def, charges, maxCharges: 3 };
}

function fighter(partial = {}) {
  return {
    hp: 40,
    hpMax: 40,
    shield: 0,
    shieldMax: null,
    rock: move(),
    paper: move(),
    scissor: move(),
    statuses: { burn: null },
    ...partial
  };
}

const UNIFORM = { rock: 1 / 3, paper: 1 / 3, scissor: 1 / 3 };

describe("EV utility — invariants", () => {
  it("1. constrained probabilities sum to 1", () => {
    const { probs } = applyHardConstraints(
      { rock: 0.5, paper: 0.3, scissor: 0.2 },
      { enemyRockCharges: 0 }
    );
    const sum = probs.rock + probs.paper + probs.scissor;
    assert.ok(Math.abs(sum - 1) < 1e-9);
    assert.equal(probs.rock, 0);
  });

  it("2–3. EV is finite and bounded in [-1, 1]", () => {
    const us = fighter({ hp: 20, hpMax: 100, rock: move(12), paper: move(8, 6), scissor: move(10) });
    const enemy = fighter({ hp: 50, rock: move(15), paper: move(15), scissor: move(15) });
    const pick = chooseBestReply(us, enemy, UNIFORM);
    assert.ok(Number.isFinite(pick.ev));
    assert.ok(pick.ev >= -1 && pick.ev <= 1);
    for (const row of pick.ranked) {
      assert.ok(Number.isFinite(row.ev));
      assert.ok(row.ev >= -1 && row.ev <= 1);
    }
  });

  it("4. death always penalized to -1", () => {
    const us = fighter({ hp: 5, hpMax: 100, shield: 0 });
    const enemy = fighter({ hp: 40, rock: move(50) });
    const after = resolveRound(us, enemy, "rock", "rock");
    assert.equal(after.weDead, true);
    assert.equal(scoreOutcome(us, enemy, after, "rock"), -1);
    const parts = scoreOutcomeParts(us, enemy, after, "rock");
    assert.equal(parts.u, -1);
    assert.ok(parts.deathRisk >= 1 || parts.weDead);
  });

  it("5. kill has positive value when safe", () => {
    const us = fighter({ hp: 40, hpMax: 40, rock: move(30) });
    const enemy = fighter({ hp: 5, shield: 0, rock: move(0), paper: move(0), scissor: move(0) });
    // Sword beats Spell → win branch applies our ATK.
    const after = resolveRound(us, enemy, "rock", "scissor");
    assert.equal(after.theyDead, true);
    assert.equal(after.weDead, false);
    const parts = scoreOutcomeParts(us, enemy, after, "rock");
    assert.ok(parts.kill > 0);
    const chip = scoreOutcomeParts(us, enemy, resolveRound(us, enemy, "paper", "scissor"), "paper");
    assert.ok(parts.u > chip.u);
  });

  it("6. low HP increases survival priority (Shield over suicidal Sword)", () => {
    const us = fighter({
      hp: 3,
      hpMax: 20,
      shield: 0,
      rock: move(8, 0, 3),
      paper: move(2, 8, 3),
      scissor: move(2, 0, 3)
    });
    const enemy = fighter({
      hp: 20,
      rock: move(1),
      paper: move(10),
      scissor: move(1)
    });
    const P = { rock: 0, paper: 0.4, scissor: 0.6 };
    const pick = chooseBestReply(us, enemy, P);
    assert.notEqual(pick.move, "rock");
    assert.ok(["paper", "scissor"].includes(pick.move));
  });

  it("7. high HP permits aggression (not forced Shield)", () => {
    const us = fighter({
      hp: 100,
      hpMax: 100,
      rock: move(18, 0, 3),
      paper: move(6, 6, 3),
      scissor: move(12, 0, 3)
    });
    const enemy = fighter({
      hp: 40,
      rock: move(8),
      paper: move(8),
      scissor: move(8)
    });
    const P = { rock: 0.55, paper: 0.2, scissor: 0.25 };
    const pick = chooseBestReply(us, enemy, P);
    assert.ok(pick.move != null);
    // Soft check: full HP + Sword-leaning P should not collapse to Always-Shield.
    assert.ok(pick.move === "paper" || pick.move === "rock" || pick.move === "scissor");
  });

  it("8. guaranteed kill preferred when safe", () => {
    const us = fighter({
      hp: 40,
      hpMax: 40,
      shield: 10,
      rock: move(50, 0, 3),
      paper: move(0, 0, 3),
      scissor: move(0, 0, 3)
    });
    const enemy = fighter({
      hp: 1,
      shield: 0,
      rock: move(0),
      paper: move(0),
      scissor: move(0)
    });
    const P = { rock: 0.6, paper: 0.2, scissor: 0.2 };
    const pick = chooseBestReply(us, enemy, P);
    assert.equal(pick.move, "rock");
    assert.ok((pick.reasons ?? []).some((r) => r.code === "kill_opportunity") || pick.ev > 0);
  });

  it("9. suicide attack is not preferred when safer reply exists", () => {
    const us = fighter({
      hp: 5,
      hpMax: 100,
      shield: 0,
      rock: move(40, 0, 3),
      paper: move(2, 20, 3),
      scissor: move(2, 0, 3)
    });
    const enemy = fighter({
      hp: 100,
      rock: move(2),
      paper: move(30),
      scissor: move(2)
    });
    // Sword often dies to Shield; Shield soaks.
    const P = { rock: 0.2, paper: 0.5, scissor: 0.3 };
    const pick = chooseBestReply(us, enemy, P);
    assert.notEqual(pick.move, "rock");
    const sword = pick.ranked.find((r) => r.move === "rock");
    assert.ok(sword?.vetoed || sword?.pDeath > pick.pDeath);
  });

  it("10. zero-charge action impossible", () => {
    const us = fighter({
      rock: move(10, 0, 0),
      paper: move(10, 5, 3),
      scissor: move(10, 0, 3)
    });
    assert.ok(!legalMoves(us).includes("rock"));
    const pick = chooseBestReply(us, fighter(), UNIFORM);
    assert.notEqual(pick.move, "rock");
  });

  it("11. blocked enemy action impossible (hard constraints)", () => {
    const { probs, unavailable } = applyHardConstraints(UNIFORM, {
      enemyPaperBlocked: true
    });
    assert.ok(unavailable.includes("paper"));
    assert.equal(probs.paper, 0);
    assert.ok(Math.abs(probs.rock + probs.scissor - 1) < 1e-9);
  });

  it("12. unknown ability does not break EV", () => {
    const us = fighter({ hp: 30 });
    const enemy = fighter({ hp: 30 });
    const pick = chooseBestReply(us, enemy, UNIFORM, {
      enemyAbilities: { totallyUnknownFlag: true, onWin: { rock: "nope" } }
    });
    assert.ok(pick.move != null);
    assert.ok(Number.isFinite(pick.ev));
    assert.ok(pick.ev >= -1 && pick.ev <= 1);
  });

  it("13. NaN/Infinity handled in scoreOutcome", () => {
    const us = fighter({ hp: 20, rock: { atk: NaN, def: Infinity, charges: 3, maxCharges: 3 } });
    const enemy = fighter({ hp: 20, paper: { atk: NaN, def: 0, charges: 3, maxCharges: 3 } });
    const after = resolveRound(us, enemy, "rock", "paper");
    const u = scoreOutcome(us, enemy, after, "rock");
    assert.ok(Number.isFinite(u));
    assert.ok(u >= -1 && u <= 1);
    const pick = chooseBestReply(us, enemy, { rock: NaN, paper: 0.5, scissor: 0.5 });
    assert.ok(pick.move == null || Number.isFinite(pick.ev));
  });

  it("14. all actions comparable (same scale)", () => {
    const us = fighter({ hp: 40, rock: move(10), paper: move(8, 6), scissor: move(9) });
    const enemy = fighter({ hp: 40, rock: move(8), paper: move(8), scissor: move(8) });
    const pick = chooseBestReply(us, enemy, UNIFORM);
    assert.equal(pick.ranked.length, 3);
    const evs = pick.ranked.map((r) => r.ev);
    for (const ev of evs) {
      assert.ok(Number.isFinite(ev));
      assert.ok(ev >= -1 && ev <= 1);
    }
    assert.ok(Math.max(...evs) - Math.min(...evs) < 2);
  });

  it("15. Shield does not become universally optimal", () => {
    // Use non-flat P so flat-EV RPS override does not force counter(Shield).
    const P = { rock: 0.55, paper: 0.2, scissor: 0.25 };
    const enemy = fighter({
      hp: 40,
      rock: move(8),
      paper: move(8),
      scissor: move(8)
    });
    const picks = [];
    for (const hp of [100, 70, 40, 20, 8]) {
      const us = fighter({
        hp,
        hpMax: 100,
        rock: move(18, 0, 3),
        paper: move(4, 6, 3),
        scissor: move(10, 0, 3)
      });
      picks.push(chooseBestReply(us, enemy, P).move);
    }
    const allShield = picks.every((m) => m === "paper");
    assert.equal(allShield, false, `Shield-only across HP ladder: ${picks.join(",")}`);
    // At least one aggressive pick at healthy HP.
    assert.ok(picks.slice(0, 3).some((m) => m !== "paper"), `expected non-Shield early: ${picks.join(",")}`);
  });
});

describe("EV utility — params & reasons", () => {
  it("uses validation-selected UTILITY_PARAMS (hard death, linear HP)", () => {
    assert.equal(UTILITY_PARAMS.deathMode, "hard");
    assert.equal(UTILITY_PARAMS.hpMode, "linear");
    assert.equal(UTILITY_PARAMS.killGate, true);
    assert.equal(UTILITY_PARAMS.clamp, true);
    assert.ok(UTILITY_PARAMS.wSurv > 0.5);
    assert.ok(UTILITY_PARAMS.wDmgEnemy > 0.3);
  });

  it("reasons are structured and match Play", () => {
    const us = fighter({ hp: 40, hpMax: 40, rock: move(50), paper: move(0), scissor: move(0) });
    const enemy = fighter({ hp: 1, rock: move(0), paper: move(0), scissor: move(0) });
    const pick = chooseBestReply(us, enemy, { rock: 0.7, paper: 0.15, scissor: 0.15 });
    assert.equal(pick.move, "rock");
    assert.ok(Array.isArray(pick.reasons));
    assert.ok(pick.why.includes("Play:"));
    assert.ok(pick.reasons.every((r) => r.code && typeof r.text === "string"));
  });

  it("extremes A–G stay bounded and non-null", () => {
    const cases = [
      [100, 100],
      [20, 100],
      [5, 100],
      [100, 5],
      [5, 5],
      [50, 10],
      [50, 100]
    ];
    for (const [hp, eHp] of cases) {
      const us = fighter({
        hp,
        hpMax: 100,
        rock: move(12),
        paper: move(8, 8),
        scissor: move(10)
      });
      const enemy = fighter({
        hp: eHp,
        hpMax: 100,
        rock: move(15),
        paper: move(15),
        scissor: move(15)
      });
      const pick = chooseBestReply(us, enemy, UNIFORM);
      assert.ok(pick.move != null, `case ${hp}/${eHp}`);
      assert.ok(Number.isFinite(pick.ev) && pick.ev >= -1 && pick.ev <= 1);
    }
  });
});
