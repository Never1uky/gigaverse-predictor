import { M as MOVE_ORDER, R as RPS_BEATS, a as MOVE_UI_LABELS, b as RPS_COUNTER } from "./constants.js";
import {
  DEFAULT_BURN_ON_WIN_STACKS,
  DEFAULT_BURN_TICK,
  DEFAULT_LIFESTEAL,
  MAX_BURN_STACKS
} from "./abilities.js";

const KILL = 10000;
const DEATH = 1e6;
const LOCK_PENALTY = 12;
const LAMBDA_FRAGILE = 1.6;
const LAMBDA_NORMAL = 1.1;
const LAMBDA_UNKNOWN_HP = 2.2;
const DEATH_VETO = 0.35;

function num(value, fallback = 0) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function knownNum(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function isKnownIllegalCharge(charges) {
  return typeof charges === "number" && Number.isFinite(charges) && charges <= 0;
}

function isUsableCharge(charges) {
  if (charges == null) return true;
  return typeof charges === "number" && Number.isFinite(charges) && charges > 0;
}

function capName(move) {
  return move.charAt(0).toUpperCase() + move.slice(1);
}

function emptyProbs() {
  return { rock: 0, paper: 0, scissor: 0 };
}

function cloneMove(slot) {
  return {
    atk: num(slot?.atk, 0),
    def: num(slot?.def, 0),
    charges: slot?.charges == null ? null : num(slot.charges, 0),
    maxCharges: slot?.maxCharges == null ? 3 : num(slot.maxCharges, 3)
  };
}

function cloneBurn(burn) {
  if (!burn || typeof burn !== "object") return null;
  const stacks = knownNum(burn.stacks);
  if (stacks == null || stacks <= 0) return null;
  return {
    stacks: Math.min(MAX_BURN_STACKS, stacks),
    amountPerTick: knownNum(burn.amountPerTick) ?? DEFAULT_BURN_TICK
  };
}

function cloneStatuses(statuses) {
  if (!statuses || typeof statuses !== "object") return { burn: null };
  return { burn: cloneBurn(statuses.burn) };
}

function cloneFighter(fighter) {
  const src = fighter ?? {};
  return {
    hp: knownNum(src.hp),
    hpMax: knownNum(src.hpMax),
    shield: num(src.shield, 0),
    shieldMax: src.shieldMax == null ? null : num(src.shieldMax, null),
    rock: cloneMove(src.rock),
    paper: cloneMove(src.paper),
    scissor: cloneMove(src.scissor),
    statuses: cloneStatuses(src.statuses)
  };
}

function pool(fighter) {
  return num(fighter.hp, 0) + num(fighter.shield, 0);
}

function gainArmor(fighter, def) {
  const gained = Math.max(0, num(def, 0));
  const max =
    fighter.shieldMax == null || !Number.isFinite(fighter.shieldMax)
      ? Number.POSITIVE_INFINITY
      : fighter.shieldMax;
  fighter.shield = Math.min(max, num(fighter.shield, 0) + gained);
}

function applyDamage(defender, atk) {
  let remaining = Math.max(0, num(atk, 0));
  const soaked = Math.min(num(defender.shield, 0), remaining);
  defender.shield = num(defender.shield, 0) - soaked;
  remaining -= soaked;
  if (remaining > 0 && defender.hp != null) {
    defender.hp = Math.max(0, defender.hp - remaining);
  }
}

function addBurnStacks(fighter, stacks, amountPerTick = DEFAULT_BURN_TICK) {
  const add = Math.max(0, num(stacks, 0));
  if (add <= 0) return;
  fighter.statuses = fighter.statuses ?? { burn: null };
  const cur = fighter.statuses.burn ?? { stacks: 0, amountPerTick };
  cur.stacks = Math.min(MAX_BURN_STACKS, num(cur.stacks, 0) + add);
  cur.amountPerTick = knownNum(cur.amountPerTick) ?? amountPerTick;
  fighter.statuses.burn = cur;
}

function tickDots(fighter) {
  const burn = fighter.statuses?.burn;
  if (!burn || num(burn.stacks, 0) <= 0) return;
  applyDamage(fighter, num(burn.amountPerTick, DEFAULT_BURN_TICK) * burn.stacks);
}

function tickCharges(fighter, usedMove) {
  for (const move of MOVE_ORDER) {
    const slot = fighter[move];
    const max = slot.maxCharges == null ? 3 : num(slot.maxCharges, 3);
    if (move === usedMove) {
      if (slot.charges == null) {
        slot.charges = Math.max(-1, max - 1);
      } else if (slot.charges > 1) {
        slot.charges -= 1;
      } else {
        slot.charges = -1;
      }
    } else if (slot.charges === -1) {
      slot.charges = 0;
    } else if (slot.charges != null) {
      slot.charges = Math.min(max, slot.charges + 1);
    }
  }
}

function legalMoves(fighter) {
  return MOVE_ORDER.filter((move) => isUsableCharge(fighter?.[move]?.charges));
}

function listUnavailable(opts = {}) {
  const chargeMap = {
    rock: opts.enemyRockCharges,
    paper: opts.enemyPaperCharges,
    scissor: opts.enemyScissorCharges
  };
  const blockedMap = {
    rock: opts.enemyRockBlocked,
    paper: opts.enemyPaperBlocked,
    scissor: opts.enemyScissorBlocked
  };
  const unavailable = [];
  for (const move of MOVE_ORDER) {
    if (isKnownIllegalCharge(chargeMap[move]) || blockedMap[move] === true) {
      unavailable.push(move);
    }
  }
  if (opts.ruledOutMove && MOVE_ORDER.includes(opts.ruledOutMove)) {
    if (!unavailable.includes(opts.ruledOutMove)) unavailable.push(opts.ruledOutMove);
  }
  const ui = (opts.uiUnavailableMoves ?? []).filter((m) => MOVE_ORDER.includes(m));
  const uiAllThree = MOVE_ORDER.every((m) => ui.includes(m));
  if (!uiAllThree) {
    for (const move of ui) {
      if (unavailable.includes(move)) continue;
      const api = chargeMap[move];
      if (typeof api === "number" && Number.isFinite(api) && api > 0) continue;
      unavailable.push(move);
    }
  }
  return unavailable;
}

/**
 * Zero illegal enemy moves (API charges <= 0, blocked, intuition).
 * UI-depleted is used only when not all-three and API does not contradict.
 * Unknown (null/undefined) charges are left alone.
 * One remaining legal move is forced to P=1 even if mix/Laplace put mass elsewhere.
 * If every move is only UI-illegal, fall back to the unconstrained mix.
 */
function applyHardConstraints(probs, opts = {}) {
  const next = { rock: 0, paper: 0, scissor: 0 };
  for (const move of MOVE_ORDER) {
    next[move] = num(probs?.[move], 0);
  }
  const unavailable = listUnavailable(opts);
  for (const move of unavailable) next[move] = 0;
  const legal = MOVE_ORDER.filter((m) => !unavailable.includes(m));
  if (legal.length === 0) {
    // API/blocked/intuition really zeroed every move. Do not invent mass.
    return { probs: emptyProbs(), unavailable, locked: false };
  }
  if (legal.length === 1) {
    const only = emptyProbs();
    only[legal[0]] = 1;
    return { probs: only, unavailable, locked: true };
  }
  let sum = 0;
  for (const move of legal) sum += next[move];
  if (sum <= 0) {
    const uniform = emptyProbs();
    const p = 1 / legal.length;
    for (const move of legal) uniform[move] = p;
    return { probs: uniform, unavailable, locked: false };
  }
  for (const move of MOVE_ORDER) {
    next[move] = legal.includes(move) ? next[move] / sum : 0;
  }
  return { probs: next, unavailable, locked: false };
}

function seedStatuses(fighter, statuses) {
  if (!statuses) return;
  if (statuses.burn && !fighter.statuses.burn) {
    fighter.statuses.burn = cloneBurn(statuses.burn);
  }
}

function resolveRound(us, enemy, ourMove, theirMove, opts = {}) {
  const nextUs = cloneFighter(us);
  const nextEnemy = cloneFighter(enemy);
  seedStatuses(nextUs, opts.ourStatuses);
  const abilities = opts.enemyAbilities ?? {};
  const weWin = RPS_BEATS[ourMove] === theirMove;
  const theyWin = RPS_BEATS[theirMove] === ourMove;
  let outcome = "draw";
  if (weWin) outcome = "win";
  else if (theyWin) outcome = "lose";

  let damageToUs = 0;
  let damageToThem = 0;
  if (outcome === "draw") {
    gainArmor(nextUs, nextUs[ourMove].def);
    gainArmor(nextEnemy, nextEnemy[theirMove].def);
    damageToThem = num(nextUs[ourMove].atk, 0);
    damageToUs = num(nextEnemy[theirMove].atk, 0);
    applyDamage(nextEnemy, damageToThem);
    applyDamage(nextUs, damageToUs);
  } else if (outcome === "win") {
    gainArmor(nextUs, nextUs[ourMove].def);
    damageToThem = num(nextUs[ourMove].atk, 0);
    applyDamage(nextEnemy, damageToThem);
  } else {
    gainArmor(nextEnemy, nextEnemy[theirMove].def);
    damageToUs = num(nextEnemy[theirMove].atk, 0);
    applyDamage(nextUs, damageToUs);
  }

  if (outcome === "lose") {
    const extra = abilities.onWin?.[theirMove];
    if (typeof extra === "number" && extra > 0) applyDamage(nextUs, extra);
    if (theirMove === "paper" && abilities.burnOnPaperWin) {
      addBurnStacks(nextUs, abilities.burnOnWinAmount ?? DEFAULT_BURN_ON_WIN_STACKS);
    }
    if (abilities.lifestealOnWin && nextEnemy.hp != null) {
      nextEnemy.hp += Math.max(0, num(abilities.lifestealAmount, DEFAULT_LIFESTEAL));
    }
  }

  tickDots(nextUs);
  tickDots(nextEnemy);

  tickCharges(nextUs, ourMove);
  tickCharges(nextEnemy, theirMove);

  return {
    us: nextUs,
    enemy: nextEnemy,
    outcome,
    weDead: nextUs.hp != null && nextUs.hp <= 0,
    theyDead: nextEnemy.hp != null && nextEnemy.hp <= 0
  };
}

function scoreOutcome(us, enemy, after, ourMove) {
  const hpKnown = us.hp != null;
  const weDead = hpKnown && after.us.hp <= 0;
  const theyDead = after.enemy.hp != null && after.enemy.hp <= 0;
  if (weDead && !theyDead) return -DEATH;
  if (theyDead && !weDead) return KILL;
  if (weDead && theyDead) return 0;
  const hpMax = us.hpMax != null && us.hpMax > 0 ? us.hpMax : null;
  const ratio = hpKnown && hpMax != null ? us.hp / hpMax : 1;
  const fragile = hpKnown && (ratio < 0.3 || num(us.shield, 0) <= 3);
  const lambda = !hpKnown ? LAMBDA_UNKNOWN_HP : fragile ? LAMBDA_FRAGILE : LAMBDA_NORMAL;
  const theirLoss = pool(enemy) - pool(after.enemy);
  const ourLoss = pool(us) - pool(after.us);
  let score = theirLoss - lambda * ourLoss;
  if (us[ourMove]?.charges === 1 && !theyDead) score -= LOCK_PENALTY;
  return score;
}

function topEnemyMove(P) {
  let best = null;
  let bestP = -1;
  for (const move of MOVE_ORDER) {
    const p = num(P?.[move], 0);
    if (p > bestP) {
      bestP = p;
      best = move;
    }
  }
  return bestP > 0 ? best : null;
}

function killingEnemyMove(us, enemy, ourMove, P, opts) {
  let worst = null;
  let worstP = -1;
  for (const theirMove of MOVE_ORDER) {
    const p = num(P?.[theirMove], 0);
    if (p <= 0) continue;
    const after = resolveRound(us, enemy, ourMove, theirMove, opts);
    if (after.weDead && p > worstP) {
      worstP = p;
      worst = theirMove;
    }
  }
  return worst;
}

function whyText(pick, ranked, P, locked, opts = {}) {
  if (!pick?.move) return "no legal reply";
  const lines = [];
  const label = MOVE_UI_LABELS[pick.move];
  lines.push(`Play: ${label}`);

  const top = topEnemyMove(P);
  const counter = top ? RPS_COUNTER[top] : null;
  const topPct = top != null ? Math.round(num(P?.[top], 0) * 1000) / 10 : null;
  if (top && counter && pick.move === counter && topPct != null) {
    lines.push(`${label}, because it beats their ${MOVE_UI_LABELS[top]} (${topPct}%)`);
  } else if (top && counter && pick.move !== counter && topPct != null) {
    lines.push(`Their likely ${MOVE_UI_LABELS[top]} (${topPct}%) → counter would be ${MOVE_UI_LABELS[counter]}`);
    const counterRow = ranked.find((row) => row.move === counter);
    if (counterRow?.vetoBecause) {
      lines.push(
        `Not ${MOVE_UI_LABELS[counter]}: you die if they ${MOVE_UI_LABELS[counterRow.vetoBecause]}`,
      );
    } else if (opts.enemyAbilities?.burnOnPaperWin && counter === "paper") {
      lines.push("Not Shield: Shield win burns you");
    } else if (counterRow?.vetoed) {
      lines.push(`Not ${MOVE_UI_LABELS[counter]}: too risky vs this spread`);
    } else if (legalOnlyOne(ranked, pick.move)) {
      lines.push(`${label}: only legal move`);
    } else {
      lines.push(
        `${label}: Death ${Math.round(num(pick.pDeath, 0) * 100)}% · HP ~${pick.expectedHpAfter == null ? "?" : Math.round(pick.expectedHpAfter)}`,
      );
    }
  }

  if (pick.hpKnown && !(top && counter && pick.move !== counter)) {
    const deathPct = Math.round(num(pick.pDeath, 0) * 100);
    const hp = pick.expectedHpAfter == null ? "?" : Math.round(pick.expectedHpAfter);
    const sh = pick.expectedShieldAfter == null ? "?" : Math.round(pick.expectedShieldAfter);
    lines.push(`Death ${deathPct}% · HP ~${hp} · Shield ~${sh}`);
  } else if (!pick.hpKnown) {
    lines.push("HP unknown — playing safe");
  }
  if (locked) {
    const enemyMove = topEnemyMove(P);
    if (enemyMove) lines.push(`Enemy must play ${MOVE_UI_LABELS[enemyMove]}`);
  }
  for (const row of ranked) {
    if (row.vetoBecause && row.move !== counter) {
      lines.push(`${MOVE_UI_LABELS[row.move]}: you die if they ${MOVE_UI_LABELS[row.vetoBecause]}`);
    }
  }
  if (opts.enemyAbilities?.burnOnPaperWin) {
    const amt = opts.enemyAbilities.burnOnWinAmount ?? DEFAULT_BURN_ON_WIN_STACKS;
    lines.push(`⚠ Shield win burns you (~${amt}/stack)`);
  }
  const safer = ranked.find(
    (row) => row.move !== pick.move && pick.hpKnown && pick.pDeath - row.pDeath >= 0.2
  );
  if (safer) {
    lines.push(`Safer: ${MOVE_UI_LABELS[safer.move]} (death ${Math.round(safer.pDeath * 100)}%)`);
  }
  return lines.filter(Boolean).slice(0, 5).join("\n");
}

function legalOnlyOne(ranked, move) {
  const legal = ranked.filter((row) => !row.vetoed);
  return legal.length === 1 && legal[0]?.move === move;
}

function chooseBestReply(us, enemy, P, opts = {}) {
  const legalUs = legalMoves(us);
  const locked = MOVE_ORDER.filter((m) => num(P?.[m], 0) > 0.999).length === 1;
  const hpKnown = us?.hp != null;
  if (legalUs.length === 0) {
    return {
      move: null,
      ev: -Infinity,
      ranked: [],
      why: "no legal reply",
      locked,
      pDeath: 1,
      expectedHpAfter: null,
      expectedShieldAfter: null,
      hpKnown,
      vetoNotes: [],
      burnOnShieldWin: Boolean(opts.enemyAbilities?.burnOnPaperWin),
      saferAlt: null
    };
  }
  const ranked = [];
  for (const ourMove of legalUs) {
    let ev = 0;
    let mass = 0;
    let pDeath = 0;
    let expectedHpAfter = 0;
    let expectedShieldAfter = 0;
    let hpMass = 0;
    for (const theirMove of MOVE_ORDER) {
      const p = num(P?.[theirMove], 0);
      if (p <= 0) continue;
      const after = resolveRound(us, enemy, ourMove, theirMove, opts);
      ev += p * scoreOutcome(us, enemy, after, ourMove);
      mass += p;
      if (hpKnown && after.weDead) pDeath += p;
      if (after.us.hp != null) {
        expectedHpAfter += p * after.us.hp;
        hpMass += p;
      }
      expectedShieldAfter += p * num(after.us.shield, 0);
    }
    if (mass > 0 && mass < 1) {
      ev = ev / mass;
      pDeath = pDeath / mass;
      if (hpMass > 0) {
        expectedHpAfter /= hpMass;
        expectedShieldAfter /= mass;
      }
    } else if (mass > 0) {
      if (hpMass > 0) expectedHpAfter /= mass;
      expectedShieldAfter /= mass;
    }
    const vetoBecause = hpKnown ? killingEnemyMove(us, enemy, ourMove, P, opts) : null;
    ranked.push({
      move: ourMove,
      ev,
      pDeath: hpKnown ? pDeath : 0,
      expectedHpAfter: hpKnown ? expectedHpAfter : null,
      expectedShieldAfter,
      vetoBecause,
      vetoed: false,
      hpKnown
    });
  }
  for (const row of ranked) {
    if (row.pDeath >= DEATH_VETO && ranked.some((other) => other.pDeath < row.pDeath)) {
      row.vetoed = true;
    }
  }
  ranked.sort((a, b) => {
    if (a.vetoed !== b.vetoed) return a.vetoed ? 1 : -1;
    const dying = a.pDeath >= DEATH_VETO || b.pDeath >= DEATH_VETO;
    if (dying) {
      if (a.pDeath !== b.pDeath) return a.pDeath - b.pDeath;
      const hpA = a.expectedHpAfter ?? -1;
      const hpB = b.expectedHpAfter ?? -1;
      if (hpA !== hpB) return hpB - hpA;
    }
    if (b.ev !== a.ev) return b.ev - a.ev;
    if (a.pDeath !== b.pDeath) return a.pDeath - b.pDeath;
    return MOVE_ORDER.indexOf(a.move) - MOVE_ORDER.indexOf(b.move);
  });
  const pick = ranked[0];
  const vetoNotes = ranked
    .filter((row) => row.vetoBecause)
    .map((row) => `${MOVE_UI_LABELS[row.move]}: you die if they ${MOVE_UI_LABELS[row.vetoBecause]}`);
  const saferAlt = ranked.find(
    (row) => row.move !== pick.move && pick.hpKnown && pick.pDeath - row.pDeath >= 0.2
  );
  return {
    move: pick.move,
    ev: pick.ev,
    ranked: ranked.slice(0, 3),
    why: whyText(pick, ranked, P, locked, opts),
    locked,
    pDeath: pick.pDeath,
    expectedHpAfter: pick.expectedHpAfter,
    expectedShieldAfter: pick.expectedShieldAfter,
    hpKnown,
    vetoNotes,
    burnOnShieldWin: Boolean(opts.enemyAbilities?.burnOnPaperWin),
    saferAlt: saferAlt ? { move: saferAlt.move, pDeath: saferAlt.pDeath } : null
  };
}

function featureSlot(features, who, move, kind) {
  return features?.[`${who}${capName(move)}${kind}`] ?? null;
}

function fighterFromSide(features, who) {
  const hpKey = who === "player" ? "playerHp" : "enemyHp";
  const hpMaxKey = who === "player" ? "playerMaxHp" : "enemyMaxHp";
  const shieldKey = who === "player" ? "playerShield" : "enemyShield";
  const shieldMaxKey = who === "player" ? "playerShieldMax" : "enemyShieldMax";
  const fighter = {
    hp: features?.[hpKey],
    hpMax: features?.[hpMaxKey],
    shield: features?.[shieldKey],
    shieldMax: features?.[shieldMaxKey],
    rock: {},
    paper: {},
    scissor: {},
    statuses: who === "player" ? features?.ourStatuses ?? null : null
  };
  for (const move of MOVE_ORDER) {
    fighter[move] = {
      atk: featureSlot(features, who, move, "Atk"),
      def: featureSlot(features, who, move, "Def"),
      charges: featureSlot(features, who, move, "Charges"),
      maxCharges: featureSlot(features, who, move, "MaxCharges")
    };
  }
  return cloneFighter(fighter);
}

function fightersFromFeatures(features) {
  return {
    us: fighterFromSide(features, "player"),
    enemy: fighterFromSide(features, "enemy")
  };
}

export {
  DEATH_VETO,
  MOVE_ORDER,
  MOVE_UI_LABELS,
  RPS_BEATS,
  RPS_COUNTER,
  applyHardConstraints,
  chooseBestReply,
  fightersFromFeatures,
  isKnownIllegalCharge,
  isUsableCharge,
  legalMoves,
  listUnavailable,
  resolveRound
};
