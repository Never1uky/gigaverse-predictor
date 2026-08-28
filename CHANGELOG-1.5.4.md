# Gigaverse Predictor 1.5.4

## Что сломалось в 1.5.3

Рыбалка (Dendren Pond 4×4, Redraw, карты 3×3) шла через тот же `POST /api/game/dungeon/action`, что и бой. Ответ часто содержал leftover `run.players`, из‑за этого:

- `looksLikeCombatPayload` / `inCombat=true` гасили fishing **до** разбора сессии;
- попап писал «Fishing idle», `sessions=0`, хотя бой-коллектор работал (сотни ходов);
- сессия не открывалась, пока парсер не находил ≥3 карт (Unity JSON часто не совпадал);
- интерцептор не ловил `/api/game/cards` и другие `/api/game/*`, Unity во iframe не перехватывался;
- попап требовал одновременно `view.inFishing` и `meta.inFishing`.

## Что чинит 1.5.4

- Fishing-like (`play_cards`, `redraw`, `move_focus_point`, fishing URL/ключи) **не** пишется как боевой ход и **не** force-hide fishing.
- Сессия открывается по fishing-like / focus / mana / catchMeter, даже без 3 карт (`lastAction` держит сессию активной).
- Интерцептор: любой `/api/game/*` кроме energy/auth/privy/oauth/analytics/sentry/telemetry/pixel; XHR arraybuffer/blob → UTF-8 JSON; `all_frames` + `*.gigaverse.io` / `builds.gigaverse.io`.
- Попап: fishing активен, если сессия живая **или** meta **или** view; в idle — одна строка `Idle · last capture: …` (без токенов).
- Оверлей показывается в fishing 4×4 даже без известной клетки рыбы; прячется только в настоящем RPS-бою.
- Рука: обход JSON массивов 3–6 card-like объектов (pattern/cells/hits/grid/mana).

Боевой EV / Markov **не** переписывался. Расширение по-прежнему только советник: не POST-ит игровые действия, не кликает, не логирует JWT/cookies/Authorization/actionToken.

## Как обновить

1. Откройте `chrome://extensions`
2. Включите «Режим разработчика»
3. На карточке Gigaverse Predictor нажмите **Reload** (или Load unpacked → папка с `manifest.json` / zip 1.5.4)
4. Обновите вкладку Gigaverse (`gigaverse.io/play`)
