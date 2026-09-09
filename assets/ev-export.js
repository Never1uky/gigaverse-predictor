/**
 * EV research export — ATK/DEF/shield + pre/post for offline EV audits.
 * No chrome, no network. Never includes actionToken / JWT / cookies / wallet.
 */
import {
  communityExportContainsSecrets,
  makeFightId,
  sanitizeForCommunity,
  sha256Hex,
  toJsonl,
} from "./community.js";

const MOVE_SET = new Set(["rock", "paper", "scissor"]);

function numOrNull(v) {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

function boolOrNull(v) {
  if (v == null) return null;
  return Boolean(v);
}

function moveSlot(row, who, move) {
  const pref = who === "player" ? "player" : "enemy";
  const cap = move.charAt(0).toUpperCase() + move.slice(1);
  return {
    atk: numOrNull(row?.[`${pref}${cap}Atk`]),
    def: numOrNull(row?.[`${pref}${cap}Def`]),
    charges: numOrNull(row?.[`${pref}${cap}Charges`]),
    maxCharges: numOrNull(row?.[`${pref}${cap}MaxCharges`]),
    blocked: boolOrNull(row?.[`${pref}${cap}Blocked`]),
  };
}

function sideSlots(row, who) {
  return {
    rock: moveSlot(row, who, "rock"),
    paper: moveSlot(row, who, "paper"),
    scissor: moveSlot(row, who, "scissor"),
  };
}

function fighterSnapshot(row) {
  if (!row) return null;
  return {
    playerHp: numOrNull(row.playerHp),
    playerMaxHp: numOrNull(row.playerMaxHp),
    playerShield: numOrNull(row.playerShield),
    playerShieldMax: numOrNull(row.playerShieldMax),
    enemyHp: numOrNull(row.enemyHp),
    enemyMaxHp: numOrNull(row.enemyMaxHp),
    enemyShield: numOrNull(row.enemyShield),
    enemyShieldMax: numOrNull(row.enemyShieldMax),
    player: sideSlots(row, "player"),
    enemy: sideSlots(row, "enemy"),
  };
}

function hasAtk(snap) {
  if (!snap) return false;
  for (const who of ["player", "enemy"]) {
    for (const m of MOVE_SET) {
      if (snap[who]?.[m]?.atk != null) return true;
    }
  }
  return false;
}

function sanitizeAdvisor(snap) {
  if (!snap || typeof snap !== "object") return null;
  const ranked = Array.isArray(snap.ranked)
    ? snap.ranked.slice(0, 3).map((r) => ({
        move: MOVE_SET.has(r?.move) ? r.move : null,
        ev: numOrNull(r?.ev),
        pDeath: numOrNull(r?.pDeath),
        survivalChance: numOrNull(r?.survivalChance),
        vetoed: Boolean(r?.vetoed),
      }))
    : [];
  const pick = ranked.find((r) => r.move && snap.recommendedMove === r.move) ?? ranked[0];
  return {
    recommendedMove: MOVE_SET.has(snap.recommendedMove) ? snap.recommendedMove : null,
    ev: numOrNull(pick?.ev) ?? numOrNull(snap.ev) ?? numOrNull(snap.recommendedEv),
    pDeath: numOrNull(pick?.pDeath) ?? numOrNull(snap.pDeath),
    survivalChance: numOrNull(pick?.survivalChance) ?? numOrNull(snap.survivalChance),
    confidence: typeof snap.confidence === "string" ? snap.confidence : null,
    n: numOrNull(snap.n),
    percents: snap.percents
      ? {
          rock: numOrNull(snap.percents.rock),
          paper: numOrNull(snap.percents.paper),
          scissor: numOrNull(snap.percents.scissor),
        }
      : null,
    ranked,
  };
}

function runExtras(run) {
  if (!run || typeof run !== "object") {
    return {
      enemyBurnOnPaperWin: null,
      ourBurnStacks: null,
      completed: null,
      deathRoom: null,
    };
  }
  const burn =
    run.ourStatuses?.burn?.stacks ??
    run.statuses?.burn?.stacks ??
    null;
  return {
    enemyBurnOnPaperWin: Boolean(
      run.enemyAbilities?.burnOnPaperWin ?? run.enemyLoadout?.burnOnPaperWin ?? run.burnOnPaperWin,
    ),
    ourBurnStacks: numOrNull(burn),
    completed: run.completed == null ? null : Boolean(run.completed),
    deathRoom: numOrNull(run.deathRoom ?? run.deathAtRoom),
  };
}

export async function evResearchId(rec) {
  const parts = [
    rec.dungeonId ?? "",
    rec.fightId ?? "",
    rec.fightRound ?? "",
    rec.timestamp ?? "",
    rec.playerMove ?? "",
    rec.enemyMove ?? "",
    rec.pre?.playerHp ?? "",
    rec.post?.playerHp ?? "",
  ];
  return sha256Hex(parts.join("|"));
}

/**
 * Build one combat_ev record. `preMove` = previous same-fight row (post-state = pre for this exchange).
 */
export async function combatEvRecordFromMove(move, preMove = null, run = null) {
  if (!move || !MOVE_SET.has(move.playerMove) || !MOVE_SET.has(move.enemyMove)) return null;
  if (move.dungeonId == null) return null;

  const fightId =
    move.fightId ??
    makeFightId(move.dungeonId, move.roomNumber, move.enemyCid, move.roomSeq ?? null);

  const pre = fighterSnapshot(preMove);
  const post = fighterSnapshot(move);
  const scoreable = Boolean(
    pre &&
      hasAtk(pre) &&
      pre.playerHp != null &&
      MOVE_SET.has(move.enemyMove),
  );

  const prevEnemy =
    (MOVE_SET.has(move.prevEnemyMove) ? move.prevEnemyMove : null) ??
    (preMove && MOVE_SET.has(preMove.enemyMove) ? preMove.enemyMove : null);
  const prevPlayer =
    (MOVE_SET.has(move.prevPlayerMove) ? move.prevPlayerMove : null) ??
    (preMove && MOVE_SET.has(preMove.playerMove) ? preMove.playerMove : null);

  const extras = runExtras(run);
  const advisor = sanitizeAdvisor(move.advisorSnapshot);

  const draft = {
    v: 2,
    kind: "combat_ev",
    timestamp: move.timestamp ?? null,
    dungeonId: move.dungeonId,
    fightId,
    fightRound: move.fightRound ?? null,
    roomNumber: move.roomNumber ?? null,
    enemyCid: move.enemyCid ?? null,
    prevEnemyMove: prevEnemy,
    prevPlayerMove: prevPlayer,
    playerMove: move.playerMove,
    enemyMove: move.enemyMove,
    scoreable,
    pre,
    post: post
      ? {
          playerHp: post.playerHp,
          playerMaxHp: post.playerMaxHp,
          playerShield: post.playerShield,
          enemyHp: post.enemyHp,
          enemyMaxHp: post.enemyMaxHp,
          enemyShield: post.enemyShield,
          playerCharges: {
            rock: post.player.rock.charges,
            paper: post.player.paper.charges,
            scissor: post.player.scissor.charges,
          },
          enemyCharges: {
            rock: post.enemy.rock.charges,
            paper: post.enemy.paper.charges,
            scissor: post.enemy.scissor.charges,
          },
          player: post.player,
          enemy: post.enemy,
        }
      : null,
    outcomes: {
      playerWon: Boolean(move.playerWon),
      enemyWon: Boolean(move.enemyWon),
      playerCrit: boolOrNull(move.playerCrit),
      enemyCrit: boolOrNull(move.enemyCrit),
      playerBlocked: boolOrNull(move.playerBlocked),
      playerEvaded: boolOrNull(move.playerEvaded),
      doubleArmorRecover: boolOrNull(move.doubleArmorRecover),
    },
    statuses: {
      ourBurnStacks: extras.ourBurnStacks,
      enemyBurnOnPaperWin: extras.enemyBurnOnPaperWin,
    },
    advisor,
    run: {
      completed: extras.completed,
      deathRoom: extras.deathRoom,
    },
  };

  const id = await evResearchId(draft);
  return sanitizeForCommunity({ ...draft, id });
}

/**
 * Chronological moves → EV research JSONL records.
 * Skips community-imported rows (no ATK). Uses previous same-fight row as pre.
 */
export async function buildEvResearchRecords(moves, runsByDungeonId = {}) {
  const list = [...(moves ?? [])]
    .filter((m) => m && m.source !== "community")
    .sort((a, b) => String(a.timestamp ?? "").localeCompare(String(b.timestamp ?? "")));

  const lastByFight = new Map();
  const records = [];
  let scoreable = 0;
  let skipped = 0;

  for (const move of list) {
    const fightId =
      move.fightId ??
      makeFightId(move.dungeonId, move.roomNumber, move.enemyCid, move.roomSeq ?? null);
    const preMove = lastByFight.get(fightId) ?? null;
    const run =
      move.dungeonId != null ? runsByDungeonId[String(move.dungeonId)] ?? runsByDungeonId[move.dungeonId] ?? null : null;
    const rec = await combatEvRecordFromMove(move, preMove, run);
    lastByFight.set(fightId, move);
    if (!rec) {
      skipped += 1;
      continue;
    }
    if (rec.scoreable) scoreable += 1;
    records.push(rec);
  }

  return { records, scoreable, skipped, totalMoves: list.length };
}

export function evResearchExportContainsSecrets(text) {
  return communityExportContainsSecrets(text);
}

export function toEvResearchJsonl(records) {
  return toJsonl(records);
}

export function validateEvResearchRecord(rec) {
  if (!rec || typeof rec !== "object") return { ok: false, reason: "not_object" };
  if (rec.v !== 2) return { ok: false, reason: "bad_version" };
  if (rec.kind !== "combat_ev") return { ok: false, reason: "bad_kind" };
  if (rec.dungeonId == null) return { ok: false, reason: "missing_dungeonId" };
  if (!MOVE_SET.has(rec.playerMove) || !MOVE_SET.has(rec.enemyMove)) {
    return { ok: false, reason: "bad_moves" };
  }
  if (!rec.id || typeof rec.id !== "string") return { ok: false, reason: "missing_id" };
  return { ok: true };
}
