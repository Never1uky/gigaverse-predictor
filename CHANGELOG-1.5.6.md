# Gigaverse Predictor 1.5.6

## Почему 1.5.5 записал 0 рыбалки

После 1.5.5 пользователь сделал 1× пирс 3×3 и 1× Dendren 4×4. Community-экспорт: 710 боевых строк, **0 рыбалки**. Оверлей: 4×4 пустой (нет рыбы/карт), 3×3 не детектился.

Живой API подтверждён: `POST /api/gamewebui/actions` + `FISHING_GAME` (дампы есть). Бой пишется, потому что `dungeon/action` идёт со страницы `/play`. Рыбалка часто ходит `fetch` **из Unity iframe / blob-frame**, а content_script 1.5.5 туда не попадал.

Даже если сессия всё же открывалась, экспорт дополнительно отбрасывал строки:

- `fishingRecordsFromSession` писал только `session.movements`. Первая позиция — `first_position` с `movement: null` → **0 строк**.
- Доска 4 без поплавка (`bobber`) делала `continue`.
- Сессия закрывалась по `catchMeter <= 0` (Dendren часто стартует с 0) или `catchMeter >= catchMax` (в дампе 4×4 было `fishHp 14 / fishMaxHp 14` при `FISH_ESCAPED` / `SUCCESS_CID false`).

## Что чинит 1.5.6

- **Инжект во все фреймы вкладки play.** На `webNavigation.onCommitted` / `onDOMContentLoaded` для `gigaverse.io` / `*.gigaverse.io` / `builds.gigaverse.io` расширение вызывает `chrome.scripting.executeScript`: `page/interceptor.js` в MAIN, `content/index.js` в isolated, `allFrames: true`, `injectImmediately: true`. Ошибки `chrome://` и т.п. глотаются. Content_scripts interceptor остаётся (идемпотентно через `__GDC_INTERCEPTOR_INSTALLED__` / `__GDC_CONTENT_INSTALLED__`). Каждый фрейм с interceptor получает isolated-слушатель postMessage.
- **Сессия не кончается** по catch 0 или catch == max. Только явный `ids.ended` (`COMPLETE_CID === true`, `FISH_ESCAPED`, `FISH_CAUGHT`) или `mana <= 0`. `COMPLETE_CID` по-прежнему только `=== true`.
- **Community-экспорт рыбалки** не требует хода: если движений нет, но есть `currentPos`, пишется один snapshot (step 0, `prevFish: null`). Доска 4: поплавок если есть, иначе `bobber: null` — не `continue`. Board из `gridSize` / `session.board`. Длина руки / mana / catch без токенов.
- Попап: кнопка **Export fishing** — сырые сессии `gfp` JSON (actionToken/jwt зарекачены) даже если пусто, плюс `meta.lastDiagnostic`. Файл `giga-fishing-sessions-YYYY-MM-DD.json`. В idle-строке рыбалки видны `urlPath`, `requestAction`, `reason`, `keys` даже когда `inFishing` false. Export community остаётся; после 1.5.6 там должны появиться fishing-строки, как только ingest заработает.
- Оверлей: клетка рыбы, если есть `session.currentPos`, даже после `endedAt` (последняя позиция до хаба/боя). Не нужны 3 распарсенные карты. Сетка 3×3 при `gridSize === 3`.

Боевой EV / Markov **не** переписывался. По-прежнему только советник: не POST-ит игровые действия, не кликает, не логирует JWT / cookies / Authorization / actionToken.

## Как обновить

1. Откройте `chrome://extensions`
2. Включите «Режим разработчика»
3. На карточке Gigaverse Predictor нажмите **Reload** (обязательно: новое permission `scripting` / `webNavigation`)
4. Обновите вкладку Gigaverse (`gigaverse.io/play`) — F5. Без Reload + F5 инжект во iframe не поднимется.
