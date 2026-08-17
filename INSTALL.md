# Установка Gigaverse Predictor 1.5.2

Способ: Chrome → Load unpacked → папка с `manifest.json`.

## Из zip

1. Скачай `dist/gigaverse-predictor-v1.5.2.zip`
2. Распакуй, например в `C:\Users\<ты>\gigaverse-predictor`
3. `chrome://extensions` → Developer mode → Load unpacked → эта папка
4. Открой https://gigaverse.io/play и обнови страницу

## Из репозитория

1. Code → Download ZIP (корень архива — приватные исходники расширения)
2. Распакуй. `manifest.json` должен быть в корне выбранной папки
3. Load unpacked туда же

## После установки

1. Popup → если в сборке уже есть корпус, **Load bundled dataset**
2. Играй. Логи ходов копятся локально
3. Чтобы помочь общей базе: **Export community** → файл на диск → пришли владельцу репо
4. **Export Full не отправляй никому**

## Если overlay не виден

- Страница должна быть `gigaverse.io/play`
- Расширение включено, после установки страницу перезагружают
- В бою виден combat overlay, в рыбалке — fishing, не оба сразу
