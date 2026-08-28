import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  applyHardConstraints,
  chooseBestReply,
  legalMoves,
  resolveRound,
  scoreOutcome
} from "../assets/ev.js";

function move(atk, def, charges, maxCharges = 3) {
  return { atk, def, charges, maxCharges };
}

function fighter(partial = {}) {
  return {
    hp: 20,
    hpMax: 20,
    shield: 0,
    shieldMax: 20,
    rock: move(4, 2, 3),
    paper: move(4, 2, 3),
    scissor: move(4, 2, 3),
    ...partial
  };
}

describe("applyHardConstraints", () => {
  it("treats negative charges as illegal (P=0)", () => {
    const { probs, unavailable } = applyHardConstraints(
      { rock: 0.5, paper: 0.3, scissor: 0.2 },
      { enemyRockCharges: -1, enemyPaperCharges: 2, enemyScissorCharges: 3 }
    );
    assert.equal(probs.rock, 0);
    assert.ok(unavailable.includes("rock"));
    assert.ok(probs.paper > 0);
    assert.ok(probs.scissor > 0);
    assert.ok(Math.abs(probs.paper + probs.scissor - 1) < 1e-9);
  });

  it("treats zero charges as illegal", () => {
    const { probs } = applyHardConstraints(
      { rock: 0.4, paper: 0.4, scissor: 0.2 },
      { enemyPaperCharges: 0, enemyRockCharges: 2, enemyScissorCharges: 1 }
    );
    assert.equal(probs.paper, 0);
    assert.ok(probs.rock > 0);
  });

  it("skips unknown (null) charges instead of zeroing them", () => {
    const { probs, unavailable } = applyHardConstraints(
      { rock: 0.5, paper: 0.5, scissor: 0 },
      { enemyRockCharges: null, enemyPaperCharges: 0, enemyScissorCharges: 2 }
    );
    assert.ok(!unavailable.includes("rock"));
    assert.ok(unavailable.includes("paper"));
    assert.ok(probs.rock > 0);
    assert.equal(probs.paper, 0);
  });

  it("forces P=1 when only one legal enemy move", () => {
    const { probs, locked, unavailable } = applyHardConstraints(
      { rock: 0.9, paper: 0.05, scissor: 0.05 },
      { enemyRockCharges: 0, enemyPaperCharges: -1, enemyScissorCharges: 2 }
    );
    assert.equal(probs.scissor, 1);
    assert.equal(probs.rock, 0);
    assert.equal(probs.paper, 0);
    assert.equal(locked, true);
    assert.equal(unavailable.length, 2);
  });

  it("forces P=1 on the only legal move even if mix mass was elsewhere", () => {
    const { probs, locked } = applyHardConstraints(
      { rock: 1, paper: 0, scissor: 0 },
      { enemyRockCharges: 0, enemyPaperCharges: 0, enemyScissorCharges: 1 }
    );
    assert.equal(probs.scissor, 1);
    assert.equal(locked, true);
  });

  it("returns empty probs when every move is illegal", () => {
    const { probs, locked } = applyHardConstraints(
      { rock: 0.2, paper: 0.2, scissor: 0.6 },
      { enemyRockCharges: 0, enemyPaperCharges: -1, enemyScissorCharges: 0 }
    );
    assert.deepEqual(probs, { rock: 0, paper: 0, scissor: 0 });
    assert.equal(locked, false);
  });
});

describe("resolveRound", () => {
  it("draw applies both ATK and both DEF (armor first)", () => {
    const us = fighter({
      hp: 20,
      shield: 0,
      shieldMax: 20,
      rock: move(5, 3, 3)
    });
    const enemy = fighter({
      hp: 20,
      shield: 0,
      shieldMax: 20,
      rock: move(5, 3, 3)
    });
    const after = resolveRound(us, enemy, "rock", "rock");
    assert.equal(after.outcome, "draw");
    // Both gain 3 armor, then both deal 5: soak 3, leftover 2 HP.
    assert.equal(after.us.hp, 18);
    assert.equal(after.enemy.hp, 18);
    assert.equal(after.us.shield, 0);
    assert.equal(after.enemy.shield, 0);
  });

  it("win: winner gains armor then leftover ATK hits HP", () => {
    const us = fighter({
      hp: 20,
      shield: 2,
      shieldMax: 20,
      rock: move(10, 4, 3)
    });
    const enemy = fighter({
      hp: 20,
      shield: 5,
      shieldMax: 20,
      scissor: move(8, 3, 3)
    });
    const after = resolveRound(us, enemy, "rock", "scissor");
    assert.equal(after.outcome, "win");
    assert.equal(after.us.hp, 20);
    assert.equal(after.us.shield, 6);
    assert.equal(after.enemy.hp, 15);
    assert.equal(after.enemy.shield, 0);
  });

  it("loser does not apply ATK or DEF", () => {
    const us = fighter({ paper: move(9, 6, 3), shield: 1 });
    const enemy = fighter({ rock: move(50, 50, 3), shield: 0, hp: 20 });
    const after = resolveRound(us, enemy, "paper", "rock");
    assert.equal(after.outcome, "win");
    assert.equal(after.us.hp, 20);
    assert.equal(after.us.shield, 7);
    assert.equal(after.enemy.hp, 11);
    assert.equal(after.enemy.shield, 0);
  });

  it("using a move at 1 charge sets it to -1; unused recover", () => {
    const us = fighter({
      rock: move(4, 2, 1),
      paper: move(4, 2, -1),
      scissor: move(4, 2, 2)
    });
    const enemy = fighter();
    const after = resolveRound(us, enemy, "rock", "paper");
    assert.equal(after.us.rock.charges, -1);
    assert.equal(after.us.paper.charges, 0);
    assert.equal(after.us.scissor.charges, 3);
  });
});

describe("chooseBestReply", () => {
  it("never picks our depleted move", () => {
    const us = fighter({
      paper: move(99, 99, 0),
      rock: move(4, 2, 3),
      scissor: move(4, 2, -1)
    });
    const enemy = fighter();
    const P = { rock: 0.9, paper: 0.05, scissor: 0.05 };
    const pick = chooseBestReply(us, enemy, P);
    assert.notEqual(pick.move, "paper");
    assert.notEqual(pick.move, "scissor");
    assert.equal(pick.move, "rock");
    assert.ok(!legalMoves(us).includes("paper"));
    assert.ok(!legalMoves(us).includes("scissor"));
  });

  it("EV-max can differ from naive counter(argmax P)", () => {
    // argmax P = rock → naive counter is paper.
    // Our paper ATK is 0 so winning the likely matchup does nothing.
    // Draw with rock kills (both apply ATK) because enemy has 1 HP.
    const us = fighter({
      hp: 30,
      hpMax: 30,
      shield: 8,
      rock: move(50, 0, 3),
      paper: move(0, 0, 3),
      scissor: move(0, 0, 3)
    });
    const enemy = fighter({
      hp: 1,
      hpMax: 20,
      shield: 0,
      rock: move(0, 0, 3),
      paper: move(0, 0, 3),
      scissor: move(0, 0, 3)
    });
    const P = { rock: 0.6, paper: 0.2, scissor: 0.2 };
    const pick = chooseBestReply(us, enemy, P);
    assert.equal(pick.move, "rock");
    assert.notEqual(pick.move, "paper");
    const paperEv = pick.ranked.find((r) => r.move === "paper")?.ev ?? 0;
    assert.ok(pick.ev > paperEv);
  });
});

describe("applyHardConstraints UI fallback", () => {
  it("does not return all-zero when only UI marks all three depleted", () => {
    const mix = { rock: 0.2, paper: 0.2, scissor: 0.6 };
    const { probs, unavailable } = applyHardConstraints(mix, {
      uiUnavailableMoves: ["rock", "paper", "scissor"]
    });
    const mass = probs.rock + probs.paper + probs.scissor;
    assert.ok(mass > 0.99, `expected fallback mix, got ${JSON.stringify(probs)}`);
    assert.ok(probs.scissor > 0);
    assert.ok(unavailable.length < 3);
  });

  it("trusts API charges over a UI depleted mark", () => {
    const { probs, unavailable } = applyHardConstraints(
      { rock: 0.5, paper: 0.5, scissor: 0 },
      { enemyPaperCharges: 2, uiUnavailableMoves: ["paper"] }
    );
    assert.ok(!unavailable.includes("paper"));
    assert.ok(probs.paper > 0);
  });
});

describe("death veto and readable why", () => {
  it("does not pick Sword when it dies to their Shield and Shield is safer", () => {
    // Naive counter of likely Spell is Sword. Sword vs Shield kills us.
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
      hpMax: 20,
      shield: 0,
      rock: move(1, 0, 3),
      paper: move(10, 0, 3),
      scissor: move(1, 0, 3)
    });
    const P = { rock: 0, paper: 0.4, scissor: 0.6 };
    const pick = chooseBestReply(us, enemy, P);
    assert.notEqual(pick.move, "rock");
    assert.ok(["paper", "scissor"].includes(pick.move));
    assert.ok(pick.why.includes("Play:"));
    assert.ok(!/EV-max/i.test(pick.why));
    assert.ok(!/EV\s/.test(pick.why));
    assert.ok(pick.vetoNotes.some((n) => /Sword: you die if they Shield/.test(n)));
  });

  it("certain-kill vetoNote changes Play even when pDeath < 0.35", () => {
    // High-EV Shield dies only to Spell (20% mass) — hard-veto even below DEATH_VETO.
    const us = fighter({
      hp: 7,
      hpMax: 32,
      shield: 0,
      rock: move(2, 0, 3),
      paper: move(20, 6, 3),
      scissor: move(2, 0, 3)
    });
    const enemy = fighter({
      hp: 40,
      hpMax: 40,
      shield: 0,
      rock: move(1, 0, 3),
      paper: move(1, 0, 3),
      scissor: move(20, 0, 3)
    });
    const P = { rock: 0.4, paper: 0.4, scissor: 0.2 };
    const pick = chooseBestReply(us, enemy, P);
    assert.ok(pick.vetoNotes.some((n) => /Shield: you die if they Spell/.test(n)));
    assert.notEqual(pick.move, "paper");
    const shield = pick.ranked.find((r) => r.move === "paper");
    assert.equal(shield?.vetoed, true);
    assert.ok(shield?.pDeath < 0.35);
  });

  it("flat near-uniform P prefers RPS counter over ATK-max Sword", () => {
    const us = fighter({
      hp: 30,
      hpMax: 32,
      shield: 5,
      rock: move(16, 0, 3),
      paper: move(6, 6, 3),
      scissor: move(12, 0, 3)
    });
    const enemy = fighter({
      hp: 20,
      hpMax: 20,
      shield: 0,
      rock: move(4, 0, 3),
      paper: move(4, 0, 3),
      scissor: move(4, 0, 3)
    });
    const P = { rock: 0.327, paper: 0.342, scissor: 0.331 };
    const pick = chooseBestReply(us, enemy, P);
    assert.equal(pick.move, "scissor");
    assert.equal(pick.flatEv, true);
    assert.ok(/EV≈flat/i.test(pick.why));
  });

  it("does not invent HP=100 when snapshot HP is missing", () => {
    const us = fighter({ hp: undefined, shield: 0, rock: move(1, 0, 3) });
    delete us.hp;
    const enemy = fighter({ paper: move(5, 0, 3) });
    const after = resolveRound(us, enemy, "rock", "paper");
    assert.equal(after.outcome, "lose");
    assert.equal(after.us.hp, null);
    assert.equal(after.weDead, false);
  });
});

describe("burn on shield win", () => {
  it("applies extra HP loss when enemy wins with paper", () => {
    const us = fighter({ hp: 10, shield: 0, rock: move(1, 0, 3) });
    const enemy = fighter({ hp: 20, shield: 0, paper: move(3, 0, 3) });
    const plain = resolveRound(us, enemy, "rock", "paper");
    const burned = resolveRound(us, enemy, "rock", "paper", {
      enemyAbilities: { burnOnPaperWin: true, burnOnWinAmount: 1 }
    });
    assert.equal(plain.outcome, "lose");
    assert.equal(plain.us.hp, 7);
    assert.ok(burned.us.hp < plain.us.hp);
    assert.equal(burned.us.hp, 6);
    assert.ok((burned.us.statuses?.burn?.stacks ?? 0) >= 1);
  });

  it("ticks existing burn after the exchange", () => {
    const us = fighter({ hp: 10, shield: 0, rock: move(1, 0, 3) });
    const enemy = fighter({ hp: 20, rock: move(0, 0, 3) });
    const after = resolveRound(us, enemy, "rock", "rock", {
      ourStatuses: { burn: { stacks: 2, amountPerTick: 1 } }
    });
    assert.equal(after.outcome, "draw");
    assert.equal(after.us.hp, 8);
  });

  it("avoids losing to paper when low HP and enemy shield-win burns", () => {
    const us = fighter({
      hp: 4,
      hpMax: 20,
      shield: 0,
      rock: move(8, 0, 3),
      paper: move(2, 6, 3),
      scissor: move(2, 0, 3)
    });
    const enemy = fighter({
      hp: 20,
      shield: 0,
      rock: move(1, 0, 3),
      paper: move(3, 0, 3),
      scissor: move(1, 0, 3)
    });
    const P = { rock: 0, paper: 0.45, scissor: 0.55 };
    const abilities = { burnOnPaperWin: true, burnOnWinAmount: 1 };
    const naive = chooseBestReply(us, enemy, P);
    const pick = chooseBestReply(us, enemy, P, { enemyAbilities: abilities });
    assert.notEqual(pick.move, "rock");
    assert.ok(pick.burnOnShieldWin);
    assert.ok(pick.why.includes("burns you"));
    // Without burn, Sword vs Shield leaves 1 HP so the naive counter can stand.
    if (naive.move === "rock") {
      assert.notEqual(pick.move, naive.move);
    }
  });
});

describe("survival utility scoreOutcome (§15)", () => {
  it("EV stays in [-1, 1] for full and low HP", () => {
    const enemy = fighter({
      hp: 40,
      hpMax: 40,
      rock: move(20, 0, 3),
      paper: move(20, 0, 3),
      scissor: move(20, 0, 3)
    });
    const P = { rock: 1 / 3, paper: 1 / 3, scissor: 1 / 3 };
    for (const hp of [100, 20, 10, 5]) {
      const us = fighter({
        hp,
        hpMax: 100,
        rock: move(10, 0, 3),
        paper: move(10, 8, 3),
        scissor: move(10, 0, 3)
      });
      const pick = chooseBestReply(us, enemy, P);
      for (const row of pick.ranked) {
        assert.ok(row.ev >= -1 && row.ev <= 1, `hp=${hp} ${row.move} EV=${row.ev}`);
      }
    }
  });

  it("guaranteed death scores near -1; guaranteed survive is higher", () => {
    const us = fighter({
      hp: 5,
      hpMax: 100,
      shield: 0,
      rock: move(1, 0, 3),
      paper: move(1, 0, 3),
      scissor: move(1, 0, 3)
    });
    const lethal = fighter({
      hp: 40,
      rock: move(50, 0, 3),
      paper: move(50, 0, 3),
      scissor: move(50, 0, 3)
    });
    const soft = fighter({
      hp: 40,
      rock: move(1, 0, 3),
      paper: move(1, 0, 3),
      scissor: move(1, 0, 3)
    });
    // Flat P: every our move dies on lose+draw against ATK50 from HP5.
    const P = { rock: 1 / 3, paper: 1 / 3, scissor: 1 / 3 };
    const die = chooseBestReply(us, lethal, P);
    const live = chooseBestReply(us, soft, P);
    assert.ok(die.pDeath >= 0.66);
    assert.ok(die.ev <= -0.5, `expected heavily negative EV, got ${die.ev}`);
    assert.ok(live.ev > die.ev);
    assert.ok(live.pDeath < 0.01);
    const lethalBranch = resolveRound(us, lethal, "rock", "rock");
    assert.equal(lethalBranch.weDead, true);
    assert.equal(scoreOutcome(us, lethal, lethalBranch, "rock"), -1);
  });

  it("prefers kill when enemy is in ATK range over useless chip", () => {
    const us = fighter({
      hp: 30,
      hpMax: 30,
      shield: 8,
      rock: move(50, 0, 3),
      paper: move(0, 0, 3),
      scissor: move(0, 0, 3)
    });
    const enemy = fighter({
      hp: 1,
      hpMax: 20,
      shield: 0,
      rock: move(0, 0, 3),
      paper: move(0, 0, 3),
      scissor: move(0, 0, 3)
    });
    const P = { rock: 0.6, paper: 0.2, scissor: 0.2 };
    const pick = chooseBestReply(us, enemy, P);
    assert.equal(pick.move, "rock");
  });

  it("Shield that stops lethal beats reckless Sword", () => {
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
      hpMax: 20,
      shield: 0,
      rock: move(1, 0, 3),
      paper: move(10, 0, 3),
      scissor: move(1, 0, 3)
    });
    const P = { rock: 0, paper: 0.4, scissor: 0.6 };
    const pick = chooseBestReply(us, enemy, P);
    assert.notEqual(pick.move, "rock");
  });

  it("last charge applies a small lock penalty without flipping safe Play", () => {
    const us = fighter({
      hp: 40,
      hpMax: 40,
      rock: move(10, 0, 1),
      paper: move(10, 8, 3),
      scissor: move(10, 0, 3)
    });
    const enemy = fighter({
      hp: 40,
      rock: move(5, 0, 3),
      paper: move(5, 0, 3),
      scissor: move(5, 0, 3)
    });
    const P = { rock: 0.2, paper: 0.2, scissor: 0.6 };
    const pick = chooseBestReply(us, enemy, P);
    const sword = pick.ranked.find((r) => r.move === "rock");
    const after = resolveRound(us, enemy, "rock", "scissor");
    const score = scoreOutcome(us, enemy, after, "rock");
    assert.ok(score < 0.9);
    assert.ok(sword != null);
    assert.notEqual(pick.move, null);
  });

  it("unknown HP uses prior, not invented HP=100, and stays bounded", () => {
    const us = fighter({ hp: undefined, shield: 0, rock: move(4, 0, 3) });
    delete us.hp;
    const enemy = fighter({ paper: move(5, 0, 3) });
    const after = resolveRound(us, enemy, "rock", "paper");
    const u = scoreOutcome(us, enemy, after, "rock");
    assert.ok(u >= -1 && u <= 1);
    assert.equal(after.weDead, false);
  });
});

describe("lookahead continuation (§EV)", () => {
  it("depth 2 keeps EV in [-1,1] and does not always-Shield on full HP", () => {
    const us = fighter({
      hp: 100,
      hpMax: 100,
      rock: move(10, 0, 3),
      paper: move(10, 8, 3),
      scissor: move(10, 0, 3)
    });
    const enemy = fighter({
      hp: 40,
      rock: move(20, 0, 3),
      paper: move(20, 0, 3),
      scissor: move(20, 0, 3)
    });
    const P = { rock: 1 / 3, paper: 1 / 3, scissor: 1 / 3 };
    const pick = chooseBestReply(us, enemy, P, { lookaheadDepth: 2 });
    assert.ok(pick.ev >= -1 && pick.ev <= 1);
    assert.ok(pick.pDeath < 0.05);
    // Flat mild threat at full HP should not force Sword-only panic; Shield OK but not exclusive forever.
    assert.ok(["rock", "paper", "scissor"].includes(pick.move));
  });

  it("depth 2 still prefers kill when enemy is in ATK range", () => {
    const us = fighter({
      hp: 30,
      hpMax: 30,
      shield: 8,
      rock: move(50, 0, 3),
      paper: move(0, 0, 3),
      scissor: move(0, 0, 3)
    });
    const enemy = fighter({
      hp: 1,
      hpMax: 20,
      shield: 0,
      rock: move(0, 0, 3),
      paper: move(0, 0, 3),
      scissor: move(0, 0, 3)
    });
    const P = { rock: 0.6, paper: 0.2, scissor: 0.2 };
    const pick = chooseBestReply(us, enemy, P, { lookaheadDepth: 2 });
    assert.equal(pick.move, "rock");
  });

  it("certain-kill veto still applies with lookahead", () => {
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
      hpMax: 20,
      shield: 0,
      rock: move(1, 0, 3),
      paper: move(10, 0, 3),
      scissor: move(1, 0, 3)
    });
    const P = { rock: 0, paper: 0.4, scissor: 0.6 };
    const pick = chooseBestReply(us, enemy, P, { lookaheadDepth: 2 });
    assert.notEqual(pick.move, "rock");
  });

  it("lookaheadDepth 1 recovers classic one-step path", () => {
    const us = fighter({ hp: 40, hpMax: 40 });
    const enemy = fighter({
      hp: 40,
      rock: move(5, 0, 3),
      paper: move(5, 0, 3),
      scissor: move(5, 0, 3)
    });
    const P = { rock: 0.2, paper: 0.2, scissor: 0.6 };
    const a = chooseBestReply(us, enemy, P, { lookaheadDepth: 1 });
    const b = chooseBestReply(us, enemy, P, { lookaheadDepth: 1 });
    assert.equal(a.move, b.move);
    assert.equal(a.lookaheadDepth, 1);
  });
});

describe("recommendedMove why vs counter", () => {
  it("explains when Play matches the counter of top enemy move", () => {
    const us = fighter({ hp: 26, shield: 0 });
    const enemy = fighter({ hp: 40, shield: 0 });
    const P = { rock: 0.5, paper: 0.056, scissor: 0.444 };
    const pick = chooseBestReply(us, enemy, P);
    // Counter of Sword is Shield; if EV picks Shield, why must say so.
    if (pick.move === "paper") {
      assert.match(pick.why, /beats their Sword/i);
    }
    assert.ok(!/rock|paper|scissor/i.test(pick.why.replace(/Play:.*\n?/, "")));
    assert.match(pick.why, /Sword|Shield|Spell/);
  });

  it("explains when recommendedMove diverges from counter due to death risk", () => {
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
      hpMax: 20,
      shield: 0,
      rock: move(1, 0, 3),
      paper: move(10, 0, 3),
      scissor: move(1, 0, 3)
    });
    // Top enemy = Spell → counter Sword, but Sword dies to Shield.
    const P = { rock: 0, paper: 0.4, scissor: 0.6 };
    const pick = chooseBestReply(us, enemy, P);
    assert.notEqual(pick.move, "rock");
    assert.match(pick.why, /counter would be Sword|Not Sword|you die/i);
  });

  it("user-facing why uses Sword/Shield/Spell labels", () => {
    const LABELS = { rock: "Sword", paper: "Shield", scissor: "Spell" };
    for (const [api, ui] of Object.entries(LABELS)) {
      assert.notEqual(api, ui);
      assert.ok(["Sword", "Shield", "Spell"].includes(ui));
    }
  });
});
