# Changelog

## 0.1.0 — first public beta
- First release intended for public testing outside the Chrome Web Store.
- Passive combat/fishing advisor, local history, sanitized community import/export, and bounded continuation EV.
- Security and permission explanations plus checksum-based ZIP verification are documented in the root README. See `CHANGELOG-0.1.0.md`.

## 1.6.3
- Combat EV: default lookahead depth=2 (γ=0.65) for continuation / HP after; phase2 predict unchanged. Capture `fightRound`/`roomSeq`/`advisorSnapshot`. See `CHANGELOG-1.6.3.md` and `scripts/backtest/EV-CONTINUATION.md`.

## 1.6.2
- Interceptor: rethrow native fetch network failures; clone Request for action peek only; optional `__GDC_DEBUG__` fetch-fail logs. See `CHANGELOG-1.6.2.md`.

## 1.6.1
- Compact popup: user Combat/Fishing/Stats; diagnostics under collapsed Developer panel. See `CHANGELOG-1.6.1.md`.
- Audit report only (no model/EV change): `scripts/backtest/COMBAT-PREDICTOR-1500-AUDIT.md`.

## 1.6.0
- Combat EV: replace `DEATH=1e6` score with bounded survival utility U∈[−1,1] (square HP, Balanced 55/35/10). Overlay EV `toFixed(2)` with sign.
- Prediction / veto / hard constraints / fishing unchanged. See `CHANGELOG-1.6.0.md` and `scripts/backtest/EV-REWORK.md`.

## 1.5.3
- Fishing overlay no longer wiped by combat `render()` outside combat.
- Advisor for **pier 3×3** (card pattern = pond, no bobber) and **Dendren 4×4** (card relative to bobber).
- Hub watcher ignores fishing Redraw UI. Session can start from parsed hand + fishing UI.

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
