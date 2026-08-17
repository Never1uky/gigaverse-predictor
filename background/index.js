import { R as RPS_BEATS, M as MOVE_ORDER, a as MOVE_UI_LABELS, b as RPS_COUNTER } from "../assets/constants.js";
import { applyHardConstraints, chooseBestReply, fightersFromFeatures } from "../assets/ev.js";
import {
  confidenceFromN,
  countTotal,
  enemyStatsKey,
  emptyCounts as combatEmptyCounts,
  predictEnemyDistribution,
  updateCombatStats,
} from "../assets/combat-predict.js";
import { collectAbilityContext } from "../assets/abilities.js";
import { ingestFishingCapture, ingestFishingHandUi, getFishingStatus, clearFishingData, clearFishingUiState, getAllFishingSessions, upsertCommunityFishing, getCommunityFishing } from "../assets/fishing-collector.js";
import {
  canPullFromUrl,
  combatRecordFromMove,
  communityCombatToMove,
  communityExportContainsSecrets,
  fishingRecordsFromSession,
  makeFightId,
  parseCommunityPayload,
  partitionCommunityRecords,
  toJsonl,
  validateCommunityRecord,
} from "../assets/community.js";
function asNumber$1(value) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "" && Number.isFinite(Number(value))) {
    return Number(value);
  }
  return null;
}
function extractDungeonIds(response) {
  const body = response ?? {};
  const data = body.data ?? body;
  const run = data.run ?? {};
  const entity = data.entity ?? {};
  const dungeonId = asNumber$1(run.DUNGEON_ID_CID) ?? asNumber$1(entity.DUNGEON_ID_CID) ?? null;
  const roomNumber = asNumber$1(entity.ROOM_NUM_CID) ?? asNumber$1(run.ROOM_NUM_CID) ?? null;
  const enemyCid = asNumber$1(entity.ENEMY_CID) ?? asNumber$1(entity.ENEMY_ID_CID) ?? asNumber$1(entity.MONSTER_CID) ?? asNumber$1(run.ENEMY_CID) ?? null;
  return { dungeonId, roomNumber, enemyCid };
}
function repairMoveRecords(rawMoves) {
  var _a;
  const normalized = rawMoves.map((m) => normalizePartialMove(m)).filter((m) => m != null).sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  const byDungeon = /* @__PURE__ */ new Map();
  for (const move of normalized) {
    const key = String(move.dungeonId ?? move.id);
    const list = byDungeon.get(key) ?? [];
    list.push(move);
    byDungeon.set(key, list);
  }
  const repaired = [];
  for (const list of byDungeon.values()) {
    let room = ((_a = list[0]) == null ? void 0 : _a.roomNumber) ?? 1;
    let prev = null;
    for (const move of list) {
      if (prev) {
        const maxHpChanged = move.enemyMaxHp != null && prev.enemyMaxHp != null && move.enemyMaxHp !== prev.enemyMaxHp;
        const hpReset = move.enemyHp != null && prev.enemyHp != null && move.enemyHp > prev.enemyHp + 3 && (prev.enemyHp <= 5 || prev.enemyMaxHp != null && prev.enemyHp / prev.enemyMaxHp < 0.25);
        if (maxHpChanged || hpReset) {
          room += 1;
        }
      }
      const roomNumber = move.roomNumber ?? room;
      const enemyCid = move.enemyCid ?? move.enemyMaxHp ?? null;
      repaired.push({
        ...move,
        roomNumber,
        enemyCid,
        prevEnemyMove: (prev == null ? void 0 : prev.enemyMove) ?? move.prevEnemyMove ?? null,
        prevPlayerMove: (prev == null ? void 0 : prev.playerMove) ?? move.prevPlayerMove ?? null
      });
      prev = repaired[repaired.length - 1];
    }
  }
  return repaired.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
}
function isMoveValue$1(v) {
  return v === "rock" || v === "paper" || v === "scissor";
}
function normalizePartialMove(raw) {
  if (!raw || !isMoveValue$1(raw.playerMove) || !isMoveValue$1(raw.enemyMove)) return null;
  const id = raw.id ?? raw.actionToken;
  if (!id) return null;
  return {
    id: String(id),
    timestamp: raw.timestamp ?? (/* @__PURE__ */ new Date()).toISOString(),
    dungeonId: raw.dungeonId ?? null,
    roomNumber: raw.roomNumber ?? null,
    enemyCid: raw.enemyCid ?? null,
    actionToken: raw.actionToken != null ? String(raw.actionToken) : String(id),
    playerMove: raw.playerMove,
    enemyMove: raw.enemyMove,
    playerHp: raw.playerHp ?? null,
    playerMaxHp: raw.playerMaxHp ?? null,
    playerShield: raw.playerShield ?? null,
    enemyHp: raw.enemyHp ?? null,
    enemyMaxHp: raw.enemyMaxHp ?? null,
    enemyShield: raw.enemyShield ?? null,
    playerRockCharges: raw.playerRockCharges ?? null,
    playerPaperCharges: raw.playerPaperCharges ?? null,
    playerScissorCharges: raw.playerScissorCharges ?? null,
    enemyRockCharges: raw.enemyRockCharges ?? null,
    enemyPaperCharges: raw.enemyPaperCharges ?? null,
    enemyScissorCharges: raw.enemyScissorCharges ?? null,
    playerRockMaxCharges: raw.playerRockMaxCharges ?? null,
    playerPaperMaxCharges: raw.playerPaperMaxCharges ?? null,
    playerScissorMaxCharges: raw.playerScissorMaxCharges ?? null,
    enemyRockMaxCharges: raw.enemyRockMaxCharges ?? null,
    enemyPaperMaxCharges: raw.enemyPaperMaxCharges ?? null,
    enemyScissorMaxCharges: raw.enemyScissorMaxCharges ?? null,
    playerRockAtk: raw.playerRockAtk ?? null,
    playerPaperAtk: raw.playerPaperAtk ?? null,
    playerScissorAtk: raw.playerScissorAtk ?? null,
    enemyRockAtk: raw.enemyRockAtk ?? null,
    enemyPaperAtk: raw.enemyPaperAtk ?? null,
    enemyScissorAtk: raw.enemyScissorAtk ?? null,
    playerRockDef: raw.playerRockDef ?? null,
    playerPaperDef: raw.playerPaperDef ?? null,
    playerScissorDef: raw.playerScissorDef ?? null,
    enemyRockDef: raw.enemyRockDef ?? null,
    enemyPaperDef: raw.enemyPaperDef ?? null,
    enemyScissorDef: raw.enemyScissorDef ?? null,
    playerRockBlocked: raw.playerRockBlocked ?? null,
    playerPaperBlocked: raw.playerPaperBlocked ?? null,
    playerScissorBlocked: raw.playerScissorBlocked ?? null,
    enemyRockBlocked: raw.enemyRockBlocked ?? null,
    enemyPaperBlocked: raw.enemyPaperBlocked ?? null,
    enemyScissorBlocked: raw.enemyScissorBlocked ?? null,
    playerWon: Boolean(raw.playerWon),
    enemyWon: Boolean(raw.enemyWon),
    asOf: "after_exchange",
    playerBlocked: raw.playerBlocked ?? null,
    playerEvaded: raw.playerEvaded ?? null,
    playerCrit: raw.playerCrit ?? null,
    enemyCrit: raw.enemyCrit ?? null,
    doubleArmorRecover: raw.doubleArmorRecover ?? null,
    prevEnemyMove: raw.prevEnemyMove ?? null,
    prevPlayerMove: raw.prevPlayerMove ?? null,
    requestAction: raw.requestAction ?? null
  };
}
const VALID_MOVES = /* @__PURE__ */ new Set(["rock", "paper", "scissor"]);
function asNumber(value) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "" && Number.isFinite(Number(value))) {
    return Number(value);
  }
  return null;
}
function asString(value) {
  if (typeof value === "string") return value;
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return null;
}
function asBoolean(value) {
  if (typeof value === "boolean") return value;
  return null;
}
function isMoveValue(value) {
  return typeof value === "string" && VALID_MOVES.has(value);
}
function getCharges$1(player, move) {
  var _a;
  return asNumber((_a = player == null ? void 0 : player[move]) == null ? void 0 : _a.currentCharges);
}
function getMaxCharges(player, move) {
  var _a;
  return asNumber((_a = player == null ? void 0 : player[move]) == null ? void 0 : _a.maxCharges);
}
function getAtk(player, move) {
  var _a;
  return asNumber((_a = player == null ? void 0 : player[move]) == null ? void 0 : _a.currentATK);
}
function getDef(player, move) {
  var _a;
  return asNumber((_a = player == null ? void 0 : player[move]) == null ? void 0 : _a.currentDEF);
}
function getBlocked$1(player, move) {
  var _a;
  return asBoolean((_a = player == null ? void 0 : player[move]) == null ? void 0 : _a.blocked);
}
function getHp$1(player) {
  var _a;
  return asNumber((_a = player == null ? void 0 : player.health) == null ? void 0 : _a.current);
}
function getMaxHp$1(player) {
  var _a, _b;
  return asNumber((_a = player == null ? void 0 : player.health) == null ? void 0 : _a.currentMax) ?? asNumber((_b = player == null ? void 0 : player.health) == null ? void 0 : _b.max);
}
function getShield$1(player) {
  var _a, _b;
  return asNumber((_a = player == null ? void 0 : player.shield) == null ? void 0 : _a.current) ?? asNumber((_b = player == null ? void 0 : player.armor) == null ? void 0 : _b.current);
}
function resolveRpsWinner(playerMove, enemyMove) {
  if (playerMove === enemyMove) {
    return { playerWon: false, enemyWon: false };
  }
  const playerWon = RPS_BEATS[playerMove] === enemyMove;
  return { playerWon, enemyWon: !playerWon };
}
function extractMovesFromEvents(events) {
  let playerMove = null;
  let enemyMove = null;
  if (!Array.isArray(events)) {
    return { playerMove, enemyMove };
  }
  for (const raw of events) {
    const event = raw;
    if ((event == null ? void 0 : event.type) !== "use_move") continue;
    if (!isMoveValue(event.value)) continue;
    const playerId = asNumber(event.playerId);
    if (playerId === 0) playerMove = event.value;
    if (playerId === 1) enemyMove = event.value;
  }
  return { playerMove, enemyMove };
}
function eventTypeText(event) {
  if (!event || typeof event !== "object") return "";
  const e = event;
  return `${asString(e.type) ?? ""} ${asString(e.message) ?? ""} ${asString(e.name) ?? ""}`.toLowerCase();
}
function extractOutcomeFlags(events) {
  const flags = {
    playerBlocked: null,
    playerEvaded: null,
    playerCrit: null,
    enemyCrit: null,
    doubleArmorRecover: null
  };
  if (!Array.isArray(events)) return flags;
  for (const raw of events) {
    const text = eventTypeText(raw);
    if (!text) continue;
    if (text.includes("block")) flags.playerBlocked = true;
    if (text.includes("evade") || text.includes("evasion")) flags.playerEvaded = true;
    if (text.includes("double") && text.includes("armor")) flags.doubleArmorRecover = true;
    if (text.includes("crit") || text.includes("critical")) {
      const playerId = asNumber(raw.playerId);
      if (playerId === 1) flags.enemyCrit = true;
      else flags.playerCrit = true;
    }
  }
  return flags;
}
function buildId(actionToken, dungeonId, roomNumber, timestamp) {
  if (actionToken) return actionToken;
  return `${dungeonId ?? "na"}:${roomNumber ?? "na"}:${timestamp}`;
}
function parseDungeonActionResponse(response, capturedAt, requestAction) {
  var _a, _b;
  const timestamp = capturedAt ?? (/* @__PURE__ */ new Date()).toISOString();
  const body = response ?? {};
  const run = (_a = body.data) == null ? void 0 : _a.run;
  const events = (_b = body.data) == null ? void 0 : _b.events;
  const { dungeonId, roomNumber, enemyCid } = extractDungeonIds(response);
  const actionToken = asString(body.actionToken);
  const { playerMove, enemyMove } = extractMovesFromEvents(events);
  const action = (requestAction ?? "").toLowerCase();
  const looksLikeCombat = action === "rock" || action === "paper" || action === "scissor" || Boolean(playerMove || enemyMove);
  if (!looksLikeCombat) {
    return { move: null, diagnostic: null, isCombatExchange: false };
  }
  if (!playerMove || !enemyMove) {
    const diagnostic = {
      id: buildId(actionToken, dungeonId, roomNumber, timestamp),
      timestamp,
      reason: "missing_use_move_events",
      dungeonId,
      roomNumber,
      enemyCid,
      actionToken,
      playerMove,
      enemyMove
    };
    return { move: null, diagnostic, isCombatExchange: true };
  }
  const players = Array.isArray(run == null ? void 0 : run.players) ? run.players : [];
  const player = players[0];
  const enemy = players[1];
  const { playerWon, enemyWon } = resolveRpsWinner(playerMove, enemyMove);
  const outcomes = extractOutcomeFlags(events);
  const enemyMaxHp = getMaxHp$1(enemy);
  const resolvedEnemyCid = enemyCid ?? enemyMaxHp;
  const move = {
    id: buildId(actionToken, dungeonId, roomNumber, timestamp),
    timestamp,
    dungeonId,
    roomNumber,
    enemyCid: resolvedEnemyCid,
    fightId: makeFightId(dungeonId, roomNumber, resolvedEnemyCid, roomNumber),
    actionToken,
    playerMove,
    enemyMove,
    playerHp: getHp$1(player),
    playerMaxHp: getMaxHp$1(player),
    playerShield: getShield$1(player),
    enemyHp: getHp$1(enemy),
    enemyMaxHp,
    enemyShield: getShield$1(enemy),
    playerRockCharges: getCharges$1(player, "rock"),
    playerPaperCharges: getCharges$1(player, "paper"),
    playerScissorCharges: getCharges$1(player, "scissor"),
    enemyRockCharges: getCharges$1(enemy, "rock"),
    enemyPaperCharges: getCharges$1(enemy, "paper"),
    enemyScissorCharges: getCharges$1(enemy, "scissor"),
    playerRockMaxCharges: getMaxCharges(player, "rock"),
    playerPaperMaxCharges: getMaxCharges(player, "paper"),
    playerScissorMaxCharges: getMaxCharges(player, "scissor"),
    enemyRockMaxCharges: getMaxCharges(enemy, "rock"),
    enemyPaperMaxCharges: getMaxCharges(enemy, "paper"),
    enemyScissorMaxCharges: getMaxCharges(enemy, "scissor"),
    playerRockAtk: getAtk(player, "rock"),
    playerPaperAtk: getAtk(player, "paper"),
    playerScissorAtk: getAtk(player, "scissor"),
    enemyRockAtk: getAtk(enemy, "rock"),
    enemyPaperAtk: getAtk(enemy, "paper"),
    enemyScissorAtk: getAtk(enemy, "scissor"),
    playerRockDef: getDef(player, "rock"),
    playerPaperDef: getDef(player, "paper"),
    playerScissorDef: getDef(player, "scissor"),
    enemyRockDef: getDef(enemy, "rock"),
    enemyPaperDef: getDef(enemy, "paper"),
    enemyScissorDef: getDef(enemy, "scissor"),
    playerRockBlocked: getBlocked$1(player, "rock"),
    playerPaperBlocked: getBlocked$1(player, "paper"),
    playerScissorBlocked: getBlocked$1(player, "scissor"),
    enemyRockBlocked: getBlocked$1(enemy, "rock"),
    enemyPaperBlocked: getBlocked$1(enemy, "paper"),
    enemyScissorBlocked: getBlocked$1(enemy, "scissor"),
    playerWon,
    enemyWon,
    asOf: "after_exchange",
    playerBlocked: outcomes.playerBlocked,
    playerEvaded: outcomes.playerEvaded,
    playerCrit: outcomes.playerCrit,
    enemyCrit: outcomes.enemyCrit,
    doubleArmorRecover: outcomes.doubleArmorRecover,
    prevEnemyMove: null,
    prevPlayerMove: null,
    requestAction: requestAction ?? null
  };
  return { move, diagnostic: null, isCombatExchange: true };
}
function isDungeonActionUrl(url) {
  try {
    return new URL(url, "https://gigaverse.io").pathname.includes("/api/game/dungeon/action");
  } catch {
    return typeof url === "string" && url.includes("/api/game/dungeon/action");
  }
}
function isDungeonStateUrl(url) {
  try {
    return new URL(url, "https://gigaverse.io").pathname.includes("/api/game/dungeon/state");
  } catch {
    return typeof url === "string" && url.includes("/api/game/dungeon/state");
  }
}
function textOf(value) {
  if (typeof value === "string") return value.toLowerCase();
  if (typeof value === "number") return String(value);
  if (!value || typeof value !== "object") return "";
  try {
    return JSON.stringify(value).toLowerCase();
  } catch {
    return "";
  }
}
function moveFromUnknown(value) {
  var _a;
  if (isMoveValue(value)) return value;
  const s = (_a = asString(value)) == null ? void 0 : _a.toLowerCase();
  if (!s) return null;
  if (s === "rock" || s === "sword") return "rock";
  if (s === "paper" || s === "shield") return "paper";
  if (s === "scissor" || s === "scissors" || s === "spell" || s === "magic") return "scissor";
  return null;
}
function extractIntuitionFromResponse(response, capturedAt) {
  const body = response ?? {};
  const data = body.data ?? body;
  const run = data.run ?? {};
  const events = data.events;
  const ids = extractDungeonIds(response);
  const runId = ids.dungeonId;
  const enemyCid = ids.enemyCid;
  const roomNumber = ids.roomNumber;
  const direct = moveFromUnknown(data.ruledOutMove) ?? moveFromUnknown(data.intuitionMove) ?? moveFromUnknown(run.ruledOutMove) ?? moveFromUnknown(run.intuitionMove) ?? moveFromUnknown(data.enemyRuledOutMove);
  if (direct) {
    return {
      id: `${capturedAt}:api:${direct}`,
      runId,
      enemyCid,
      roomNumber,
      timestamp: capturedAt,
      ruledOutMove: direct,
      expiresAfterExchange: true,
      consumed: false,
      source: "api_event"
    };
  }
  if (Array.isArray(events)) {
    for (const raw of events) {
      if (!raw || typeof raw !== "object") continue;
      const e = raw;
      const blob = textOf(e);
      if (!blob.includes("intuition") && !blob.includes("ruled") && !blob.includes("predict")) {
        continue;
      }
      const move = moveFromUnknown(e.value) ?? moveFromUnknown(e.move) ?? moveFromUnknown(e.ruledOutMove) ?? moveFromUnknown(e.excludedMove);
      if (move) {
        return {
          id: `${capturedAt}:event:${move}`,
          runId,
          enemyCid,
          roomNumber,
          timestamp: capturedAt,
          ruledOutMove: move,
          expiresAfterExchange: true,
          consumed: false,
          source: "api_event"
        };
      }
    }
  }
  return null;
}
function intuitionFromUi(ruledOutMove, capturedAt, runId, enemyCid) {
  return {
    id: `${capturedAt}:ui:${ruledOutMove}`,
    runId,
    enemyCid,
    roomNumber: null,
    timestamp: capturedAt,
    ruledOutMove,
    expiresAfterExchange: true,
    consumed: false,
    source: "ui"
  };
}
function emptySkills() {
  return {
    blockChance: null,
    armorRecoverChance: null,
    critChance: null,
    intuitionChance: null,
    evasionChance: null
  };
}
function readChance(obj, keys) {
  for (const key of keys) {
    if (key in obj) {
      const n = asNumber(obj[key]);
      if (n != null) return n;
    }
  }
  return null;
}
function extractPlayerSkills(source) {
  const skills = emptySkills();
  if (!source || typeof source !== "object") return skills;
  const root = source;
  const candidates = [root];
  for (const key of ["skills", "playerSkills", "voidSkills", "stats", "data", "player"]) {
    const nested = root[key];
    if (nested && typeof nested === "object") candidates.push(nested);
  }
  for (const obj of candidates) {
    skills.blockChance ?? (skills.blockChance = readChance(obj, ["blockChance", "block", "BLOCK", "Block"]));
    skills.armorRecoverChance ?? (skills.armorRecoverChance = readChance(obj, [
      "armorRecoverChance",
      "tenacity",
      "TENACITY",
      "Tenacity"
    ]));
    skills.critChance ?? (skills.critChance = readChance(obj, ["critChance", "luck", "LUCK", "Luck", "crit"]));
    skills.intuitionChance ?? (skills.intuitionChance = readChance(obj, [
      "intuitionChance",
      "intuition",
      "INTUITION",
      "Intuition"
    ]));
    skills.evasionChance ?? (skills.evasionChance = readChance(obj, [
      "evasionChance",
      "evasion",
      "EVASION",
      "Evasion"
    ]));
  }
  return skills;
}
function parseLootOption(raw, timestamp, roomNumber, sourceAction) {
  if (!raw || typeof raw !== "object") return null;
  const o = raw;
  const boonTypeString = asString(o.boonTypeString) ?? asString(o.boonType) ?? asString(o.type) ?? asString(o.name);
  if (!boonTypeString) return null;
  const selectedVal1 = asNumber(o.selectedVal1) ?? asNumber(o.value1) ?? asNumber(o.val1);
  const selectedVal2 = asNumber(o.selectedVal2) ?? asNumber(o.value2) ?? asNumber(o.val2);
  return {
    id: `${timestamp}:${boonTypeString}:${selectedVal1 ?? ""}:${selectedVal2 ?? ""}`,
    boonTypeString,
    selectedVal1,
    selectedVal2,
    roomNumber,
    timestamp,
    sourceAction
  };
}
function extractLootOptions(response) {
  const body = response;
  const data = body.data ?? body;
  const run = data.run ?? {};
  const options = data.lootOptions ?? run.lootOptions ?? data.loot ?? run.loot ?? data.options;
  return Array.isArray(options) ? options : [];
}
function extractDungeonId(response) {
  return extractDungeonIds(response).dungeonId;
}
function extractRoom(response) {
  return extractDungeonIds(response).roomNumber;
}
function extractEnemyCid(response) {
  return extractDungeonIds(response).enemyCid;
}
function pickLootByAction(options, action) {
  if (!action) return null;
  const map = {
    loot_one: 0,
    loot_two: 1,
    loot_three: 2,
    loot_four: 3
  };
  const idx = map[action];
  if (idx == null) return null;
  return options[idx] ?? null;
}
function mergeRunContext(existing, response, capturedAt, requestAction) {
  const runId = extractDungeonId(response);
  if (runId == null && !existing) return null;
  const id = runId ?? existing.runId;
  const roomNumber = extractRoom(response) ?? (existing == null ? void 0 : existing.roomNumber) ?? null;
  const enemyCid = extractEnemyCid(response) ?? (existing == null ? void 0 : existing.enemyCid) ?? null;
  const skills = extractPlayerSkills(response);
  const abilityCtx = collectAbilityContext(response);
  const prev = existing ?? {
    runId: id,
    updatedAt: capturedAt,
    playerSkills: emptySkills(),
    activeBoons: [],
    enemyLoadout: null,
    lootHistory: [],
    enemyCid,
    roomNumber,
    source: "api",
    rawSafeSummary: null
  };
  const mergedSkills = {
    blockChance: skills.blockChance ?? prev.playerSkills.blockChance,
    armorRecoverChance: skills.armorRecoverChance ?? prev.playerSkills.armorRecoverChance,
    critChance: skills.critChance ?? prev.playerSkills.critChance,
    intuitionChance: skills.intuitionChance ?? prev.playerSkills.intuitionChance,
    evasionChance: skills.evasionChance ?? prev.playerSkills.evasionChance
  };
  const lootOptions = extractLootOptions(response);
  const selected = pickLootByAction(lootOptions, requestAction);
  const lootHistory = [...prev.lootHistory];
  const activeBoons = [...prev.activeBoons];
  if (selected) {
    const boon = parseLootOption(selected, capturedAt, roomNumber, requestAction);
    if (boon) {
      lootHistory.push(boon);
      activeBoons.push(boon);
    }
  }
  for (const opt of lootOptions.slice(0, 4)) {
    const boon = parseLootOption(opt, capturedAt, roomNumber, "observed_option");
    if (boon && (requestAction == null ? void 0 : requestAction.startsWith("loot_"))) ;
  }
  const summary = {
    requestAction,
    roomNumber,
    enemyCid,
    lootOptionCount: lootOptions.length,
    boonTypes: activeBoons.map((b) => b.boonTypeString).slice(-12)
  };
  return {
    ...prev,
    runId: id,
    updatedAt: capturedAt,
    playerSkills: mergedSkills,
    activeBoons,
    lootHistory,
    enemyLoadout: abilityCtx.enemyLoadout?.abilityIds?.length
      ? abilityCtx.enemyLoadout
      : prev.enemyLoadout,
    enemyAbilities: abilityCtx.enemyAbilities ?? prev.enemyAbilities ?? null,
    ourStatuses: abilityCtx.ourStatuses ?? prev.ourStatuses ?? null,
    enemyCid,
    roomNumber,
    source: "api",
    rawSafeSummary: summary
  };
}
function modelKeyFor(_dungeonId, enemyCid, _loadoutIds, _enemyMaxHp) {
  return enemyStatsKey(enemyCid);
}
function pct(current, max) {
  if (current == null || max == null || max <= 0) return null;
  return Math.max(0, Math.min(100, current / max * 100));
}
function hpBin(pctValue, fine) {
  if (pctValue == null) return "hp:na";
  if (fine) {
    if (pctValue < 20) return "hp:0-20";
    if (pctValue < 40) return "hp:20-40";
    if (pctValue < 60) return "hp:40-60";
    if (pctValue < 80) return "hp:60-80";
    return "hp:80-100";
  }
  if (pctValue < 25) return "hp:0-25";
  if (pctValue < 50) return "hp:25-50";
  if (pctValue < 75) return "hp:50-75";
  return "hp:75-100";
}
function shieldBin(shield) {
  if (shield == null) return "sh:na";
  if (shield <= 0) return "sh:0";
  if (shield <= 4) return "sh:low";
  return "sh:high";
}
function chargesBin(rock, paper, scissor) {
  return `ch:${rock ?? "x"}-${paper ?? "x"}-${scissor ?? "x"}`;
}
function stateKey(features, fine) {
  return [
    hpBin(features.enemyHpPct, fine),
    hpBin(features.playerHpPct, fine),
    shieldBin(features.enemyShield),
    chargesBin(
      features.enemyRockCharges,
      features.enemyPaperCharges,
      features.enemyScissorCharges
    ),
    ...features.boonTags.slice(0, 3).map((t) => `b:${t}`)
  ].join("|");
}
function buildFeaturesFromHistory(moves, run, ruledOutMove, snapshot = null, uiUnavailableMoves = []) {
  var _a;
  const dungeonId = (snapshot == null ? void 0 : snapshot.dungeonId) ?? (run == null ? void 0 : run.runId) ?? null;
  const sameDungeon =
    dungeonId != null ? moves.filter((m) => m.dungeonId === dungeonId) : run ? moves.filter((m) => m.dungeonId === run.runId) : moves;
  const sorted = [...sameDungeon].sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  const last = sorted[sorted.length - 1] ?? null;
  const loadoutIds = ((_a = run == null ? void 0 : run.enemyLoadout) == null ? void 0 : _a.abilityIds) ?? null;
  const enemyCid = (snapshot == null ? void 0 : snapshot.enemyCid) ?? (last == null ? void 0 : last.enemyCid) ?? (run == null ? void 0 : run.enemyCid) ?? null;
  const enemyMaxHp = (snapshot == null ? void 0 : snapshot.enemyMaxHp) ?? (last == null ? void 0 : last.enemyMaxHp) ?? null;
  const roomNumber = (snapshot == null ? void 0 : snapshot.roomNumber) ?? (last == null ? void 0 : last.roomNumber) ?? (run == null ? void 0 : run.roomNumber) ?? null;
  const resolvedDungeon = (snapshot == null ? void 0 : snapshot.dungeonId) ?? (last == null ? void 0 : last.dungeonId) ?? (run == null ? void 0 : run.runId) ?? null;
  const fightId = makeFightId(resolvedDungeon, roomNumber, enemyCid, last?.roomSeq ?? null);
  const fightMoves = sorted.filter(
    (m) =>
      (m.fightId && m.fightId === fightId) ||
      (m.dungeonId === resolvedDungeon &&
        m.enemyCid === enemyCid &&
        (roomNumber == null || m.roomNumber == null || m.roomNumber === roomNumber)),
  );
  const enemyMoves = fightMoves.map((m) => m.enemyMove);
  const playerHp = (snapshot == null ? void 0 : snapshot.playerHp) ?? (last == null ? void 0 : last.playerHp) ?? null;
  const playerMaxHp = (snapshot == null ? void 0 : snapshot.playerMaxHp) ?? (last == null ? void 0 : last.playerMaxHp) ?? null;
  const enemyHp = (snapshot == null ? void 0 : snapshot.enemyHp) ?? (last == null ? void 0 : last.enemyHp) ?? null;
  const pick = (key) => (snapshot == null ? void 0 : snapshot[key]) ?? (last == null ? void 0 : last[key]) ?? null;
  return {
    enemyCid,
    modelKey: modelKeyFor(resolvedDungeon, enemyCid, loadoutIds, enemyMaxHp),
    dungeonId: resolvedDungeon,
    roomNumber,
    fightId,
    fightRound: fightMoves.length + 1,
    playerHp,
    playerMaxHp,
    enemyHp,
    enemyMaxHp,
    playerHpPct: pct(playerHp, playerMaxHp),
    enemyHpPct: pct(enemyHp, enemyMaxHp),
    playerShield: pick("playerShield"),
    playerShieldMax: pick("playerShieldMax"),
    enemyShield: pick("enemyShield"),
    enemyShieldMax: pick("enemyShieldMax"),
    playerRockCharges: pick("playerRockCharges"),
    playerPaperCharges: pick("playerPaperCharges"),
    playerScissorCharges: pick("playerScissorCharges"),
    playerRockMaxCharges: pick("playerRockMaxCharges"),
    playerPaperMaxCharges: pick("playerPaperMaxCharges"),
    playerScissorMaxCharges: pick("playerScissorMaxCharges"),
    playerRockAtk: pick("playerRockAtk"),
    playerPaperAtk: pick("playerPaperAtk"),
    playerScissorAtk: pick("playerScissorAtk"),
    playerRockDef: pick("playerRockDef"),
    playerPaperDef: pick("playerPaperDef"),
    playerScissorDef: pick("playerScissorDef"),
    enemyRockCharges: pick("enemyRockCharges"),
    enemyPaperCharges: pick("enemyPaperCharges"),
    enemyScissorCharges: pick("enemyScissorCharges"),
    enemyRockMaxCharges: pick("enemyRockMaxCharges"),
    enemyPaperMaxCharges: pick("enemyPaperMaxCharges"),
    enemyScissorMaxCharges: pick("enemyScissorMaxCharges"),
    enemyRockAtk: pick("enemyRockAtk"),
    enemyPaperAtk: pick("enemyPaperAtk"),
    enemyScissorAtk: pick("enemyScissorAtk"),
    enemyRockDef: pick("enemyRockDef"),
    enemyPaperDef: pick("enemyPaperDef"),
    enemyScissorDef: pick("enemyScissorDef"),
    enemyRockBlocked: pick("enemyRockBlocked"),
    enemyPaperBlocked: pick("enemyPaperBlocked"),
    enemyScissorBlocked: pick("enemyScissorBlocked"),
    prevEnemyMove: enemyMoves[enemyMoves.length - 1] ?? null,
    prev2EnemyMoves: enemyMoves.slice(-2),
    prev3EnemyMoves: enemyMoves.slice(-3),
    prevPlayerMove: (last == null ? void 0 : last.playerMove) ?? null,
    ruledOutMove,
    uiUnavailableMoves: Array.isArray(uiUnavailableMoves) && uiUnavailableMoves.length === 3 ? [] : uiUnavailableMoves,
    boonTags: ((run == null ? void 0 : run.activeBoons) ?? []).map((b) => b.boonTypeString).slice(-8),
    playerSkills: (run == null ? void 0 : run.playerSkills) ?? null,
    enemyAbilities: (snapshot == null ? void 0 : snapshot.enemyAbilities) ?? (run == null ? void 0 : run.enemyAbilities) ?? null,
    ourStatuses: (snapshot == null ? void 0 : snapshot.ourStatuses) ?? (run == null ? void 0 : run.ourStatuses) ?? null,
    burnOnPaperWin: Boolean((snapshot == null ? void 0 : snapshot.burnOnPaperWin) ?? (run == null ? void 0 : run.enemyLoadout)?.burnOnPaperWin)
  };
}
function featuresForUpdate(move, priorMoves, run) {
  var _a, _b;
  const fightId =
    move.fightId ?? makeFightId(move.dungeonId, move.roomNumber, move.enemyCid, move.roomSeq ?? null);
  const runMoves = priorMoves
    .filter(
      (m) =>
        m.dungeonId === move.dungeonId &&
        ((m.fightId && m.fightId === fightId) ||
          (m.enemyCid === move.enemyCid &&
            (move.roomNumber == null || m.roomNumber == null || m.roomNumber === move.roomNumber))),
    )
    .sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  const enemyMoves = runMoves.map((m) => m.enemyMove);
  const loadoutIds = ((_a = run == null ? void 0 : run.enemyLoadout) == null ? void 0 : _a.abilityIds) ?? null;
  return {
    enemyCid: move.enemyCid,
    modelKey: modelKeyFor(move.dungeonId, move.enemyCid, loadoutIds, move.enemyMaxHp),
    dungeonId: move.dungeonId,
    roomNumber: move.roomNumber,
    fightId,
    playerHpPct: pct(move.playerHp, move.playerMaxHp),
    enemyHpPct: pct(move.enemyHp, move.enemyMaxHp),
    playerShield: move.playerShield,
    enemyShield: move.enemyShield,
    enemyRockCharges: move.enemyRockCharges,
    enemyPaperCharges: move.enemyPaperCharges,
    enemyScissorCharges: move.enemyScissorCharges,
    enemyRockBlocked: move.enemyRockBlocked,
    enemyPaperBlocked: move.enemyPaperBlocked,
    enemyScissorBlocked: move.enemyScissorBlocked,
    prevEnemyMove: enemyMoves[enemyMoves.length - 1] ?? null,
    prev2EnemyMoves: enemyMoves.slice(-2),
    prev3EnemyMoves: enemyMoves.slice(-3),
    prevPlayerMove: ((_b = runMoves[runMoves.length - 1]) == null ? void 0 : _b.playerMove) ?? null,
    ruledOutMove: null,
    uiUnavailableMoves: [],
    boonTags: ((run == null ? void 0 : run.activeBoons) ?? []).map((b) => b.boonTypeString).slice(-8),
    playerSkills: (run == null ? void 0 : run.playerSkills) ?? null
  };
}
function weightsForN(n) {
  if (n < 20) {
    return { base: 1, markov: 0, seq2: 0, seq3: 0, state: 0, confidence: "Low" };
  }
  if (n < 80) {
    return { base: 0.45, markov: 0.55, seq2: 0, seq3: 0, state: 0, confidence: "Low" };
  }
  if (n < 200) {
    return {
      base: 0.25,
      markov: 0.35,
      seq2: 0.25,
      seq3: 0,
      state: 0.15,
      confidence: "Medium"
    };
  }
  return {
    base: 0.15,
    markov: 0.25,
    seq2: 0.2,
    seq3: 0.2,
    state: 0.2,
    confidence: "High"
  };
}
function emptyProbs() {
  return { rock: 0, paper: 0, scissor: 0 };
}
function toPercents$1(probs) {
  const raw = MOVE_ORDER.map((m) => Math.round(probs[m] * 1e3) / 10);
  const sum = raw.reduce((a, b) => a + b, 0);
  if (sum === 0) return { rock: 0, paper: 0, scissor: 0 };
  const fixed = [...raw];
  const drift = Math.round((100 - sum) * 10) / 10;
  fixed[2] = Math.round((fixed[2] + drift) * 10) / 10;
  return { rock: fixed[0], paper: fixed[1], scissor: fixed[2] };
}
function topMove(probs) {
  let best = null;
  let bestP = -1;
  for (const move of MOVE_ORDER) {
    if (probs[move] > bestP) {
      bestP = probs[move];
      best = move;
    }
  }
  return bestP > 0 ? best : null;
}
function counterFor(enemyMove) {
  if (!enemyMove) return null;
  return RPS_COUNTER[enemyMove];
}
function strategyHint(topEnemy, skills) {
  const counter = counterFor(topEnemy);
  if (!counter || !topEnemy) return null;
  const base = `Counter ${MOVE_UI_LABELS[topEnemy]} → play ${MOVE_UI_LABELS[counter]}`;
  if (!skills) return base;
  const tips = [];
  if ((skills.evasionChance ?? 0) >= 10 || (skills.blockChance ?? 0) >= 15) {
    tips.push("defense procs high — ties/losses less punishing");
  }
  if ((skills.critChance ?? 0) >= 10) {
    tips.push("crit chance high — prefer winning exchanges");
  }
  if ((skills.intuitionChance ?? 0) >= 5) {
    tips.push("intuition may rule out a move");
  }
  return tips.length ? `${base} · ${tips.join("; ")}` : base;
}
function emptyCounts$1() {
  return { rock: 0, paper: 0, scissor: 0 };
}
function bump$1(counts, move) {
  counts[move] += 1;
}
function laplace(counts) {
  const c = counts ?? emptyCounts$1();
  const rock = c.rock + 1;
  const paper = c.paper + 1;
  const scissor = c.scissor + 1;
  const total = rock + paper + scissor;
  return { rock: rock / total, paper: paper / total, scissor: scissor / total };
}
function mix(parts) {
  const out = { rock: 0, paper: 0, scissor: 0 };
  let wSum = 0;
  for (const part of parts) {
    if (part.w <= 0) continue;
    wSum += part.w;
    for (const m of MOVE_ORDER) out[m] += part.w * part.p[m];
  }
  if (wSum <= 0) return laplace(void 0);
  for (const m of MOVE_ORDER) out[m] /= wSum;
  return out;
}
function createEmptyStore() {
  return {
    enemies: {},
    global: combatEmptyCounts(),
    globalN: 0,
    accuracy: { predictions: 0, top1Hits: 0, mostFrequentHits: 0 },
    lastPrediction: null
  };
}
function ensureEnemy(store, modelKey, enemyCid) {
  if (!store.enemies[modelKey]) {
    store.enemies[modelKey] = {
      modelKey,
      enemyCid,
      n: 0,
      base: combatEmptyCounts(),
      markov: {},
      updatedAt: (/* @__PURE__ */ new Date()).toISOString()
    };
  }
  return store.enemies[modelKey];
}
function updateModel(store, features, observed) {
  return updateCombatStats(store, features, observed);
}
function mostFrequentMove(enemy) {
  if (!enemy) return null;
  return topMove({
    rock: enemy.base.rock,
    paper: enemy.base.paper,
    scissor: enemy.base.scissor
  });
}
function predict(store, features) {
  const dist = predictEnemyDistribution(store, features);
  const n = dist.n;
  const probs = dist.probs;
  const unavailable = dist.unavailable;
  const locked = dist.locked === true;
  const top = topMove(probs);
  const maxP = top ? probs[top] : 0;
  const confidence = confidenceFromN(n, maxP);
  const counter = counterFor(top);
  const { us, enemy: enemyFighter } = fightersFromFeatures(features);
  const replyOpts = {
    enemyAbilities: features.enemyAbilities ?? null,
    ourStatuses: features.ourStatuses ?? null
  };
  const reply = chooseBestReply(us, enemyFighter, probs, replyOpts);
  const why = reply.why;
  return {
    modelKey: features.modelKey,
    enemyCid: features.enemyCid,
    probs,
    percents: toPercents$1(probs),
    n,
    confidence,
    topMove: top,
    counterMove: counter,
    recommendedMove: reply.move,
    recommendedEv: reply.ev,
    ranked: reply.ranked,
    why,
    locked,
    strategyHint: why ?? strategyHint(top, features.playerSkills),
    ruledOutMove: features.ruledOutMove,
    unavailable,
    pDeath: reply.pDeath,
    expectedHpAfter: reply.expectedHpAfter,
    expectedShieldAfter: reply.expectedShieldAfter,
    hpKnown: reply.hpKnown,
    vetoNotes: reply.vetoNotes ?? [],
    burnOnShieldWin: Boolean(reply.burnOnShieldWin || features.burnOnPaperWin),
    saferAlt: reply.saferAlt ?? null,
    updatedAt: (/* @__PURE__ */ new Date()).toISOString()
  };
}
function scorePrediction(store, prediction, actual) {
  if (!prediction || !prediction.topMove) return store;
  store.accuracy.predictions += 1;
  if (prediction.topMove === actual) store.accuracy.top1Hits += 1;
  const mf = mostFrequentMove(store.enemies[prediction.modelKey]);
  if (mf === actual) store.accuracy.mostFrequentHits += 1;
  return store;
}
function emptyCounts() {
  return { rock: 0, paper: 0, scissor: 0 };
}
function toPercents(counts) {
  const total = counts.rock + counts.paper + counts.scissor;
  if (total === 0) {
    return { rockPercent: 0, paperPercent: 0, scissorPercent: 0 };
  }
  return {
    rockPercent: roundPct(counts.rock, total),
    paperPercent: roundPct(counts.paper, total),
    scissorPercent: roundPct(counts.scissor, total)
  };
}
function roundPct(part, total) {
  return Math.round(part / total * 1e3) / 10;
}
function bump(counts, move) {
  counts[move] += 1;
}
function finalizeTransition(raw) {
  return {
    afterRock: { ...raw.rock, ...toPercents(raw.rock) },
    afterPaper: { ...raw.paper, ...toPercents(raw.paper) },
    afterScissor: { ...raw.scissor, ...toPercents(raw.scissor) }
  };
}
function groupByDungeon(moves) {
  const map = /* @__PURE__ */ new Map();
  for (const move of moves) {
    const key = String(move.dungeonId ?? `unknown:${move.id}`);
    const list = map.get(key) ?? [];
    list.push(move);
    map.set(key, list);
  }
  for (const list of map.values()) {
    list.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  }
  return map;
}
function collectTransitions(moves) {
  const raw = {
    rock: emptyCounts(),
    paper: emptyCounts(),
    scissor: emptyCounts()
  };
  for (const runMoves of groupByDungeon(moves).values()) {
    for (let i = 1; i < runMoves.length; i += 1) {
      const prev = runMoves[i - 1].enemyMove;
      const next = runMoves[i].enemyMove;
      bump(raw[prev], next);
    }
  }
  return finalizeTransition(raw);
}
function collectSequences(moves, length) {
  const buckets = /* @__PURE__ */ new Map();
  for (const runMoves of groupByDungeon(moves).values()) {
    for (let i = length; i < runMoves.length; i += 1) {
      const seqMoves = runMoves.slice(i - length, i).map((m) => m.enemyMove);
      const key = seqMoves.join("→");
      const counts = buckets.get(key) ?? emptyCounts();
      bump(counts, runMoves[i].enemyMove);
      buckets.set(key, counts);
    }
  }
  return [...buckets.entries()].map(([sequence, nextCounts]) => {
    const total = nextCounts.rock + nextCounts.paper + nextCounts.scissor;
    return {
      sequence,
      nextCounts,
      nextPercents: toPercents(nextCounts),
      total
    };
  }).sort((a, b) => b.total - a.total);
}
function buildEnemyStats(enemyCid, moves) {
  const counts = emptyCounts();
  for (const move of moves) {
    bump(counts, move.enemyMove);
  }
  const totalMoves = moves.length;
  const last = moves[moves.length - 1] ?? null;
  return {
    enemyCid,
    totalMoves,
    rockCount: counts.rock,
    paperCount: counts.paper,
    scissorCount: counts.scissor,
    ...toPercents(counts),
    transitions: collectTransitions(moves),
    sequences: {
      length1: collectSequences(moves, 1),
      length2: collectSequences(moves, 2),
      length3: collectSequences(moves, 3)
    },
    lastMove: (last == null ? void 0 : last.enemyMove) ?? null,
    lastTimestamp: (last == null ? void 0 : last.timestamp) ?? null
  };
}
function computeStats(moves) {
  const sorted = [...moves].sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  const byEnemyMap = /* @__PURE__ */ new Map();
  const dungeonIds = /* @__PURE__ */ new Set();
  const overallCounts = emptyCounts();
  for (const move of sorted) {
    bump(overallCounts, move.enemyMove);
    if (move.dungeonId != null) dungeonIds.add(move.dungeonId);
    if (move.enemyCid == null) continue;
    const list = byEnemyMap.get(move.enemyCid) ?? [];
    list.push(move);
    byEnemyMap.set(move.enemyCid, list);
  }
  const byEnemy = [...byEnemyMap.entries()].map(([enemyCid, enemyMoves]) => buildEnemyStats(enemyCid, enemyMoves)).sort((a, b) => b.totalMoves - a.totalMoves || a.enemyCid - b.enemyCid);
  const overall = {
    totalMoves: sorted.length,
    uniqueEnemies: byEnemy.length,
    runs: dungeonIds.size,
    rockCount: overallCounts.rock,
    paperCount: overallCounts.paper,
    scissorCount: overallCounts.scissor,
    ...toPercents(overallCounts),
    transitions: collectTransitions(sorted)
  };
  const lastMove = sorted[sorted.length - 1] ?? null;
  const lastEnemyCid = (lastMove == null ? void 0 : lastMove.enemyCid) ?? null;
  const lastEnemyStats = lastEnemyCid != null ? byEnemy.find((e) => e.enemyCid === lastEnemyCid) ?? null : null;
  return {
    overall,
    byEnemy,
    lastEnemy: lastEnemyCid == null ? null : {
      enemyCid: lastEnemyCid,
      moves: (lastEnemyStats == null ? void 0 : lastEnemyStats.totalMoves) ?? 0,
      lastMove: (lastMove == null ? void 0 : lastMove.enemyMove) ?? null
    }
  };
}
const CSV_HEADERS = [
  "timestamp",
  "dungeonId",
  "roomNumber",
  "enemyCid",
  "actionToken",
  "playerMove",
  "enemyMove",
  "playerHp",
  "enemyHp",
  "playerShield",
  "enemyShield",
  "playerRockAtk",
  "enemyRockAtk",
  "playerPaperAtk",
  "enemyPaperAtk",
  "playerScissorAtk",
  "enemyScissorAtk",
  "playerWon",
  "enemyWon",
  "prevEnemyMove",
  "playerBlocked",
  "playerEvaded",
  "playerCrit"
];
function csvEscape(value) {
  if (value == null) return "";
  const str = String(value);
  if (/[",\n\r]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}
function movesToCsv(moves) {
  const lines = [CSV_HEADERS.join(",")];
  for (const move of moves) {
    const row = CSV_HEADERS.map((key) => csvEscape(move[key]));
    lines.push(row.join(","));
  }
  return lines.join("\n");
}
const DB_NAME = "gdc";
const DB_VERSION = 2;
const STORE_MOVES = "moves";
const STORE_DIAGNOSTICS = "diagnostics";
const STORE_META = "meta";
const STORE_RUNS = "runContexts";
const STORE_INTUITION = "intuitionEvents";
const STORE_SNAPSHOTS = "apiSnapshots";
const STORE_MODEL = "modelState";
const META_KEY = "state";
const MODEL_KEY = "predictor";
const DEFAULT_META = {
  debug: false,
  predictionEnabled: true,
  inCombat: false,
  combatSnapshot: null,
  uiUnavailableMoves: [],
  lastCaptureAt: null,
  lastEnemyCid: null,
  lastEnemyMove: null,
  lastPrediction: null,
  activeIntuition: null,
  accuracyPredictions: 0,
  accuracyTop1Hits: 0,
  accuracyMostFrequentHits: 0
};
function openDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onerror = () => reject(request.error ?? new Error("IndexedDB open failed"));
    request.onsuccess = () => resolve(request.result);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_MOVES)) {
        const moves = db.createObjectStore(STORE_MOVES, { keyPath: "id" });
        moves.createIndex("enemyCid", "enemyCid", { unique: false });
        moves.createIndex("timestamp", "timestamp", { unique: false });
        moves.createIndex("dungeonId", "dungeonId", { unique: false });
      }
      if (!db.objectStoreNames.contains(STORE_DIAGNOSTICS)) {
        db.createObjectStore(STORE_DIAGNOSTICS, { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains(STORE_META)) {
        db.createObjectStore(STORE_META, { keyPath: "key" });
      }
      if (!db.objectStoreNames.contains(STORE_RUNS)) {
        db.createObjectStore(STORE_RUNS, { keyPath: "runId" });
      }
      if (!db.objectStoreNames.contains(STORE_INTUITION)) {
        const store = db.createObjectStore(STORE_INTUITION, { keyPath: "id" });
        store.createIndex("runId", "runId", { unique: false });
      }
      if (!db.objectStoreNames.contains(STORE_SNAPSHOTS)) {
        db.createObjectStore(STORE_SNAPSHOTS, { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains(STORE_MODEL)) {
        db.createObjectStore(STORE_MODEL, { keyPath: "key" });
      }
    };
  });
}
function reqToPromise(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("IndexedDB request failed"));
  });
}
function txDone(tx) {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error("IndexedDB transaction failed"));
    tx.onabort = () => reject(tx.error ?? new Error("IndexedDB transaction aborted"));
  });
}
async function addMove(move) {
  const db = await openDb();
  try {
    const tx = db.transaction(STORE_MOVES, "readwrite");
    const store = tx.objectStore(STORE_MOVES);
    const existing = await reqToPromise(store.get(move.id));
    if (existing) {
      await txDone(tx);
      return "duplicate";
    }
    store.put(move);
    await txDone(tx);
    return "saved";
  } finally {
    db.close();
  }
}
async function upsertMoves(moves) {
  let saved = 0;
  let skipped = 0;
  for (const move of moves) {
    const result = await addMove(move);
    if (result === "saved") saved += 1;
    else skipped += 1;
  }
  return { saved, skipped };
}
async function addDiagnostic(record) {
  const db = await openDb();
  try {
    const tx = db.transaction(STORE_DIAGNOSTICS, "readwrite");
    const store = tx.objectStore(STORE_DIAGNOSTICS);
    const existing = await reqToPromise(store.get(record.id));
    if (existing) {
      await txDone(tx);
      return "duplicate";
    }
    store.put(record);
    await txDone(tx);
    return "saved";
  } finally {
    db.close();
  }
}
async function getAllMoves() {
  const db = await openDb();
  try {
    const tx = db.transaction(STORE_MOVES, "readonly");
    const rows = await reqToPromise(tx.objectStore(STORE_MOVES).getAll());
    await txDone(tx);
    return rows.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  } finally {
    db.close();
  }
}
async function getMoveCount() {
  const db = await openDb();
  try {
    const tx = db.transaction(STORE_MOVES, "readonly");
    const count = await reqToPromise(tx.objectStore(STORE_MOVES).count());
    await txDone(tx);
    return count;
  } finally {
    db.close();
  }
}
async function upsertRunContext(ctx) {
  const db = await openDb();
  try {
    const tx = db.transaction(STORE_RUNS, "readwrite");
    tx.objectStore(STORE_RUNS).put(ctx);
    await txDone(tx);
  } finally {
    db.close();
  }
}
async function getRunContext(runId) {
  const db = await openDb();
  try {
    const tx = db.transaction(STORE_RUNS, "readonly");
    const row = await reqToPromise(tx.objectStore(STORE_RUNS).get(runId));
    await txDone(tx);
    return row ?? null;
  } finally {
    db.close();
  }
}
async function getAllRunContexts() {
  const db = await openDb();
  try {
    const tx = db.transaction(STORE_RUNS, "readonly");
    const rows = await reqToPromise(tx.objectStore(STORE_RUNS).getAll());
    await txDone(tx);
    return rows;
  } finally {
    db.close();
  }
}
async function addIntuitionEvent(event) {
  const db = await openDb();
  try {
    const tx = db.transaction(STORE_INTUITION, "readwrite");
    tx.objectStore(STORE_INTUITION).put(event);
    await txDone(tx);
  } finally {
    db.close();
  }
}
async function getAllIntuitionEvents() {
  const db = await openDb();
  try {
    const tx = db.transaction(STORE_INTUITION, "readonly");
    const rows = await reqToPromise(tx.objectStore(STORE_INTUITION).getAll());
    await txDone(tx);
    return rows;
  } finally {
    db.close();
  }
}
async function addApiSnapshot(snapshot) {
  const db = await openDb();
  try {
    const tx = db.transaction(STORE_SNAPSHOTS, "readwrite");
    tx.objectStore(STORE_SNAPSHOTS).put(snapshot);
    await txDone(tx);
  } finally {
    db.close();
  }
}
async function getAllApiSnapshots() {
  const db = await openDb();
  try {
    const tx = db.transaction(STORE_SNAPSHOTS, "readonly");
    const rows = await reqToPromise(tx.objectStore(STORE_SNAPSHOTS).getAll());
    await txDone(tx);
    return rows;
  } finally {
    db.close();
  }
}
async function getPredictorStore() {
  const db = await openDb();
  try {
    const tx = db.transaction(STORE_MODEL, "readonly");
    const row = await reqToPromise(tx.objectStore(STORE_MODEL).get(MODEL_KEY));
    await txDone(tx);
    if (!row) return createEmptyStore();
    const base = createEmptyStore();
    const { key: _k, ...store } = row;
    return {
      ...base,
      ...store,
      global: store.global ?? base.global,
      globalN: store.globalN ?? countTotal(store.global) ?? 0
    };
  } finally {
    db.close();
  }
}
async function savePredictorStore(store) {
  const db = await openDb();
  try {
    const tx = db.transaction(STORE_MODEL, "readwrite");
    tx.objectStore(STORE_MODEL).put({ key: MODEL_KEY, ...store });
    await txDone(tx);
  } finally {
    db.close();
  }
}
async function clearAll() {
  const db = await openDb();
  try {
    const names = [
      STORE_MOVES,
      STORE_DIAGNOSTICS,
      STORE_META,
      STORE_RUNS,
      STORE_INTUITION,
      STORE_SNAPSHOTS,
      STORE_MODEL
    ];
    const tx = db.transaction(names, "readwrite");
    for (const name of names) {
      if (name === STORE_META) {
        tx.objectStore(name).put({ key: META_KEY, ...DEFAULT_META });
      } else if (name === STORE_MODEL) {
        tx.objectStore(name).put({ key: MODEL_KEY, ...createEmptyStore() });
      } else {
        tx.objectStore(name).clear();
      }
    }
    await txDone(tx);
  } finally {
    db.close();
  }
}
async function resetModelOnly() {
  await savePredictorStore(createEmptyStore());
  await setMeta({
    lastPrediction: null,
    accuracyPredictions: 0,
    accuracyTop1Hits: 0,
    accuracyMostFrequentHits: 0
  });
}
async function getMeta() {
  const db = await openDb();
  try {
    const tx = db.transaction(STORE_META, "readonly");
    const row = await reqToPromise(tx.objectStore(STORE_META).get(META_KEY));
    await txDone(tx);
    if (!row) return { ...DEFAULT_META };
    const { key: _key, ...meta } = row;
    return { ...DEFAULT_META, ...meta };
  } finally {
    db.close();
  }
}
async function setMeta(patch) {
  const current = await getMeta();
  const next = { ...current, ...patch };
  const db = await openDb();
  try {
    const tx = db.transaction(STORE_META, "readwrite");
    tx.objectStore(STORE_META).put({ key: META_KEY, ...next });
    await txDone(tx);
    return next;
  } finally {
    db.close();
  }
}
function getHp(player) {
  var _a;
  return asNumber((_a = player == null ? void 0 : player.health) == null ? void 0 : _a.current);
}
function getMaxHp(player) {
  var _a, _b;
  return asNumber((_a = player == null ? void 0 : player.health) == null ? void 0 : _a.currentMax) ?? asNumber((_b = player == null ? void 0 : player.health) == null ? void 0 : _b.max);
}
function getShield(player) {
  var _a, _b;
  return asNumber((_a = player == null ? void 0 : player.shield) == null ? void 0 : _a.current) ?? asNumber((_b = player == null ? void 0 : player.armor) == null ? void 0 : _b.current);
}
function getCharges(player, move) {
  var _a;
  return asNumber((_a = player == null ? void 0 : player[move]) == null ? void 0 : _a.currentCharges);
}
function getBlocked(player, move) {
  var _a;
  return asBoolean((_a = player == null ? void 0 : player[move]) == null ? void 0 : _a.blocked);
}
function getMaxShield(player) {
  var _a, _b, _c, _d;
  return asNumber((_a = player == null ? void 0 : player.shield) == null ? void 0 : _a.currentMax) ?? asNumber((_b = player == null ? void 0 : player.shield) == null ? void 0 : _b.max) ?? asNumber((_c = player == null ? void 0 : player.shield) == null ? void 0 : _c.startingMax) ?? asNumber((_d = player == null ? void 0 : player.armor) == null ? void 0 : _d.currentMax);
}
function extractCombatSnapshot(response, capturedAt, requestAction) {
  const body = response ?? {};
  const data = body.data ?? {};
  const run = data.run ?? {};
  const players = Array.isArray(run.players) ? run.players : [];
  const player = players[0];
  const enemy = players[1];
  const ids = extractDungeonIds(response);
  const enemyHp = getHp(enemy);
  const enemyMaxHp = getMaxHp(enemy);
  const lootPhase = Boolean(
    data.lootPhase ?? run.lootPhase
  );
  const action = (requestAction ?? "").toLowerCase();
  const isLootAction = action.startsWith("loot_");
  const hasFighters = Boolean(player && enemy);
  const enemyAlive = enemyHp != null && enemyHp > 0;
  const inCombat = hasFighters && enemyAlive && !lootPhase && !isLootAction;
  let reason = "ok";
  if (!hasFighters) reason = "no_fighters";
  else if (!enemyAlive) reason = "enemy_down";
  else if (lootPhase || isLootAction) reason = "loot_phase";
  const enemyCid = ids.enemyCid ?? (inCombat ? enemyMaxHp : null);
  return {
    updatedAt: capturedAt,
    inCombat,
    dungeonId: ids.dungeonId,
    roomNumber: ids.roomNumber,
    enemyCid,
    enemyMaxHp,
    playerHp: getHp(player),
    playerMaxHp: getMaxHp(player),
    playerShield: getShield(player),
    playerShieldMax: getMaxShield(player),
    enemyHp,
    enemyShield: getShield(enemy),
    enemyShieldMax: getMaxShield(enemy),
    playerRockCharges: getCharges(player, "rock"),
    playerPaperCharges: getCharges(player, "paper"),
    playerScissorCharges: getCharges(player, "scissor"),
    playerRockMaxCharges: getMaxCharges(player, "rock"),
    playerPaperMaxCharges: getMaxCharges(player, "paper"),
    playerScissorMaxCharges: getMaxCharges(player, "scissor"),
    playerRockAtk: getAtk(player, "rock"),
    playerPaperAtk: getAtk(player, "paper"),
    playerScissorAtk: getAtk(player, "scissor"),
    playerRockDef: getDef(player, "rock"),
    playerPaperDef: getDef(player, "paper"),
    playerScissorDef: getDef(player, "scissor"),
    enemyRockCharges: getCharges(enemy, "rock"),
    enemyPaperCharges: getCharges(enemy, "paper"),
    enemyScissorCharges: getCharges(enemy, "scissor"),
    enemyRockMaxCharges: getMaxCharges(enemy, "rock"),
    enemyPaperMaxCharges: getMaxCharges(enemy, "paper"),
    enemyScissorMaxCharges: getMaxCharges(enemy, "scissor"),
    enemyRockAtk: getAtk(enemy, "rock"),
    enemyPaperAtk: getAtk(enemy, "paper"),
    enemyScissorAtk: getAtk(enemy, "scissor"),
    enemyRockDef: getDef(enemy, "rock"),
    enemyPaperDef: getDef(enemy, "paper"),
    enemyScissorDef: getDef(enemy, "scissor"),
    enemyRockBlocked: getBlocked(enemy, "rock"),
    enemyPaperBlocked: getBlocked(enemy, "paper"),
    enemyScissorBlocked: getBlocked(enemy, "scissor"),
    reason,
    ...(() => {
      const ctx = collectAbilityContext(response);
      return {
        enemyAbilities: ctx.enemyAbilities,
        ourStatuses: ctx.ourStatuses,
        burnOnPaperWin: ctx.burnOnPaperWin
      };
    })()
  };
}
function debugLog(enabled, ...args) {
  if (!enabled) return;
  console.log("[GDC]", ...args);
}
function exportFilename(ext) {
  const stamp = (/* @__PURE__ */ new Date()).toISOString().replace(/[:.]/g, "-");
  return `gigaverse-combat-${stamp}.${ext}`;
}

async function broadcastFishing(view, inFishing, debug) {
  try {
    const tabs = await chrome.tabs.query({ url: ["https://gigaverse.io/play", "https://gigaverse.io/play*"] });
    for (const tab of tabs) {
      if (!tab.id) continue;
      try {
        await chrome.tabs.sendMessage(tab.id, {
          type: "FISHING_UPDATE",
          view: inFishing ? view : null,
          inFishing: Boolean(inFishing),
          debug: Boolean(debug),
        });
      } catch {
      }
    }
  } catch {
  }
}

async function broadcastPrediction(prediction, enabled, inCombat) {
  try {
    const tabs = await chrome.tabs.query({ url: ["https://gigaverse.io/play", "https://gigaverse.io/play*"] });
    for (const tab of tabs) {
      if (!tab.id) continue;
      try {
        await chrome.tabs.sendMessage(tab.id, {
          type: "PREDICTION_UPDATE",
          prediction: inCombat ? prediction : null,
          enabled,
          inCombat
        });
      } catch {
      }
    }
  } catch {
  }
}
async function rebuildModelFromMoves() {
  const moves = await getAllMoves();
  let store = createEmptyStore();
  const byDungeon = /* @__PURE__ */ new Map();
  for (const move of moves) {
    const key = move.dungeonId ?? move.id;
    const list = byDungeon.get(key) ?? [];
    list.push(move);
    byDungeon.set(key, list);
  }
  for (const list of byDungeon.values()) {
    const sorted = [...list].sort((a, b) => a.timestamp.localeCompare(b.timestamp));
    for (let i = 0; i < sorted.length; i += 1) {
      const move = sorted[i];
      const prior = sorted.slice(0, i);
      const run = move.dungeonId != null ? await getRunContext(move.dungeonId) : null;
      const features = featuresForUpdate(move, prior, run);
      store = updateModel(store, features, move.enemyMove);
    }
  }
  await savePredictorStore(store);
  await setMeta({
    accuracyPredictions: 0,
    accuracyTop1Hits: 0,
    accuracyMostFrequentHits: 0,
    lastPrediction: null
  });
}
async function refreshPrediction() {
  var _a;
  const meta = await getMeta();
  if (!meta.predictionEnabled) {
    await broadcastPrediction(null, false, false);
    return null;
  }
  const snapAgeMs = meta.combatSnapshot ? Date.now() - Date.parse(meta.combatSnapshot.updatedAt) : Number.POSITIVE_INFINITY;
  const stale = !meta.combatSnapshot || snapAgeMs > 12e4;
  if (!meta.inCombat || stale) {
    if (meta.inCombat && stale) {
      await setMeta({
        inCombat: false,
        combatSnapshot: null,
        lastPrediction: null,
        uiUnavailableMoves: []
      });
    } else {
      await setMeta({ lastPrediction: null });
    }
    await broadcastPrediction(null, true, false);
    return null;
  }
  const snapshot = meta.combatSnapshot;
  const moves = await getAllMoves();
  const runId = snapshot.dungeonId;
  const run = runId != null ? await getRunContext(runId) : null;
  const ruledOut = ((_a = meta.activeIntuition) == null ? void 0 : _a.ruledOutMove) ?? null;
  const features = buildFeaturesFromHistory(
    moves,
    run,
    ruledOut,
    snapshot,
    meta.uiUnavailableMoves ?? []
  );
  const store = await getPredictorStore();
  const prediction = predict(store, features);
  store.lastPrediction = prediction;
  await savePredictorStore(store);
  await setMeta({
    lastPrediction: prediction,
    lastEnemyCid: snapshot.enemyCid ?? meta.lastEnemyCid,
    accuracyPredictions: store.accuracy.predictions,
    accuracyTop1Hits: store.accuracy.top1Hits,
    accuracyMostFrequentHits: store.accuracy.mostFrequentHits
  });
  await broadcastPrediction(prediction, true, true);
  return prediction;
}
function compactSnapshot(url, method, capturedAt, requestAction, response, kind) {
  const body = response ?? {};
  const data = body.data ?? {};
  const run = data.run ?? {};
  const entity = data.entity ?? {};
  return {
    id: `${capturedAt}:${method}:${url}:${requestAction ?? ""}`,
    timestamp: capturedAt,
    url,
    method,
    requestAction: requestAction ?? null,
    kind,
    summary: {
      success: body.success ?? null,
      actionToken: body.actionToken ?? null,
      requestAction: requestAction ?? null,
      dungeonId: run.DUNGEON_ID_CID ?? entity.DUNGEON_ID_CID ?? null,
      roomNumber: entity.ROOM_NUM_CID ?? run.ROOM_NUM_CID ?? null,
      enemyCid: entity.ENEMY_CID ?? entity.ENEMY_ID_CID ?? run.ENEMY_CID ?? null,
      eventTypes: Array.isArray(data.events) ? data.events.map((e) => e == null ? void 0 : e.type).slice(0, 20) : [],
      keys: Object.keys(data).slice(0, 30),
      entityKeys: Object.keys(entity).slice(0, 30)
    }
  };
}
async function handleCapture(payload) {
  var _a, _b;
  const meta = await getMeta();
  const isAction = isDungeonActionUrl(payload.url);
  const isState = isDungeonStateUrl(payload.url);
  debugLog(meta.debug, isState ? "state detected" : "action detected", payload.requestAction ?? "");
  await addApiSnapshot(
    compactSnapshot(
      payload.url,
      payload.method,
      payload.capturedAt,
      payload.requestAction,
      payload.response,
      isState ? "state" : isAction ? "action" : "other"
    )
  );
  const snapshot = extractCombatSnapshot(
    payload.response,
    payload.capturedAt,
    payload.requestAction
  );
  const enemyChanged = ((_a = meta.combatSnapshot) == null ? void 0 : _a.enemyCid) != null && snapshot.enemyCid != null && meta.combatSnapshot.enemyCid !== snapshot.enemyCid;
  const roomChanged = ((_b = meta.combatSnapshot) == null ? void 0 : _b.roomNumber) != null && snapshot.roomNumber != null && meta.combatSnapshot.roomNumber !== snapshot.roomNumber;
  await setMeta({
    inCombat: snapshot.inCombat,
    combatSnapshot: snapshot.inCombat ? snapshot : null,
    uiUnavailableMoves: enemyChanged || roomChanged || !snapshot.inCombat ? [] : meta.uiUnavailableMoves,
    lastCaptureAt: payload.capturedAt,
    lastEnemyCid: snapshot.enemyCid ?? meta.lastEnemyCid
  });
  const existingRunId = snapshot.dungeonId;
  const existing = existingRunId != null ? await getRunContext(existingRunId) : null;
  const merged = mergeRunContext(
    existing,
    payload.response,
    payload.capturedAt,
    payload.requestAction ?? null
  );
  if (merged) await upsertRunContext(merged);
  const intuition = extractIntuitionFromResponse(payload.response, payload.capturedAt);
  if (intuition) {
    await addIntuitionEvent(intuition);
    await setMeta({
      activeIntuition: {
        ruledOutMove: intuition.ruledOutMove,
        runId: intuition.runId,
        enemyCid: intuition.enemyCid
      }
    });
    debugLog(meta.debug, "[PRED] intuition ruled out:", intuition.ruledOutMove);
  }
  let result = {
    saved: false,
    duplicate: false,
    inCombat: snapshot.inCombat,
    enemyCid: snapshot.enemyCid
  };
  if (isAction) {
    const parsed = parseDungeonActionResponse(
      payload.response,
      payload.capturedAt,
      payload.requestAction
    );
    if (parsed.diagnostic) {
      await addDiagnostic(parsed.diagnostic);
      result = {
        ...result,
        saved: false,
        duplicate: false,
        diagnostic: parsed.diagnostic.reason
      };
    } else if (parsed.move) {
      const moves = await getAllMoves();
      const prior = moves.filter((m) => m.dungeonId === parsed.move.dungeonId);
      const lastPrior = prior[prior.length - 1];
      const move = {
        ...parsed.move,
        // Prefer live entity CID from snapshot when parser fell back to maxHp
        enemyCid: snapshot.enemyCid ?? parsed.move.enemyCid,
        roomNumber: snapshot.roomNumber ?? parsed.move.roomNumber,
        prevEnemyMove: (lastPrior == null ? void 0 : lastPrior.enemyMove) ?? null,
        prevPlayerMove: (lastPrior == null ? void 0 : lastPrior.playerMove) ?? null
      };
      const addResult = await addMove(move);
      if (addResult === "duplicate") {
        debugLog(meta.debug, "skipped duplicate");
        result = {
          ...result,
          saved: false,
          duplicate: true,
          enemyCid: move.enemyCid,
          playerMove: move.playerMove,
          enemyMove: move.enemyMove,
          actionToken: move.actionToken
        };
        await setMeta({
          lastEnemyCid: move.enemyCid,
          lastEnemyMove: move.enemyMove
        });
      } else {
        let store = await getPredictorStore();
        if (meta.lastPrediction && meta.inCombat) {
          store = scorePrediction(store, meta.lastPrediction, move.enemyMove);
        }
        const run = move.dungeonId != null ? await getRunContext(move.dungeonId) : null;
        const updateFeatures = featuresForUpdate(move, prior, run);
        store = updateModel(store, updateFeatures, move.enemyMove);
        debugLog(meta.debug, "enemyCid:", move.enemyCid);
        debugLog(meta.debug, "playerMove:", move.playerMove);
        debugLog(meta.debug, "enemyMove:", move.enemyMove);
        debugLog(meta.debug, "actionToken:", move.actionToken);
        debugLog(meta.debug, "saved");
        result = {
          ...result,
          saved: true,
          duplicate: false,
          enemyCid: move.enemyCid,
          playerMove: move.playerMove,
          enemyMove: move.enemyMove,
          actionToken: move.actionToken
        };
        await setMeta({
          lastEnemyCid: move.enemyCid,
          lastEnemyMove: move.enemyMove,
          activeIntuition: null,
          uiUnavailableMoves: [],
          accuracyPredictions: store.accuracy.predictions,
          accuracyTop1Hits: store.accuracy.top1Hits,
          accuracyMostFrequentHits: store.accuracy.mostFrequentHits
        });
        await savePredictorStore(store);
      }
    }
  }
  const prediction = await refreshPrediction();
  if (prediction && meta.debug) {
    console.log("[GDC][PRED]", prediction.percents, "n=", prediction.n, prediction.confidence);
  }
  return { ...result, prediction, inCombat: snapshot.inCombat };
}
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  void (async () => {
    var _a, _b;
    try {
      switch (message.type) {
        case "ACTION_CAPTURED":
        case "STATE_CAPTURED": {
          const result = await handleCapture(message.payload);
          const metaNow = await getMeta();
          const fishing = await ingestFishingCapture(message.payload, {
            debug: metaNow.debug,
            inCombat: Boolean(result.inCombat ?? metaNow.inCombat)
          });
          if (result.inCombat) {
            await broadcastFishing(null, false, metaNow.debug);
          } else if (fishing.handled || fishing.reason === "combat_payload" || fishing.reason === "in_combat") {
            await broadcastFishing(fishing.view ?? null, Boolean(fishing.inFishing), metaNow.debug);
          }
          sendResponse({ ok: true, ...result, fishing });
          break;
        }
        case "INTUITION_UI": {
          const event = intuitionFromUi(
            message.ruledOutMove,
            (/* @__PURE__ */ new Date()).toISOString(),
            message.runId ?? null,
            message.enemyCid ?? null
          );
          await addIntuitionEvent(event);
          await setMeta({
            activeIntuition: {
              ruledOutMove: event.ruledOutMove,
              runId: event.runId,
              enemyCid: event.enemyCid
            }
          });
          const prediction = await refreshPrediction();
          sendResponse({ ok: true, prediction });
          break;
        }
        case "UNAVAILABLE_MOVES_UI": {
          const meta = await getMeta();
          if (!meta.inCombat) {
            sendResponse({ ok: true, ignored: true });
            break;
          }
          let moves = (message.moves ?? []).filter(
            (m) => m === "rock" || m === "paper" || m === "scissor"
          );
          if (moves.length === 3) {
            sendResponse({ ok: true, ignored: true, reason: "all_three_ui" });
            break;
          }
          const snap = meta.combatSnapshot;
          if (snap) {
            const apiCharges = {
              rock: snap.enemyRockCharges,
              paper: snap.enemyPaperCharges,
              scissor: snap.enemyScissorCharges
            };
            moves = moves.filter((m) => {
              const api = apiCharges[m];
              return !(typeof api === "number" && Number.isFinite(api) && api > 0);
            });
          }
          const prev = meta.uiUnavailableMoves ?? [];
          const same = prev.length === moves.length && prev.every((m) => moves.includes(m));
          if (!same) {
            await setMeta({ uiUnavailableMoves: moves });
            debugLog(meta.debug, "[PRED] ui unavailable:", moves.join(","));
          }
          const prediction = await refreshPrediction();
          sendResponse({ ok: true, prediction, moves });
          break;
        }
        case "HUB_UI": {
          await setMeta({
            inCombat: false,
            combatSnapshot: null,
            lastPrediction: null,
            uiUnavailableMoves: [],
            activeIntuition: null
          });
          await clearFishingUiState({ reason: "hub_ui" });
          await broadcastPrediction(null, true, false);
          await broadcastFishing(null, false, false);
          sendResponse({ ok: true });
          break;
        }
        case "GET_STATUS": {
          const meta = await getMeta();
          sendResponse({
            ok: true,
            collecting: true,
            onGigaverse: Boolean((_b = (_a = sender.tab) == null ? void 0 : _a.url) == null ? void 0 : _b.includes("gigaverse.io/play")),
            debug: meta.debug,
            predictionEnabled: meta.predictionEnabled,
            totalMoves: await getMoveCount(),
            lastCaptureAt: meta.lastCaptureAt
          });
          break;
        }
        case "GET_STATS": {
          sendResponse({ ok: true, stats: computeStats(await getAllMoves()) });
          break;
        }
        case "GET_PREDICTION":
        case "GET_PREDICTION_META": {
          const meta = await getMeta();
          const runs = await getAllRunContexts();
          const latest = runs.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0];
          sendResponse({
            ok: true,
            predictionEnabled: meta.predictionEnabled,
            inCombat: meta.inCombat,
            lastPrediction: meta.inCombat ? meta.lastPrediction : null,
            accuracyPredictions: meta.accuracyPredictions,
            accuracyTop1Hits: meta.accuracyTop1Hits,
            accuracyMostFrequentHits: meta.accuracyMostFrequentHits,
            activeIntuition: meta.activeIntuition,
            runBoonsCount: (latest == null ? void 0 : latest.activeBoons.length) ?? 0
          });
          break;
        }
        case "EXPORT_JSON": {
          sendResponse({
            ok: true,
            filename: exportFilename("json"),
            json: JSON.stringify(await getAllMoves(), null, 2)
          });
          break;
        }
        case "EXPORT_CSV": {
          sendResponse({
            ok: true,
            filename: exportFilename("csv"),
            csv: movesToCsv(await getAllMoves())
          });
          break;
        }
        case "EXPORT_FULL": {
          const payload = {
            moves: await getAllMoves(),
            runContexts: await getAllRunContexts(),
            intuitionEvents: await getAllIntuitionEvents(),
            apiSnapshots: await getAllApiSnapshots(),
            model: await getPredictorStore(),
            meta: await getMeta(),
            exportedAt: (/* @__PURE__ */ new Date()).toISOString(),
            warning: "PRIVATE. May contain actionToken. Do not share."
          };
          sendResponse({
            ok: true,
            filename: exportFilename("full.json"),
            json: JSON.stringify(payload, null, 2),
            warning: "PRIVATE. May contain actionToken. Do not share."
          });
          break;
        }
        case "GET_COMMUNITY_META": {
          const pullUrl = (await chrome.storage.local.get("gdcCommunityPullUrl")).gdcCommunityPullUrl ?? "";
          let bundledEmpty = true;
          for (const path of ["data/community/combat.jsonl", "data/community/fishing.jsonl"]) {
            try {
              const res = await fetch(chrome.runtime.getURL(path));
              if (res.ok && (await res.text()).trim()) {
                bundledEmpty = false;
                break;
              }
            } catch {
              // missing ok
            }
          }
          sendResponse({
            ok: true,
            pullUrl: typeof pullUrl === "string" ? pullUrl : "",
            canPull: canPullFromUrl(pullUrl),
            bundledEmpty,
            bundledCombat: "data/community/combat.jsonl",
            bundledFishing: "data/community/fishing.jsonl",
          });
          break;
        }
        case "EXPORT_COMMUNITY": {
          // Caller must have shown the two-step confirm in the popup first.
          if (!message.confirmed) {
            sendResponse({ ok: false, error: "confirm_required" });
            break;
          }
          const moves = await getAllMoves();
          const sessions = await getAllFishingSessions();
          const records = [];
          for (const move of moves) {
            if (move.source === "community") continue;
            const rec = await combatRecordFromMove(move);
            if (rec) records.push(rec);
          }
          for (const session of sessions) {
            const fishRecs = await fishingRecordsFromSession(session);
            records.push(...fishRecs);
          }
          const jsonl = toJsonl(records);
          if (communityExportContainsSecrets(jsonl)) {
            sendResponse({ ok: false, error: "secrets_detected" });
            break;
          }
          const day = new Date().toISOString().slice(0, 10);
          sendResponse({
            ok: true,
            filename: `giga-community-${day}.jsonl`,
            jsonl,
            count: records.length,
            combat: records.filter((r) => r.kind === "combat").length,
            fishing: records.filter((r) => r.kind === "fishing").length,
          });
          break;
        }
        case "IMPORT_COMMUNITY": {
          const parsed = parseCommunityPayload(message.text ?? "");
          const { combat, fishing } = partitionCommunityRecords(parsed.records);
          const moveRows = combat.map(communityCombatToMove).filter(Boolean);
          const { saved: combatSaved, skipped: combatSkipped } = await upsertMoves(moveRows);
          const fishUpsert = await upsertCommunityFishing(fishing);
          if (message.rebuildModel !== false) {
            await rebuildModelFromMoves();
            await refreshPrediction();
          }
          sendResponse({
            ok: true,
            combatSaved,
            combatSkipped,
            fishingSaved: fishUpsert.saved,
            fishingSkipped: fishUpsert.skipped,
            parseErrors: parsed.errors.slice(0, 20),
            note: "Imported community moves only. Your login was not sent.",
          });
          break;
        }
        case "LOAD_BUNDLED_COMMUNITY": {
          if (!message.confirmed) {
            sendResponse({ ok: false, error: "confirm_required" });
            break;
          }
          const files = ["data/community/combat.jsonl", "data/community/fishing.jsonl"];
          let text = "";
          let loaded = 0;
          for (const path of files) {
            try {
              const url = chrome.runtime.getURL(path);
              const res = await fetch(url);
              if (!res.ok) continue;
              const body = await res.text();
              if (body.trim()) {
                text += (text ? "\n" : "") + body.trim();
                loaded += 1;
              }
            } catch {
              // missing bundled file — ok
            }
          }
          if (!text.trim()) {
            sendResponse({ ok: false, error: "bundled_empty", loaded });
            break;
          }
          const parsed = parseCommunityPayload(text);
          const { combat, fishing } = partitionCommunityRecords(parsed.records);
          const moveRows = combat.map(communityCombatToMove).filter(Boolean);
          const { saved: combatSaved, skipped: combatSkipped } = await upsertMoves(moveRows);
          const fishUpsert = await upsertCommunityFishing(fishing);
          if (message.rebuildModel !== false) {
            await rebuildModelFromMoves();
            await refreshPrediction();
          }
          sendResponse({
            ok: true,
            loadedFiles: loaded,
            combatSaved,
            combatSkipped,
            fishingSaved: fishUpsert.saved,
            fishingSkipped: fishUpsert.skipped,
            parseErrors: parsed.errors.slice(0, 20),
          });
          break;
        }
        case "PULL_COMMUNITY": {
          const pullUrl = (await chrome.storage.local.get("gdcCommunityPullUrl")).gdcCommunityPullUrl ?? "";
          if (!canPullFromUrl(pullUrl)) {
            sendResponse({
              ok: false,
              error: "pull_disabled",
              hint: "Download merged/*.jsonl from the repo and use Import file.",
            });
            break;
          }
          // Read-only GET of a user-configured https URL. No auth headers.
          const res = await fetch(String(pullUrl).trim(), { method: "GET", credentials: "omit" });
          if (!res.ok) {
            sendResponse({ ok: false, error: `http_${res.status}` });
            break;
          }
          const text = await res.text();
          const parsed = parseCommunityPayload(text);
          const { combat, fishing } = partitionCommunityRecords(parsed.records);
          const moveRows = combat.map(communityCombatToMove).filter(Boolean);
          const { saved: combatSaved, skipped: combatSkipped } = await upsertMoves(moveRows);
          const fishUpsert = await upsertCommunityFishing(fishing);
          await rebuildModelFromMoves();
          await refreshPrediction();
          sendResponse({
            ok: true,
            combatSaved,
            combatSkipped,
            fishingSaved: fishUpsert.saved,
            fishingSkipped: fishUpsert.skipped,
          });
          break;
        }
        case "CLEAR_DATA": {
          await clearAll();
          await clearFishingData();
          await chrome.storage.local.set({ gdcDebug: false, gdcPrediction: true });
          await broadcastPrediction(null, true, false);
          await broadcastFishing(null, false, false);
          sendResponse({ ok: true });
          break;
        }
        case "RESET_MODEL": {
          await resetModelOnly();
          await rebuildModelFromMoves();
          await refreshPrediction();
          sendResponse({ ok: true });
          break;
        }
        case "IMPORT_MOVES": {
          const repaired = repairMoveRecords(message.moves);
          const { saved, skipped } = await upsertMoves(repaired);
          if (message.rebuildModel !== false) {
            await rebuildModelFromMoves();
          }
          const last = repaired[repaired.length - 1];
          if (last) {
            await setMeta({
              lastCaptureAt: last.timestamp,
              lastEnemyCid: last.enemyCid,
              lastEnemyMove: last.enemyMove
            });
          }
          await refreshPrediction();
          sendResponse({
            ok: true,
            imported: repaired.length,
            saved,
            skipped,
            uniqueEnemies: new Set(repaired.map((m) => m.enemyCid).filter((x) => x != null)).size
          });
          break;
        }
        case "SET_DEBUG": {
          const meta = await setMeta({ debug: message.enabled });
          await chrome.storage.local.set({ gdcDebug: meta.debug });
          sendResponse({ ok: true, debug: meta.debug });
          break;
        }
        case "GET_DEBUG": {
          const meta = await getMeta();
          await chrome.storage.local.set({ gdcDebug: meta.debug });
          sendResponse({ ok: true, debug: meta.debug });
          break;
        }
        case "SET_PREDICTION": {
          const meta = await setMeta({ predictionEnabled: message.enabled });
          await chrome.storage.local.set({ gdcPrediction: meta.predictionEnabled });
          if (meta.predictionEnabled) await refreshPrediction();
          else await broadcastPrediction(null, false, false);
          sendResponse({ ok: true, predictionEnabled: meta.predictionEnabled });
          break;
        }
        case "GET_FISHING": {
          sendResponse(await getFishingStatus());
          break;
        }
        case "FISHING_HAND_UI": {
          const metaNow = await getMeta();
          if (metaNow.inCombat) {
            await clearFishingUiState({ reason: "hand_ui_in_combat" });
            await broadcastFishing(null, false, metaNow.debug);
            sendResponse({ ok: true, inFishing: false, ignored: true });
            break;
          }
          const fishing = await ingestFishingHandUi(message.cards ?? [], {
            debug: metaNow.debug,
            inCombat: Boolean(metaNow.inCombat),
            mana: message.mana ?? null,
            catchMeter: message.catchMeter ?? null,
            revealedCell: message.revealedCell ?? null,
          });
          await broadcastFishing(fishing.view ?? null, Boolean(fishing.inFishing), metaNow.debug);
          sendResponse({ ok: true, ...fishing });
          break;
        }
        default:
          sendResponse({ ok: false, error: "unknown_message" });
      }
    } catch (error) {
      console.error("[GDC] handler error", error);
      sendResponse({
        ok: false,
        error: error instanceof Error ? error.message : "unknown_error"
      });
    }
  })();
  return true;
});
