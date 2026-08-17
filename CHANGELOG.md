# Changelog

## 1.5.2
- Combat Phase 2: pool enemy history by `enemyCid` (not run `dungeonId`).
- Hierarchical backoff (Markov → enemy → global), Dirichlet α=2, minN=3.
- Calibration shrink toward uniform when n<20. Recency / seq3 / stateKey not shipped.
- `chooseBestReply` and overlay unchanged.

## 1.5.1
- Community dataset layer: Export community (two-step confirm, sanitized JSONL), Import file, Load bundled, Pull (disabled until HTTPS URL set).
- Privacy: no auto-upload, no GitHub push/token, no `actionToken`/jwt/cookie/wallet in community files. Export Full kept with red warning.
- Combat predictors keyed by `dungeonId` (Normal / Underhaul / others never share one Markov table).
- Fishing community keyed by `board` 3|4 (pier vs Dendren). Bundled placeholders under `data/community/`.

## 1.5.0
- Dendren Pond fishing: **4×4** board, bobber (`move_focus_point`), card patterns relative to bobber.
- Fishing advisor: recommend bobber cell + card (or redraw) via EV over predicted fish cells.
- Focus budget assumption (1 Focus = 1 orthogonal step) when API field missing — labelled in UI.
- Fishing overlay only in confirmed fishing session; hidden in combat.
- `move_focus_point` treated as fishing action; interceptor WS keys include bobber/focus.

## 1.4.2
- Fishing overlay gate vs combat; combat Why / recommendedMove fixes.

## 1.4.1
- Initial fishing predictor (3×3) + combat EV.
