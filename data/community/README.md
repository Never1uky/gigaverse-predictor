# Community dataset (bundled)

Shared **sanitized** combat/fishing move logs:

- `combat.jsonl` — one combat record per line (schema `v: 1`, `kind: "combat"`)
- `fishing.jsonl` — one fishing step per line (`kind: "fishing"`, `board: 3|4`)

## Current pack (0.1.2+)

Combat (unique by `id` after dedupe):

| Metric | Count |
|--------|------:|
| Exchanges | 3,460 |
| Runs (`dungeonId`) | 256 |
| Fights | 917 |
| Enemy IDs | 14 |

Source submission: community export ~3,976 lines (3,944 combat + 32 fishing before combat dedupe). No `actionToken` / JWT / cookies / wallet patterns. Community schema has **no ATK/DEF/shield** (prediction-safe share format).

Nothing is uploaded automatically. Users load this pack via **Load bundled dataset**, or import a community file they saved themselves.

Only files created by **Export community** are intended for public sharing. Do not put `actionToken`, JWT, cookies, authorization headers, seed phrases, private keys, or wallet addresses in these files.
