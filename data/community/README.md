# Community dataset

Shared **sanitized** combat/fishing move logs:

- `combat.jsonl` — one combat record per line (schema `v: 1`, `kind: "combat"`)
- `fishing.jsonl` — one fishing step per line (`kind: "fishing"`, `board: 3|4`)

The initial public combat dataset contains 2,169 exchanges from 145 runs (502 fights, 13 enemy IDs). The source Full/regular JSON export is not published because it contained local `actionToken` fields; only records converted through the community sanitizer are included.

Nothing is uploaded automatically. The original v0.1.0 release ZIP predates this data batch: download `combat.jsonl` from the current GitHub `main` branch and use **Import file**. A current source checkout can load it via **Load bundled dataset**.

## Contribute history

1. In the extension popup, select **Community data → Export community**.
2. Review `giga-community-YYYY-MM-DD.jsonl` before sharing it.
3. Attach it to [Community move history submissions](https://github.com/Never1uky/gigaverse-predictor/issues/2). If GitHub rejects `.jsonl`, ZIP only that file.

Do not submit regular `gigaverse-combat-*.json`, Export Full, fishing diagnostics, `actionToken`, JWT, cookies, authorization headers, seed phrases, private keys, or wallet addresses.
