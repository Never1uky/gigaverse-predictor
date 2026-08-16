# Gigaverse Predictor

Приватное репозиторий расширения **v1.5.1**.

Пассивный советчик для боя (Sword / Shield / Spell) и рыбалки (поле 3×3 и новое 4×4).  
Расширение **не нажимает кнопки в игре** и **ничего само не загружает** на GitHub.

- Бой: ключ модели = `dungeonId` (Normal, Underhaul и остальные данжи не смешиваются).
- Рыбалка: `board=3` (пирс) и `board=4` (Dendren, поплавок / Focus) не смешиваются.
- Общая база: только sanitized-логи ходов. Без JWT, cookie, кошелька, `actionToken`.

Готовый zip: [`dist/gigaverse-predictor-v1.5.1.zip`](dist/gigaverse-predictor-v1.5.1.zip)

---

## Установка (Load unpacked)

1. Скачай этот репозиторий (Code → Download ZIP) **или** возьми файл из `dist/`.
2. Если скачал репозиторий целиком — распакуй. Нужна папка, где лежит `manifest.json` (корень репо).
   Если взял `dist/gigaverse-predictor-v1.5.1.zip` — распакуй его в отдельную папку.
3. Открой Chrome → `chrome://extensions`
4. Включи **Developer mode** (справа сверху).
5. **Load unpacked** → укажи папку с `manifest.json`.
6. Открой [gigaverse.io/play](https://gigaverse.io/play), обнови вкладку.
7. Иконка расширения: должен быть статус, что перехват живой.

Обновление: скачай новую версию, распакуй поверх **или** Load unpacked заново в ту же папку, на карточке расширения нажми Reload.

---

## Общая база

Файлы:

- `data/community/combat.jsonl`
- `data/community/fishing.jsonl`

Сейчас они **пустые** (стартовый корпус). Логи копятся у каждого локально в Chrome.

В popup, блок **Community data**:

| Кнопка | Что делает |
|---|---|
| **Load bundled dataset** | Подтянуть jsonl, которые лежат внутри расширения. Никуда не отправляется. |
| **Import file** | Влить json/jsonl с диска (то, что кто-то прислал). |
| **Export community** | Сохранить **свои** ходы в файл на диск. Расширение файл само никуда не шлёт. |
| **Pull from GitHub** | Выключено. У приватного репо raw без токена не открыть, токен в расширение класть нельзя. |

### Как пользоваться чужой базой

1. Поставь расширение.
2. Нажми **Load bundled dataset**, если в `data/community/` уже есть строки.
3. Либо скачай `combat.jsonl` / `fishing.jsonl` из этого репо и **Import file**.

### Как пополнить общую базу (не случайно)

1. Поиграй. Данные пишутся только к тебе в IndexedDB.
2. Нажми **Export community**, подтверди, сохрани файл.
3. Пришли файл владельцу репо (или положи в Issue / передай лично).
4. Владелец допишет строки в `data/community/*.jsonl` и выложит новую сборку.

**Не шарить Export Full** — там `actionToken`. Только Export community.

---

## Режимы, которые должны работать

Данжи (combat overlay, EV): любой `dungeonId` из API, отдельно:

- Dungetron 5000 / normal (`dungeonId` 1)
- Underhaul (`dungeonId` 3)
- остальные (Void / Woods / Gigus) — тот id, который пришёл в state

Рыбалка:

- 3×3 пирс
- 4×4 Dendren (поплавок = focus point, карты 3×3 от центра)

Fishing overlay не должен висеть в бою.

---

## Приватность

- Нет POST в игровые `/api/game/dungeon/action`.
- Нет автозагрузки логов.
- Community-файл без логина и токенов.
- Полный дамп (Export Full) только для себя.
