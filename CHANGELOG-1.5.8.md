# Gigaverse Predictor 1.5.8

## Multi-file import

- **Import JSON** and **Import files** (community) accept **multiple** files in one picker.
- Moves are merged; duplicates skipped by `id` (same as before).
- Model rebuild runs once after the batch (community: last file; JSON: single upsert).

## Live-fights QA JSON

`gigaverse-live-fights-*.json` (`meta` + `runs` + `fishing` notes) is **not** a move database. Import skips it with a clear message. Use `gigaverse-combat-*.json` (Export JSON / Full moves array) or community JSONL instead.

## Update

Reload extension on `chrome://extensions`, then F5 on `/play`.
