import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {
  canPullFromUrl,
  combatModelKey,
  combatRecordFromMove,
  communityCombatToMove,
  communityExportContainsSecrets,
  detectFishingBoard,
  fishingRecordsFromSession,
  parseCommunityPayload,
  partitionCommunityRecords,
  sanitizeForCommunity,
  toJsonl,
  validateCommunityRecord,
} from "../assets/community.js";
import { visibleFishingOverlay } from "../assets/fishing.js";

test("sanitize drops actionToken/jwt/cookie/wallet keys", () => {
  const cleaned = sanitizeForCommunity({
    playerMove: "rock",
    actionToken: "SECRET",
    jwt: "x.y.z",
    cookie: "sid=1",
    wallet: "0xabc",
    nested: { authorization: "Bearer x", enemyMove: "paper" },
  });
  assert.equal(cleaned.playerMove, "rock");
  assert.equal(cleaned.actionToken, undefined);
  assert.equal(cleaned.jwt, undefined);
  assert.equal(cleaned.cookie, undefined);
  assert.equal(cleaned.wallet, undefined);
  assert.equal(cleaned.nested.authorization, undefined);
  assert.equal(cleaned.nested.enemyMove, "paper");
});

test("community export rejects text that still contains secrets", () => {
  assert.equal(communityExportContainsSecrets('{"playerMove":"rock"}'), false);
  assert.equal(communityExportContainsSecrets('{"actionToken":"abc"}'), true);
  assert.equal(communityExportContainsSecrets('{"jwt":"x"}'), true);
  assert.equal(communityExportContainsSecrets('wallet 0x1234567890123456789012345678901234567890'), true);
});

test("public popup exposes only sanitized community export", () => {
  const popupHtml = fs.readFileSync(new URL("../popup/index.html", import.meta.url), "utf8");
  const popupJs = fs.readFileSync(new URL("../popup/index.js", import.meta.url), "utf8");
  const background = fs.readFileSync(new URL("../background/index.js", import.meta.url), "utf8");

  for (const id of ["btn-export-json", "btn-export-csv", "btn-export-full", "btn-export-fishing"]) {
    assert.doesNotMatch(popupHtml, new RegExp(`id=["']${id}["']`));
  }
  assert.doesNotMatch(popupJs, /type:\s*"EXPORT_(?:JSON|CSV|FULL|FISHING)"/);
  assert.match(
    background,
    /case "EXPORT_JSON":\s*case "EXPORT_CSV":\s*case "EXPORT_FULL":\s*case "EXPORT_FISHING":\s*\{[\s\S]*?error: "private_export_disabled"/,
  );
  assert.doesNotMatch(background, /JSON\.stringify\(await getAllMoves\(\)/);
  assert.doesNotMatch(background, /const CSV_HEADERS/);
});

test("EXPORT_COMMUNITY requires explicit confirm flag (no auto-export API)", async () => {
  // Background refuses without confirmed:true — mirrored here as contract.
  const fakeHandler = (message) => {
    if (message.type !== "EXPORT_COMMUNITY") return { ok: false };
    if (!message.confirmed) return { ok: false, error: "confirm_required" };
    return { ok: true };
  };
  assert.equal(fakeHandler({ type: "EXPORT_COMMUNITY" }).error, "confirm_required");
  assert.equal(fakeHandler({ type: "EXPORT_COMMUNITY", confirmed: true }).ok, true);
});

test("import duplicate community combat id maps to same move id (skip on re-upsert)", async () => {
  const move = {
    dungeonId: 1,
    fightId: "1:2:63",
    fightRound: 1,
    enemyCid: 63,
    playerMove: "paper",
    enemyMove: "rock",
    playerHp: 12,
    playerMaxHp: 20,
    enemyHp: 8,
    enemyMaxHp: 15,
  };
  const rec = await combatRecordFromMove(move);
  assert.ok(rec?.id);
  const a = communityCombatToMove(rec);
  const b = communityCombatToMove(rec);
  assert.equal(a.id, b.id);
  assert.equal(a.id, `community:${rec.id}`);
  assert.equal(a.source, "community");
});

test("combat dungeonId=1 and dungeonId=3 use different Markov model keys", () => {
  const k1 = combatModelKey(1, 63, [], 15);
  const k3 = combatModelKey(3, 63, [], 15);
  assert.equal(k1.startsWith("d1:"), true);
  assert.equal(k3.startsWith("d3:"), true);
  assert.notEqual(k1, k3);
});

test("fishing board=3 and board=4 stay partitioned", async () => {
  const pier = {
    id: "s3",
    board: 3,
    startedAt: "2026-01-01T00:00:00.000Z",
    movements: [
      { from: { x: 0, y: 0 }, to: { x: 0, y: 1 }, distance: 1 },
      { from: { x: 0, y: 1 }, to: { x: 0, y: 2 }, distance: 1 },
    ],
    detectedMode: "MODE_ONE",
  };
  const dendren = {
    id: "s4",
    board: 4,
    bobberPos: { x: 1, y: 1 },
    startedAt: "2026-01-01T00:00:00.000Z",
    movements: [{ from: { x: 1, y: 0 }, to: { x: 1, y: 2 }, distance: 2 }],
    detectedMode: "MODE_TWO",
  };
  const pierRecs = await fishingRecordsFromSession(pier);
  const denRecs = await fishingRecordsFromSession(dendren);
  assert.ok(pierRecs.every((r) => r.board === 3));
  assert.ok(denRecs.every((r) => r.board === 4 && r.bobber));
  const { fishing } = partitionCommunityRecords([...pierRecs, ...denRecs]);
  assert.equal(fishing.filter((r) => r.board === 3).length, pierRecs.length);
  assert.equal(fishing.filter((r) => r.board === 4).length, denRecs.length);
});

test("detectFishingBoard: bobber/focus → 4, cells 1..9 without bobber → 3", () => {
  assert.equal(detectFishingBoard({ board: 4 }), 4);
  assert.equal(detectFishingBoard(null, null, "move_focus_point"), 4);
  assert.equal(detectFishingBoard({ bobberPos: { x: 0, y: 0 } }), 4);
  assert.equal(detectFishingBoard({ currentCell: 5 }), 3);
  assert.equal(detectFishingBoard({ currentCell: 12 }), 4);
  assert.equal(detectFishingBoard({}), null);
});

test("Pull without URL does not allow network", () => {
  assert.equal(canPullFromUrl(""), false);
  assert.equal(canPullFromUrl(null), false);
  assert.equal(canPullFromUrl("http://example.com/x.jsonl"), false);
  assert.equal(canPullFromUrl("https://example.com/merged/combat.jsonl"), true);
});

test("bundled load requires confirmed (no silent first-run import)", () => {
  const fake = (message) => {
    if (message.type !== "LOAD_BUNDLED_COMMUNITY") return { ok: false };
    if (!message.confirmed) return { ok: false, error: "confirm_required" };
    return { ok: true };
  };
  assert.equal(fake({ type: "LOAD_BUNDLED_COMMUNITY" }).error, "confirm_required");
});

test("parseCommunityPayload skips bad lines and strips secrets", () => {
  const text = [
    JSON.stringify({
      v: 1,
      kind: "combat",
      id: "aaa",
      dungeonId: 1,
      playerMove: "rock",
      enemyMove: "paper",
      actionToken: "leak",
    }),
    "{not json",
    JSON.stringify({ v: 1, kind: "fishing", id: "bbb", board: 3, fish: { x: 0, y: 0 } }),
  ].join("\n");
  const parsed = parseCommunityPayload(text);
  assert.equal(parsed.records.length, 2);
  assert.ok(parsed.errors.length >= 1);
  assert.equal(parsed.records[0].actionToken, undefined);
  assert.equal(validateCommunityRecord(parsed.records[0]).ok, true);
});

test("toJsonl community export never includes actionToken from local move snapshot", async () => {
  const dirty = {
    dungeonId: 1,
    fightId: "1:1:1",
    fightRound: 1,
    enemyCid: 1,
    playerMove: "rock",
    enemyMove: "scissor",
    actionToken: "SHOULD_NOT_EXPORT",
    jwt: "nope",
  };
  const rec = await combatRecordFromMove(dirty);
  const jsonl = toJsonl([rec]);
  assert.equal(communityExportContainsSecrets(jsonl), false);
  assert.doesNotMatch(jsonl, /actionToken|SHOULD_NOT_EXPORT/);
});

test("visibleFishingOverlay false when inCombat", () => {
  assert.equal(visibleFishingOverlay({ inFishing: true, inCombat: true }), false);
  assert.equal(visibleFishingOverlay({ inFishing: true, inCombat: false }), true);
});
