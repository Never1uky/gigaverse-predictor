# Gigaverse Predictor

Пассивный советчик для боя (Sword / Shield / Spell) и рыбалки (поле 3×3 и 4×4).  
Расширение **не нажимает кнопки в игре** и **ничего само не загружает** на GitHub.

Текущая сборка: **v1.5.2**

- Бой: статистика по `enemyCid` (один и тот же моб в разных забегах копится вместе). Hierarchical backoff + calibration shrink.
- Рыбалка: `board=3` (пирс) и `board=4` (Dendren, поплавок / Focus) не смешиваются.
- Общая база: только sanitized-логи ходов. Без JWT, cookie, кошелька, `actionToken`.

Готовый zip: [`dist/gigaverse-predictor-v1.5.2.zip`](dist/gigaverse-predictor-v1.5.2.zip)

Чтобы улучшить предиктор, нужно больше логов. Ставь расширение, играй, потом **Export community** и присылай файл.

---

## Установка (Load unpacked)

1. Скачай этот репозиторий (Code → Download ZIP) **или** возьми файл из `dist/`.
2. Если скачал репозиторий целиком — распакуй. Нужна папка, где лежит `manifest.json` (корень репо).
   Если взял `dist/gigaverse-predictor-v1.5.2.zip` — распакуй его в отдельную папку.
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
| **Pull from GitHub** | Выключено, пока в настройках нет HTTPS URL. Токен в расширение класть нельзя. |

### Как пользоваться чужой базой

1. Поставь расширение.
2. Нажми **Load bundled dataset**, если в `data/community/` уже есть строки.
3. Либо скачай `combat.jsonl` / `fishing.jsonl` из этого репо и **Import file**.

### Как пополнить общую базу

1. Поиграй. Данные пишутся только к тебе в IndexedDB.
2. Нажми **Export community**, подтверди, сохрани файл.
3. Пришли файл владельцу репо (Issue / личка). **Не шарь Export Full.**
4. Владелец допишет строки в `data/community/*.jsonl` и выложит новую сборку.

**Не шарить Export Full** — там `actionToken`. Только Export community.

---

## Режимы, которые должны работать

Данжи (combat overlay, EV): любой `dungeonId` из API. С 1.5.2 вероятности ходов врага копятся по `enemyCid`, а не по id забега.

- Dungetron 5000 / normal
- Underhaul
- остальные (Void / Woods / Gigus)

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
