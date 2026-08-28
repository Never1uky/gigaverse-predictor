# Gigaverse Predictor 1.5.5

## Что сломалось в 1.5.4

Рыбалка **не** идёт через `POST /api/game/dungeon/action`. Живой клиент шлёт карты на:

`POST https://gigaverse.io/api/gamewebui/actions`

с телом `{ "action": "play_cards", "data": { "cards": [0], "focusPoint": [x, y], … } }`.

Из‑за этого 1.5.4 не перехватывал рыбалку: сессия не открывалась, попап писал idle, оверлей молчал. Поля `playerHp` / `playerMaxHp` внутри `FISHING_GAME` — это **мана**, не HP боя: без отдельного разбора их можно было скормить combat snapshot.

## Что чинит 1.5.5

- Интерцептор ловит любой `/api/gamewebui/` (в т.ч. `/api/gamewebui/actions`) плюс прежние dungeon и `/api/game/*`. Privy / auth / oauth / analytics / sentry / telemetry / pixel по-прежнему пропускаются. Из POST-тела читается `action` (`play_cards`, `move_focus_point`, `use_fishing_item`, `redraw`, …).
- Ответ — конверт `data.doc` с `docType: "FISHING_GAME"`. Состояние в `data.doc.data`:
  - `gridSize` 3 (пирс) или 4 (Dendren)
  - `fishPosition` / `previousFishPosition` — пара `[x, y]` **1-indexed** (столбец, строка)
  - `focusPoint` — поплавок, **отправляется вместе с картой**, отдельный сетевой move не нужен
  - `focusMeter` / `focusMeterMax` / `focusMechanicEnabled`
  - `playerHp` / `playerMaxHp` = мана; `fishHp` / `fishMaxHp` = catch meter
  - `hand` — id карт; `deckCardData` — каталог с `hitZones` / `critZones` (локальный паттерн 1–9, не клетки пруда)
- `lastMovePath` **игнорируется** как координата рыбы (на 3×3 бывает `[x,y]`, на 4×4 — одно число). Только `fishPosition`.
- Доска 3×3: локальная клетка карты = клетка пруда. Доска 4×4: 3×3 паттерн вокруг поплавка (`focusPoint`); центр (локальная 5) = miss.
- Fishing-like (`play_cards`, `FISHING_GAME`, `gamewebui`) **не** пишется как боевой ход и **не** force-hide fishing. `playerHp` в `FISHING_GAME` никогда не считается HP бойца.
- Сессия заканчивается по `FISH_ESCAPED`, `COMPLETE_CID === true`, `fishHp <= 0` или `SUCCESS_CID` + complete.
- Оверлей / попап: сетка 4×4 при `gridSize` 4 (рыба + поплавок); строка маны (не «HP»); в idle — `last capture` с путём (без токенов).

Боевой EV / Markov **не** переписывался. Расширение по-прежнему только советник: не POST-ит игровые действия, не кликает, не логирует JWT / cookies / Authorization / actionToken.

## Как обновить

1. Откройте `chrome://extensions`
2. Включите «Режим разработчика»
3. На карточке Gigaverse Predictor нажмите **Reload** (или Load unpacked → папка с `manifest.json` / zip 1.5.5)
4. Обновите вкладку Gigaverse (`gigaverse.io/play`)
