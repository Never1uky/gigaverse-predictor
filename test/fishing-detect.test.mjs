/**
 * Pure fishing-detection tests for 1.5.6 (no IndexedDB, no chrome).
 * Ingest order (documented): looksLikeFishingPayload FIRST — if true, never
 * forceHide/clear fishing even when leftover combat run.players is present.
 */
import assert from "node:assert/strict";
import {
  detectFishingBoard,
  extractBobberPosition,
  extractFishPosition,
  extractFishingGameState,
  extractFishingHand,
  extractFishingIds,
  hasStrongFishingSignals,
  isActiveFishingSession,
  isFishingActionName,
  isFishingUrl,
  looksLikeCombatPayload,
  looksLikeFishingPayload,
  parseApiCoordPair,
  sessionShouldEnd,
  shouldClearFishingForCapture,
} from "../assets/fishing.js";
import { fishingRecordsFromSession } from "../assets/community.js";

const DUNGEON_ACTION = "https://gigaverse.io/api/game/dungeon/action";
const DUNGEON_TODAY = "https://gigaverse.io/api/game/dungeon/today";
const GAMEWEBUI = "https://gigaverse.io/api/gamewebui/actions";

assert.equal(
  looksLikeFishingPayload({}, "play_cards", DUNGEON_ACTION),
  false,
  "1. play_cards on dungeon/action is NOT fishing (1.5.7 dungeon URL reject)",
);
assert.equal(
  looksLikeFishingPayload({ data: { fishPosition: [1, 2], gridSize: 4 } }, null, DUNGEON_TODAY),
  false,
  "1b. dungeon/today never opens fishing even with fish-like keys",
);
assert.equal(
  looksLikeFishingPayload({}, "play_cards", GAMEWEBUI),
  true,
  "1c. play_cards on gamewebui is fishing-like",
);

const fishingWithPlayers = {
  data: {
    run: {
      players: [
        { health: { current: 10 }, rock: { currentATK: 1 } },
        { health: { current: 8 }, paper: { currentATK: 1 } },
      ],
    },
    fishing: { catchMeter: 16, catchMax: 21, mana: 7 },
    bobber: { x: 1, y: 2 },
  },
};
assert.equal(
  hasStrongFishingSignals(fishingWithPlayers),
  true,
  "2a. fishing keys are strong fishing signals",
);
assert.equal(
  looksLikeCombatPayload(fishingWithPlayers),
  false,
  "2b. players+fishing keys is NOT combat (hasStrongFishingSignals)",
);

assert.equal(
  shouldClearFishingForCapture({
    forceHide: true,
    response: { data: { run: { players: [{}, {}] } } },
    requestAction: "play_cards",
    url: GAMEWEBUI,
  }),
  false,
  "3. fishing action on gamewebui is never force-hidden even if inCombat leftover is set",
);
assert.equal(
  shouldClearFishingForCapture({
    forceHide: true,
    response: { data: { entity: { ENEMY_CID: 9 }, run: { players: [{ rock: { currentCharges: 1 } }, {}] } } },
    requestAction: "rock",
    url: DUNGEON_ACTION,
  }),
  true,
  "3b. true combat still clears fishing",
);
assert.equal(
  shouldClearFishingForCapture({
    forceHide: true,
    response: { data: { fish: { cell: 1 } } },
    requestAction: null,
    url: DUNGEON_TODAY,
  }),
  true,
  "3c. dungeon/today is not fishing — forceHide clears",
);

assert.equal(
  isActiveFishingSession({ lastAction: "play_cards", endedAt: null }, {}),
  true,
  "4. lastAction play_cards is an active fishing session",
);

assert.equal(isFishingUrl("https://gigaverse.io/api/game/fishing/cards"), true, "5a. /fishing/cards");
assert.equal(isFishingUrl("https://gigaverse.io/api/game/cards"), true, "5b. /api/game/cards");
assert.equal(isFishingUrl("/api/game/cards"), true, "5c. path /api/game/cards");
assert.equal(isFishingUrl("https://gigaverse.io/api/game/discard"), false, "5d. discard is not /cards");
assert.equal(isFishingActionName("redraw"), true, "redraw is a fishing action");

const namelessHand = {
  data: {
    foo: [
      { pattern: [0, 1, 1, 0, 0, 1, 0, 0, 0], mana: 2 },
      { pattern: [1, 0, 1, 0, 0, 0, 1, 0, 1], mana: 1 },
      { pattern: [0, 0, 1, 1, 0, 1, 0, 0, 0], mana: 3 },
    ],
  },
};
const hand = extractFishingHand(namelessHand);
assert.ok(hand.cards.length >= 3, `F. unnamed 3-card pattern array parsed, got ${hand.cards.length}`);


assert.equal(isFishingUrl(GAMEWEBUI), true, "gamewebui path is fishing URL");

function shouldCaptureCopy(url, method) {
  const m = (method ?? "GET").toUpperCase();
  let path = url;
  try { path = new URL(url, "https://gigaverse.io").pathname; } catch { /* keep */ }
  const blob = `${url} ${path}`.toLowerCase();
  if (blob.includes("privy") || blob.includes("oauth")) return false;
  if (/\/(energy|auth|privy|oauth|analytics|sentry|telemetry|pixel)(\/|$)/i.test(path)) return false;
  if (path.includes("/api/game/dungeon/action") && m === "POST") return true;
  if (path.includes("/api/game/dungeon/state") && (m === "GET" || m === "POST")) return true;
  if (/\/api\/game\//i.test(path)) return true;
  if (/\/api\/gamewebui(\/|$)/i.test(path)) return true;
  if (/cards|pond|bobber|focus|fishing|fish|play_cards|move_focus/i.test(path)) return true;
  return false;
}

const fishingGame4 = {
  success: true,
  message: "ok",
  data: {
    doc: {
      docType: "FISHING_GAME",
      COMPLETE_CID: false,
      data: {
        gridSize: 4,
        fishPosition: [1, 4],
        previousFishPosition: [1, 3],
        focusPoint: [2, 2],
        focusMeter: 3,
        focusMeterMax: 5,
        focusMechanicEnabled: true,
        playerHp: 7,
        playerMaxHp: 10,
        fishHp: 16,
        fishMaxHp: 21,
        hand: [8],
        deckCardData: [
          {
            id: 8,
            manaCost: 2,
            hitZones: [2, 4, 6, 8],
            critZones: [],
            hitEffects: [{ type: "FISH_HP", amount: 5 }],
            missEffects: [{ type: "FISH_HP", amount: -2 }],
            critEffects: [],
          },
        ],
        discard: [],
        fullDeck: [8],
        lastMovePath: [4],
      },
    },
    events: [{ type: "FISH_MOVED" }, { type: "CARD_PLAYED" }],
  },
};

const fishingGame3 = {
  success: true,
  data: {
    doc: {
      docType: "FISHING_GAME",
      COMPLETE_CID: false,
      data: {
        gridSize: 3,
        fishPosition: [1, 2],
        previousFishPosition: [1, 1],
        focusPoint: [2, 2],
        focusMechanicEnabled: false,
        playerHp: 5,
        playerMaxHp: 8,
        fishHp: 10,
        fishMaxHp: 21,
        hand: [8],
        deckCardData: [
          { id: 8, manaCost: 1, hitZones: [2, 4, 6, 8], critZones: [] },
        ],
        lastMovePath: [1, 2],
      },
    },
    events: [],
  },
};

assert.equal(
  isFishingUrl(GAMEWEBUI) || looksLikeFishingPayload(fishingGame4, "play_cards", GAMEWEBUI),
  true,
  "1.5.5-1. gamewebui/actions + play_cards is fishing-like",
);
assert.equal(isFishingUrl(GAMEWEBUI), true, "1.5.5-1b. isFishingUrl matches gamewebui");
assert.equal(
  looksLikeFishingPayload(fishingGame4, "play_cards", GAMEWEBUI),
  true,
  "1.5.5-1c. looksLikeFishingPayload play_cards + FISHING_GAME",
);

const fish4 = extractFishPosition(fishingGame4);
assert.equal(fish4.board, 4, "1.5.5-2. gridSize 4 -> board 4");
assert.equal(detectFishingBoard(null, fishingGame4, "play_cards"), 4, "1.5.5-2b. detectFishingBoard 4");
assert.equal(fish4.cell, 13, "1.5.5-2c. fishPosition [1,4] -> cell 13");
assert.equal(fish4.previousCell, 9, "1.5.5-2d. previousFishPosition [1,3] -> cell 9");
assert.deepEqual(fish4.pos, { x: 0, y: 3 }, "1.5.5-2e. 0-indexed pos");
assert.equal(extractFishingGameState(fishingGame4)?.gridSize, 4, "1.5.5-2f. extract state");
const bob4 = extractBobberPosition(fishingGame4);
assert.equal(bob4.cell, 6, "1.5.5-2g. focusPoint [2,2] -> cell 6 on 4x4");

const fish3 = extractFishPosition(fishingGame3);
assert.equal(fish3.board, 3, "1.5.5-3. gridSize 3 -> board 3");
assert.equal(detectFishingBoard(null, fishingGame3, null), 3, "1.5.5-3b. detectFishingBoard 3");
assert.ok(fish3.pos && fish3.pos.x === 0 && fish3.pos.y === 1, "1.5.5-3c. [1,2] in-bounds on 3x3");
assert.equal(fish3.cell, 4, "1.5.5-3d. cell (2-1)*3+1 = 4");

assert.equal(
  looksLikeCombatPayload(fishingGame4),
  false,
  "1.5.5-4. FISHING_GAME with playerHp is not combat",
);
assert.equal(
  looksLikeCombatPayload(fishingGame3),
  false,
  "1.5.5-4b. 3x3 FISHING_GAME is not combat",
);

const hand4 = extractFishingHand(fishingGame4);
assert.equal(hand4.cards.length, 1, "1.5.5-5. one card from hand [8]");
assert.deepEqual(hand4.cards[0].hits, [2, 4, 6, 8], "1.5.5-5b. hitZones [2,4,6,8]");
assert.equal(hand4.mana, 7, "1.5.5-5c. playerHp is mana");
assert.equal(hand4.catchMeter, 16, "1.5.5-5d. fishHp is catch meter");

assert.equal(shouldCaptureCopy(GAMEWEBUI, "POST"), true, "1.5.5-6. pathname /api/gamewebui/actions is captured");
assert.equal(shouldCaptureCopy("https://gigaverse.io/api/gamewebui/foo", "POST"), true, "1.5.5-6b. any gamewebui");
assert.equal(shouldCaptureCopy("https://gigaverse.io/api/game/dungeon/action", "POST"), true, "1.5.5-6c. dungeon still captured");

const liveIds = extractFishingIds(fishingGame4, "play_cards");
assert.equal(liveIds.ended, false, "1.5.5-7. COMPLETE_CID false does not end session");

const escaped = JSON.parse(JSON.stringify(fishingGame4));
escaped.data.events = [{ type: "FISH_ESCAPED" }];
assert.equal(extractFishingIds(escaped, "play_cards").ended, true, "1.5.5-7b. FISH_ESCAPED ends session");

assert.equal(
  sessionShouldEnd({ catchMeter: 0 }),
  null,
  "1.5.6-1. catchMeter 0 alone does not end session",
);
assert.equal(
  sessionShouldEnd({ catchMeter: 14, catchMax: 14 }),
  null,
  "1.5.6-1b. catchMeter == catchMax alone does not end session",
);
assert.equal(
  sessionShouldEnd({ mana: 3, catchMeter: 0, catchMax: 21 }),
  null,
  "1.5.6-1c. Dendren start catch 0 with mana left stays open",
);
assert.equal(
  sessionShouldEnd({ mana: 0, catchMeter: 10, catchMax: 21 }),
  "mana_empty",
  "1.5.6-1d. mana<=0 still ends",
);
assert.equal(
  sessionShouldEnd({ ids: { ended: true }, catchMeter: 14, catchMax: 14 }),
  "ids_ended",
  "1.5.6-1e. explicit ids.ended still ends",
);

const pair14 = parseApiCoordPair([1, 4], 4);
assert.ok(pair14.pos, "1.5.6-2. parseApiCoordPair [1,4] size 4 in-bounds");
assert.equal(pair14.cell, 13, "1.5.6-2b. [1,4] on 4x4 is cell 13");
assert.deepEqual(pair14.pos, { x: 0, y: 3 }, "1.5.6-2c. 0-indexed pos");

const snapSession = {
  id: "fish:test:dendren-snap",
  board: 4,
  gridSize: 4,
  movements: [],
  currentPos: { x: 0, y: 3 },
  currentCell: 13,
  bobberPos: null,
  bobberCell: null,
  hand: [{ id: "8" }],
  mana: 7,
  catchMeter: 14,
  catchMax: 14,
};
const snapRows = await fishingRecordsFromSession(snapSession);
assert.ok(snapRows.length >= 1, `1.5.6-3. snapshot export has rows, got ${snapRows.length}`);
assert.equal(snapRows[0].kind, "fishing", "1.5.6-3b. kind fishing");
assert.equal(snapRows[0].board, 4, "1.5.6-3c. board 4");
assert.equal(snapRows[0].bobber, null, "1.5.6-3d. missing bobber still exported");
assert.deepEqual(snapRows[0].fish, { x: 0, y: 3 }, "1.5.6-3e. fish = currentPos");
assert.equal(snapRows[0].prevFish, null, "1.5.6-3f. prevFish null");
assert.equal(snapRows[0].handLength, 1, "1.5.6-3g. hand length included");

assert.equal(
  looksLikeFishingPayload(fishingGame4, "play_cards", GAMEWEBUI),
  true,
  "1.5.6-4. gamewebui URL + FISHING_GAME still fishing-like",
);

const fullCatchIds = extractFishingIds(
  {
    data: {
      doc: {
        docType: "FISHING_GAME",
        COMPLETE_CID: false,
        SUCCESS_CID: false,
        data: { gridSize: 4, fishPosition: [1, 4], fishHp: 14, fishMaxHp: 14, playerHp: 7 },
      },
      events: [],
    },
  },
  "play_cards",
);
assert.equal(fullCatchIds.ended, false, "1.5.6-5. fishHp==fishMaxHp + COMPLETE_CID false is not ended");

console.log("fishing-detect.test.mjs: all assertions passed");
