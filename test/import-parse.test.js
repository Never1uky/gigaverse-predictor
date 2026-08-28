import assert from "node:assert/strict";
import { test } from "node:test";
import {
  extractMovesFromParsed,
  isLiveFightsQaPayload,
  looksLikeCommunityText,
  mergeMovesById,
} from "../assets/import-parse.js";

test("live-fights QA payload is detected and not treated as moves", () => {
  const qa = {
    meta: { date: "2026-08-20", account: "justy" },
    runs: [{ id: "A", fights: [] }],
    fishing: [],
  };
  assert.equal(isLiveFightsQaPayload(qa), true);
  assert.equal(extractMovesFromParsed(qa).reason, "live_fights_qa");
  assert.equal(extractMovesFromParsed(qa).moves, null);
});

test("export JSON array and {moves} extract", () => {
  const arr = [{ id: "a", enemyCid: 63, playerMove: "rock", enemyMove: "paper" }];
  assert.equal(extractMovesFromParsed(arr).moves.length, 1);
  assert.equal(extractMovesFromParsed({ moves: arr }).moves.length, 1);
  assert.equal(extractMovesFromParsed({ foo: 1 }).reason, "bad_shape");
});

test("mergeMovesById dedupes across files", () => {
  const a = [
    { id: "1", enemyCid: 63 },
    { id: "2", enemyCid: 64 },
  ];
  const b = [
    { id: "2", enemyCid: 64 },
    { id: "3", enemyCid: 65 },
  ];
  const merged = mergeMovesById([a, b]);
  assert.equal(merged.length, 3);
  assert.deepEqual(
    merged.map((m) => m.id),
    ["1", "2", "3"],
  );
});

test("looksLikeCommunityText", () => {
  assert.equal(looksLikeCommunityText('{"kind":"combat","v":1,"id":"x"}\n'), true);
  assert.equal(
    looksLikeCommunityText(JSON.stringify([{ kind: "fishing", v: 1, id: "f", board: 4 }])),
    true,
  );
  assert.equal(looksLikeCommunityText(JSON.stringify([{ id: "raw-move" }])), false);
});
