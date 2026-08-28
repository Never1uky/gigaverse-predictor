# Gigaverse Predictor 1.6.2

## Fetch interceptor: transparent network failures

`page/interceptor.js` now wraps `originalFetch` in try/catch and **rethrows** the same error (network / abort / CORS `Failed to fetch`). Capture JSON parsing stays isolated; failed fetches are never turned into a fake success Response.

- Request body for `requestAction` is read only from `init.body` or a **cloned** `Request` — original stream untouched for the real fetch.
- Optional debug: set `window.__GDC_DEBUG__ = true` in the page console to log `[GDC][fetch-fail]` with method + pathname only (no Authorization / cookies / JWT).

No combat predict / EV / fishing logic changes.

## Update

1. Reload unpacked from `dist/` (or install the zip)
2. Hard refresh `gigaverse.io/play`
3. Occasional `Failed to fetch` in Console may still appear if the **game** leaves the promise uncaught — that is network failure, not a broken extension
