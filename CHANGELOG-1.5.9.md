# Gigaverse Predictor 1.5.9

## Critical: interceptor double-inject

Since 1.5.6 the MAIN-world `page/interceptor.js` is loaded both via `manifest content_scripts` and `chrome.scripting.executeScript` (Unity iframes). Top-level `const PAGE_MESSAGE_SOURCE` threw on the second inject → **no dungeon capture → no combat overlay**.

**Fix:** wrap the whole interceptor in an IIFE that returns immediately if `window.__GDC_INTERCEPTOR_INSTALLED__` is already set (same pattern as content `__GDC_CONTENT_INSTALLED__`).

## Fishing overlay false-positive

- Page overlay only when `inFishing` (not on Loading / combat leftovers / stale `currentCell`).
- `keepFishingView` no longer sticks `lastPrediction` from a fish cell when idle.
- Popup idle: diagnostic text only — no stale 3×3/4×4 grid.

## Update

1. `chrome://extensions` → **Reload** (one copy only)
2. F5 on `gigaverse.io/play`
3. Errors page should **not** show `PAGE_MESSAGE_SOURCE` redeclare
