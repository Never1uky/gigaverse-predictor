# Gigaverse Predictor 1.5.7

Live QA на 1.5.6 (Forbidden Woods + Dendren/pier): Phase 2 работал, но были дыры store/overlay/veto. 1.5.7 чинит только подтверждённое live — **без** новой ML-модели и без смены Dirichlet/backoff.

## Fixes

- **enemyCid 0:** kill/transition больше не пишется в `gdc` / model / Last data. Валиден только `cid > 0`.
- **Fishing ingest:** `/api/game/dungeon/*` (включая `today`) никогда не открывает fishing. Whitelist: `gamewebui` + `FISHING_GAME` / fishing actions.
- **Overlay hide:** сразу прячет combat+fishing на Adventure Rewards, FISH ESCAPED, Start fishing / cast again, hub offering. 120s stale — только safety-net.
- **Certain-kill veto:** строка «you die if they X» уводит Play, даже если `pDeath < 0.35`, если есть ход без этой пометки. Если все lethal — min pDeath + явная пометка.
- **Flat-P:** при spread P &lt; 5pp и низком Death Play = RPS-counter (не молча max ATK). Overlay показывает **P · EV · D** по трём ходам.
- **Popup:** если `/play` открыт в другой вкладке — «Open popup from /play tab», не ложное «Not on Gigaverse». Last data игнорирует cid ≤ 0.

## Не менялось

- Phase 2: enemyCid pool, α=2, hierarchical backoff, `confidenceFromN`
- Fishing grid advisor 3×3 / 4×4
- Advisor-only: нет автоклика, нет POST game APIs, нет логов JWT / actionToken

## Update

1. `chrome://extensions` → **Reload** (одна копия; удали дубликаты 1.5.6)
2. F5 на `gigaverse.io/play`
