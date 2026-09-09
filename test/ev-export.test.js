import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {
  buildEvResearchRecords,
  combatEvRecordFromMove,
  evResearchExportContainsSecrets,
  toEvResearchJsonl,
  validateEvResearchRecord,
} from "../assets/ev-export.js";

function move(partial = {}) {
  return {
    id: "m1",
    timestamp: "2026-09-09T10:00:00.000Z",
    dungeonId: 1,
    roomNumber: 2,
    enemyCid: 65,
    fightId: "1:2:65",
    fightRound: 1,
    actionToken: "SHOULD_NOT_LEAK",
    playerMove: "paper",
    enemyMove: "rock",
    playerHp: 30,
    playerMaxHp: 40,
    playerShield: 4,
    enemyHp: 22,
    enemyMaxHp: 40,
    enemyShield: 0,
    playerRockAtk: 12,
    playerPaperAtk: 6,
    playerScissorAtk: 10,
    playerRockDef: 0,
    playerPaperDef: 8,
    playerScissorDef: 0,
    enemyRockAtk: 10,
    enemyPaperAtk: 8,
    enemyScissorAtk: 9,
    enemyRockDef: 0,
    enemyPaperDef: 0,
    enemyScissorDef: 0,
    playerRockCharges: 3,
    playerPaperCharges: 2,
    playerScissorCharges: 3,
    enemyRockCharges: 2,
    enemyPaperCharges: 3,
    enemyScissorCharges: 3,
    playerWon: true,
    enemyWon: false,
    playerCrit: false,
    enemyCrit: false,
    playerBlocked: false,
    playerEvaded: false,
    prevEnemyMove: null,
    prevPlayerMove: null,
    advisorSnapshot: {
      recommendedMove: "paper",
      confidence: "low",
      n: 152,
      percents: { rock: 37, paper: 35, scissor: 28 },
      ranked: [
        { move: "paper", ev: 0.32, pDeath: 0.08, survivalChance: 0.92, vetoed: false },
        { move: "scissor", ev: 0.21, pDeath: 0.1, survivalChance: 0.9, vetoed: false },
        { move: "rock", ev: 0.14, pDeath: 0.2, survivalChance: 0.8, vetoed: false },
      ],
    },
    ...partial,
  };
}

test("combat_ev record has ATK/DEF/shield and drops actionToken", async () => {
  const pre = move({
    timestamp: "2026-09-09T09:59:00.000Z",
    fightRound: 1,
    playerHp: 34,
    enemyHp: 28,
    playerMove: "rock",
    enemyMove: "scissor",
  });
  const cur = move({
    timestamp: "2026-09-09T10:00:00.000Z",
    fightRound: 2,
    prevEnemyMove: "scissor",
    prevPlayerMove: "rock",
    playerHp: 30,
    enemyHp: 22,
  });
  const rec = await combatEvRecordFromMove(cur, pre, {
    enemyAbilities: { burnOnPaperWin: true },
    ourStatuses: { burn: { stacks: 1 } },
  });
  assert.ok(rec);
  assert.equal(rec.kind, "combat_ev");
  assert.equal(rec.v, 2);
  assert.equal(rec.actionToken, undefined);
  assert.equal(rec.scoreable, true);
  assert.equal(rec.prevEnemyMove, "scissor");
  assert.equal(rec.pre.player.rock.atk, 12);
  assert.equal(rec.pre.playerShield, 4);
  assert.equal(rec.post.playerHp, 30);
  assert.equal(rec.advisor.recommendedMove, "paper");
  assert.equal(rec.statuses.enemyBurnOnPaperWin, true);
  assert.equal(validateEvResearchRecord(rec).ok, true);
});

test("EV research jsonl never contains secrets", async () => {
  const a = move({ timestamp: "t1", fightRound: 1 });
  const b = move({
    timestamp: "t2",
    fightRound: 2,
    prevEnemyMove: "rock",
    playerHp: 28,
  });
  const { records } = await buildEvResearchRecords([a, b]);
  const jsonl = toEvResearchJsonl(records);
  assert.equal(evResearchExportContainsSecrets(jsonl), false);
  assert.doesNotMatch(jsonl, /actionToken|SHOULD_NOT_LEAK|Bearer |jwt/i);
  assert.match(jsonl, /"kind":"combat_ev"/);
  assert.match(jsonl, /"atk":/);
});

test("first exchange in fight is not scoreable without pre", async () => {
  const only = move({ fightRound: 1 });
  const rec = await combatEvRecordFromMove(only, null);
  assert.equal(rec.scoreable, false);
  assert.equal(rec.pre, null);
});

test("community-sourced moves are skipped", async () => {
  const local = move({ id: "local", timestamp: "t1" });
  const community = move({ id: "c1", timestamp: "t2", source: "community" });
  const { records, totalMoves } = await buildEvResearchRecords([local, community]);
  assert.equal(totalMoves, 1);
  assert.equal(records.length, 1);
});

test("EXPORT_EV_RESEARCH is wired; legacy private exports stay disabled", () => {
  const popupHtml = fs.readFileSync(new URL("../popup/index.html", import.meta.url), "utf8");
  const popupJs = fs.readFileSync(new URL("../popup/index.js", import.meta.url), "utf8");
  const background = fs.readFileSync(new URL("../background/index.js", import.meta.url), "utf8");

  assert.match(popupHtml, /btn-ev-export/);
  assert.match(popupJs, /EXPORT_EV_RESEARCH/);
  assert.match(background, /case "EXPORT_EV_RESEARCH"/);
  assert.match(
    background,
    /case "EXPORT_JSON":\s*case "EXPORT_CSV":\s*case "EXPORT_FULL":\s*case "EXPORT_FISHING":\s*\{[\s\S]*?error: "private_export_disabled"/,
  );
  assert.doesNotMatch(background, /JSON\.stringify\(await getAllMoves\(\)/);
});

test("EXPORT_EV_RESEARCH requires confirm", () => {
  const fakeHandler = (message) => {
    if (message.type !== "EXPORT_EV_RESEARCH") return { ok: false };
    if (!message.confirmed) return { ok: false, error: "confirm_required" };
    return { ok: true };
  };
  assert.equal(fakeHandler({ type: "EXPORT_EV_RESEARCH" }).error, "confirm_required");
  assert.equal(fakeHandler({ type: "EXPORT_EV_RESEARCH", confirmed: true }).ok, true);
});
