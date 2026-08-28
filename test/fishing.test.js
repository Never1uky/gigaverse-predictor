import { test } from "node:test";
import assert from "node:assert/strict";
import {
  manhattan,
  cellToPos,
  posToCell,
  parseBoardPosition,
  isValidStep,
  getReachableCellNumbers,
  detectMode,
  predictFishing,
  applyFishPosition,
  emptySession,
  movementFingerprint,
  extractFishPosition,
  extractFishingHand,
  shouldOpenNewSession,
  normalizeSpellCard,
  recommendCard,
  looksLikeCombatPayload,
  looksLikeFishingPayload,
  looksLikeFishingUiText,
  looksLikeHubScreen,
  looksLikeFishingEndedScreen,
  looksLikeClearOverlaysScreen,
  shouldHideFishingOverlay,
  isActiveFishingSession,
  visibleFishingOverlay,
  applyPattern,
  chooseFishingAdvice,
  scoreCardOnPier,
  legalBobberCells,
  GRID_SIZE,
  PIER_SIZE,
  detectFishingBoard,
  redactForLog,
  SENSITIVE_KEY_RE,
} from "../assets/fishing.js";

test("4x4 grid size and cell mapping 1..16", () => {
  assert.equal(GRID_SIZE, 4);
  assert.deepEqual(cellToPos(1), { x: 0, y: 0 });
  assert.deepEqual(cellToPos(4), { x: 3, y: 0 });
  assert.deepEqual(cellToPos(5), { x: 0, y: 1 });
  assert.deepEqual(cellToPos(10), { x: 1, y: 2 });
  assert.deepEqual(cellToPos(16), { x: 3, y: 3 });
  assert.equal(posToCell({ x: 1, y: 2 }), 10);
  assert.equal(cellToPos(0), null);
  assert.equal(cellToPos(17), null);
});

test("parseBoardPosition accepts cell 0..15 and {col,row}", () => {
  assert.deepEqual(parseBoardPosition(9).pos, { x: 0, y: 2 });
  assert.deepEqual(parseBoardPosition(0).pos, { x: 0, y: 0 });
  assert.deepEqual(parseBoardPosition({ col: 2, row: 1 }).pos, { x: 2, y: 1 });
  assert.equal(parseBoardPosition(99).pos, null);
  assert.match(parseBoardPosition(99).diagnostic, /out_of_range|out_of_bounds/);
});

test("manhattan axis distances", () => {
  assert.equal(manhattan({ x: 0, y: 0 }, { x: 0, y: 1 }), 1);
  assert.equal(manhattan({ x: 0, y: 0 }, { x: 0, y: 2 }), 2);
  assert.equal(manhattan({ x: 0, y: 0 }, { x: 1, y: 1 }), 2);
});

test("isValidStep: orthogonal 1/2 ok, diagonal/stay/oob no", () => {
  assert.equal(isValidStep({ x: 0, y: 0 }, { x: 1, y: 1 }), false);
  assert.equal(isValidStep({ x: 0, y: 0 }, { x: 0, y: 0 }), false);
  assert.equal(isValidStep({ x: 0, y: 0 }, { x: 0, y: 1 }), true);
  assert.equal(isValidStep({ x: 0, y: 0 }, { x: 0, y: 2 }), true);
  assert.equal(isValidStep({ x: 0, y: 0 }, { x: 3, y: 0 }), false);
  assert.equal(isValidStep({ x: 3, y: 3 }, { x: 3, y: 5 }), false);
});

test("getReachableCells on 4x4", () => {
  assert.deepEqual(getReachableCellNumbers({ x: 1, y: 1 }, 1).sort((a, b) => a - b), [2, 5, 7, 10]);
  assert.deepEqual(getReachableCellNumbers({ x: 0, y: 0 }, 2).sort((a, b) => a - b), [3, 9]);
  // Center-ish (1,1) distance 2: only two in-bounds axis steps
  assert.deepEqual(getReachableCellNumbers({ x: 1, y: 1 }, 2).sort((a, b) => a - b), [8, 14]);
});

test("MODE_ONE / TWO / ALTERNATING / UNCERTAIN", () => {
  assert.equal(detectMode([1, 1, 1, 1]).mode, "MODE_ONE");
  assert.equal(detectMode([2, 2, 2, 2]).mode, "MODE_TWO");
  assert.equal(detectMode([1, 2, 1, 2]).mode, "MODE_ALTERNATING");
  assert.equal(detectMode([1]).confidence, "low");
  assert.equal(detectMode([1, 1, 2, 1, 2]).mode, "UNCERTAIN");
});

test("predict lists orthogonal 1+2 when uncertain", () => {
  const pred = predictFishing({ currentPos: { x: 1, y: 1 }, distances: [1, 1, 2] });
  assert.equal(pred.mode, "UNCERTAIN");
  assert.ok(pred.possibleCells.includes(2));
  assert.ok(pred.possibleCells.includes(8) || pred.possibleCells.includes(14));
});

test("applyFishPosition records valid history and rejects diagonal", () => {
  let s = emptySession({ fishId: "f1", sessionHint: "r1", startedAt: "2026-08-16T00:00:00.000Z" });
  let r = applyFishPosition(s, { x: 1, y: 1 }, { timestamp: "t1", actionToken: "a1" });
  assert.equal(r.accepted, true);
  s = r.session;
  r = applyFishPosition(s, { x: 1, y: 0 }, { timestamp: "t2", actionToken: "a2" });
  assert.equal(r.accepted, true);
  assert.equal(r.movement.distance, 1);
  s = r.session;
  r = applyFishPosition(s, { x: 2, y: 1 }, { timestamp: "t3", actionToken: "a3" });
  assert.equal(r.accepted, false);
  assert.equal(r.reason, "diagonal");
});

test("duplicate events are ignored", () => {
  let s = emptySession({ startedAt: "2026-08-16T00:00:00.000Z" });
  let r = applyFishPosition(s, { x: 0, y: 0 }, { timestamp: "t1", actionToken: "tok-9" });
  s = r.session;
  r = applyFishPosition(s, { x: 0, y: 1 }, { timestamp: "t2", actionToken: "tok-10" });
  s = r.session;
  const again = applyFishPosition(s, { x: 0, y: 1 }, { timestamp: "t2", actionToken: "tok-10" });
  assert.equal(again.accepted, false);
  assert.equal(again.reason, "duplicate");
});

test("fingerprint prefers actionToken", () => {
  assert.equal(
    movementFingerprint({ sessionId: "s", fromCell: 1, toCell: 2, actionToken: "abc", timestamp: "t" }),
    "tok:abc:1:2",
  );
});

test("combat dungeon payload does not look like fishing", () => {
  const combat = {
    data: {
      entity: { ENEMY_CID: 63, ROOM_NUM_CID: 2 },
      run: {
        players: [
          { hp: 26, rockCharges: 3, paperCharges: 3, scissorCharges: 3 },
          { hp: 40, rockCharges: 2, paperCharges: 1, scissorCharges: 3 },
        ],
      },
    },
  };
  assert.equal(looksLikeCombatPayload(combat), true);
  assert.equal(looksLikeFishingPayload(combat, null, "https://gigaverse.io/api/game/dungeon/action"), false);
  assert.equal(extractFishPosition(combat).skipped, "combat_payload");
});

test("visibleFishingOverlay false when inCombat", () => {
  assert.equal(visibleFishingOverlay({ inFishing: true, inCombat: true }), false);
  assert.equal(visibleFishingOverlay({ inFishing: true, inCombat: false }), true);
  assert.equal(visibleFishingOverlay({ inFishing: false, inCombat: false }), false);
});

test("active fishing session requires fish/bobber/hand", () => {
  assert.equal(isActiveFishingSession(null), false);
  assert.equal(isActiveFishingSession({ endedAt: null, currentPos: { x: 1, y: 1 }, currentCell: 6 }), true);
  assert.equal(isActiveFishingSession({ endedAt: null, bobberPos: { x: 2, y: 2 }, bobberCell: 11 }), true);
});

test("extractFishPosition prefers fishing-scoped cell", () => {
  const found = extractFishPosition({
    data: { run: { health: 10 }, fishing: { fish: { cell: 10 } } },
  });
  assert.equal(found.cell, 10);
  assert.deepEqual(found.pos, { x: 1, y: 2 });
});

test("extractFishPosition reads {x,y} under fish", () => {
  const found = extractFishPosition({ data: { fish: { x: 2, y: 0 } } });
  assert.equal(found.cell, 3);
});

test("new session when fishId changes", () => {
  const s = emptySession({ fishId: "10", startedAt: "2026-08-16T00:00:00.000Z" });
  assert.equal(shouldOpenNewSession(s, { fishId: "11", started: false }, "2026-08-16T00:01:00.000Z"), true);
  assert.equal(shouldOpenNewSession(s, { fishId: "10", started: false }, "2026-08-16T00:01:00.000Z"), false);
});

test("normalizeSpellCard reads 9-cell relative grid", () => {
  const card = normalizeSpellCard({
    name: "Wave",
    mana: 2,
    grid: [0, 1, 0, 1, 2, 1, 0, 1, 0],
    hitValue: 2,
    critValue: 4,
    missValue: 1,
  }, 0);
  assert.equal(card.name, "Wave");
  assert.ok(card.hitOffsets.some((o) => o.dx === 0 && o.dy === -1));
  assert.ok(card.critOffsets.some((o) => o.dx === 0 && o.dy === 0) === false);
});

test("applyPattern bobber (1,2) + ring-8 → 8 neighbors, center miss, clip edge", () => {
  const ring = normalizeSpellCard({
    name: "Ring",
    mana: 1,
    grid: [1, 1, 1, 1, 0, 1, 1, 1, 1],
    hitValue: 1,
    missValue: 1,
  });
  const applied = applyPattern({ x: 1, y: 2 }, ring);
  assert.equal(applied.missCenter, 10);
  assert.equal(applied.hits.length, 8);
  assert.deepEqual(applied.hits.slice().sort((a, b) => a - b), [5, 6, 7, 9, 11, 13, 14, 15]);

  const corner = applyPattern({ x: 0, y: 0 }, ring);
  assert.equal(corner.missCenter, 1);
  assert.ok(corner.hits.length < 8);
  assert.ok(corner.clipped.length > 0);
});

test("advisor picks card+bobber that covers a sure fish cell", () => {
  const spear = normalizeSpellCard({
    name: "Spear",
    mana: 1,
    hits: [2, 8],
    hitValue: 2,
    missValue: 1,
  });
  const junk = normalizeSpellCard({
    name: "Misser",
    mana: 1,
    hits: [1, 3],
    hitValue: 1,
    missValue: 2,
  });
  // Fish predicted at cell 6 (1,1). Place bobber at (1,2)=10 so pattern local-2 (0,-1) hits cell 6.
  const advice = chooseFishingAdvice({
    predictedCells: [6],
    bobberPos: { x: 0, y: 0 },
    focus: 3,
    focusFound: true,
    hand: [spear, junk],
    mana: 4,
    catchMeter: 7,
  });
  assert.equal(advice.action, "play");
  assert.equal(advice.card.name, "Spear");
  assert.ok(advice.bobberCell != null);
  assert.ok((advice.ev ?? -1) > 0);
});

test("Focus=0 keeps bobber fixed", () => {
  const legal = legalBobberCells({ x: 2, y: 2 }, 0);
  assert.equal(legal.cells.length, 1);
  assert.equal(legal.cells[0].cell, 11);
  const card = normalizeSpellCard({ name: "A", mana: 1, hits: [2], hitValue: 1, missValue: 1 });
  const advice = chooseFishingAdvice({
    predictedCells: [7],
    bobberPos: { x: 2, y: 2 },
    focus: 0,
    focusFound: true,
    hand: [card],
    mana: 3,
  });
  assert.equal(advice.bobberCell, 11);
  assert.equal(advice.stay, true);
});

test("card costlier than mana is skipped", () => {
  const expensive = normalizeSpellCard({ name: "Storm", mana: 5, hits: [2, 4, 6, 8], hitValue: 3, missValue: 1 });
  const cheap = normalizeSpellCard({ name: "Poke", mana: 1, hits: [2], hitValue: 1, missValue: 1 });
  const pick = recommendCard([expensive, cheap], [2, 8], { mana: 2, bobberPos: { x: 1, y: 1 } });
  assert.equal(pick.card.name, "Poke");
});

test("extract does not expose authorization/cookie/jwt", () => {
  const redacted = redactForLog({
    authorization: "Bearer secret",
    cookie: "a=b",
    jwt: "x.y.z",
    fishing: { fish: { cell: 4 } },
  });
  assert.equal(redacted.authorization, undefined);
  assert.equal(redacted.cookie, undefined);
  assert.equal(redacted.jwt, undefined);
  assert.equal(redacted.fishing.fish.cell, 4);
  assert.ok(SENSITIVE_KEY_RE.test("authorization"));
});

test("extractFishingHand finds cards and Fintuition cell", () => {
  const hand = extractFishingHand({
    data: {
      fishing: {
        mana: 4,
        catchMeter: { current: 6, max: 20 },
        fintuition: 3,
        hand: [
          { name: "Spear", mana: 1, hits: [2, 3], crits: [3], missValue: 1 },
          { name: "Net", mana: 2, grid: [1, 1, 1, 0, 0, 0, 0, 0, 0] },
        ],
      },
    },
  });
  assert.equal(hand.cards.length, 2);
  assert.equal(hand.mana, 4);
  assert.equal(hand.revealedCell, 3);
});

test("move_focus_point is a fishing action", async () => {
  const { isFishingActionName } = await import("../assets/fishing.js");
  assert.equal(isFishingActionName("move_focus_point"), true);
  assert.equal(isFishingActionName("play_cards"), true);
  assert.equal(isFishingActionName("rock"), false);
});

test("3x3 bounds and cell mapping 1..9", () => {
  assert.equal(PIER_SIZE, 3);
  assert.deepEqual(cellToPos(1, 3), { x: 0, y: 0 });
  assert.deepEqual(cellToPos(3, 3), { x: 2, y: 0 });
  assert.deepEqual(cellToPos(9, 3), { x: 2, y: 2 });
  assert.equal(posToCell({ x: 2, y: 2 }, 3), 9);
  assert.equal(cellToPos(10, 3), null);
  assert.equal(posToCell({ x: 3, y: 0 }, 3), null);
  assert.deepEqual(getReachableCellNumbers({ x: 1, y: 1 }, 1, 3).sort((a, b) => a - b), [2, 4, 6, 8]);
});

test("4x4 mapping still 1..16 after dual-board helpers", () => {
  assert.equal(GRID_SIZE, 4);
  assert.equal(posToCell({ x: 1, y: 2 }, 4), 10);
  assert.equal(cellToPos(16, 4).x, 3);
});

test("detectFishingBoard 3 vs 4", () => {
  assert.equal(detectFishingBoard({ board: 3 }), 3);
  assert.equal(detectFishingBoard({ bobberPos: { x: 1, y: 1 } }), 4);
  assert.equal(detectFishingBoard(null, null, "move_focus_point"), 4);
  assert.equal(detectFishingBoard({ currentCell: 4, bobberPos: null }), 3);
});

test("overlay stays visible when inFishing and not in combat", () => {
  assert.equal(shouldHideFishingOverlay({ inCombat: false, hub: false, inFishing: true }), false);
  assert.equal(shouldHideFishingOverlay({ inCombat: true, hub: false, inFishing: true }), true);
  assert.equal(shouldHideFishingOverlay({ inCombat: false, hub: true, inFishing: true }), true);
  assert.equal(shouldHideFishingOverlay({ inCombat: false, hub: false, inFishing: false }), true);
});

test("1.5.9 page fishing overlay requires active inFishing (not stale cell)", () => {
  // Gate used by content updateFishingOverlay: require inFishing, never combat.
  const shouldPaint = ({ inCombat, inFishing }) => !inCombat && Boolean(inFishing);
  assert.equal(shouldPaint({ inCombat: false, inFishing: false }), false);
  assert.equal(shouldPaint({ inCombat: true, inFishing: true }), false);
  assert.equal(shouldPaint({ inCombat: false, inFishing: true }), true);
  assert.equal(visibleFishingOverlay({ inFishing: false, inCombat: false }), false);
});

test("hub watcher does not fire on fishing Redraw UI", () => {
  assert.equal(looksLikeHubScreen("choose your offering"), true);
  assert.equal(looksLikeHubScreen("press e to interact"), true);
  assert.equal(looksLikeFishingUiText("Redraw 3"), true);
  assert.equal(looksLikeHubScreen("Redraw 3\npress e to interact"), false);
});

test("1.5.7 clears overlays on rewards / fish escaped / start fishing", () => {
  assert.equal(looksLikeHubScreen("Adventure Rewards\nRetry\nExit"), true);
  assert.equal(looksLikeFishingEndedScreen("FISH ESCAPED!"), true);
  assert.equal(looksLikeFishingEndedScreen("Start fishing?"), true);
  assert.equal(looksLikeFishingEndedScreen("cast again?"), true);
  assert.equal(looksLikeClearOverlaysScreen("Adventure Rewards"), true);
  assert.equal(shouldHideFishingOverlay({ inCombat: false, hub: false, inFishing: true, fishingEnded: true }), true);
});

test("fishing payload with leftover ENEMY_CID is still fishing", () => {
  const mixed = {
    data: {
      entity: { ENEMY_CID: 63, FISH_CID: 12 },
      fishing: { fish: { cell: 10 }, bobber: { x: 1, y: 1 } },
    },
  };
  assert.equal(looksLikeCombatPayload(mixed), false);
  assert.equal(looksLikeFishingPayload(mixed, "play_cards", "https://gigaverse.io/api/gamewebui/actions"), true);
  assert.equal(looksLikeFishingPayload(mixed, "play_cards", "https://gigaverse.io/api/game/dungeon/action"), false);
  assert.equal(looksLikeFishingPayload(mixed, null, "https://gigaverse.io/api/game/dungeon/today"), false);
  assert.equal(extractFishPosition(mixed).cell, 10);
  assert.notEqual(extractFishPosition(mixed).skipped, "combat_payload");
});

test("3x3 card covering predicted cell ranks above miss", () => {
  const cover = normalizeSpellCard({
    name: "Column",
    mana: 1,
    grid: [0, 1, 0, 0, 1, 0, 0, 1, 0],
    hitValue: 2,
    missValue: 1,
  });
  const miss = normalizeSpellCard({
    name: "Top",
    mana: 1,
    grid: [1, 1, 1, 0, 0, 0, 0, 0, 0],
    hitValue: 2,
    missValue: 1,
  });
  const advice = chooseFishingAdvice({
    board: 3,
    predictedCells: [5, 8],
    hand: [cover, miss],
    mana: 3,
  });
  assert.equal(advice.board, 3);
  assert.equal(advice.action, "play");
  assert.equal(advice.card.name, "Column");
  const coverScore = scoreCardOnPier(cover, [5, 8], { mana: 3 });
  const missScore = scoreCardOnPier(miss, [5, 8], { mana: 3 });
  assert.ok(coverScore.ev > missScore.ev);
});

test("active session with three parsed cards and fishing UI", () => {
  const hand = [
    { name: "A", mana: 1, hits: [2] },
    { name: "B", mana: 1, hits: [4] },
    { name: "C", mana: 1, hits: [6] },
  ];
  assert.equal(isActiveFishingSession({ endedAt: null, hand: [] }, { hand, fishingUi: true }), true);
});
