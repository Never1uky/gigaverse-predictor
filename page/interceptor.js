/**
 * MAIN-world fetch/XHR/WS interceptor. Safe to inject multiple times
 * (manifest content_scripts + chrome.scripting.executeScript).
 */
(() => {
  const flag = "__GDC_INTERCEPTOR_INSTALLED__";
  if (window[flag]) return;
  window[flag] = true;

  const PAGE_MESSAGE_SOURCE = "GDC";
  const PAGE_MESSAGE_TYPE = "DUNGEON_CAPTURE";
  const ACTION_PATH = "/api/game/dungeon/action";
  const STATE_PATH = "/api/game/dungeon/state";

  function resolveUrl(input) {
    if (typeof input === "string") return input;
    if (input instanceof URL) return input.toString();
    if (typeof Request !== "undefined" && input instanceof Request) return input.url;
    return String(input);
  }
  function pathnameOf(url) {
    try {
      return new URL(url, location.href).pathname;
    } catch {
      return url;
    }
  }
  function isPrivyOrAuthUrl(url, path) {
    const blob = `${url} ${path}`.toLowerCase();
    if (blob.includes("privy") || blob.includes("oauth")) return true;
    if (/\/(auth|login|signup)(\/|$)/i.test(path) && !path.includes("/api/game/")) return true;
    return false;
  }
  function isUnrelatedGamePath(path) {
    return /\/(energy|auth|privy|oauth|analytics|sentry|telemetry|pixel)(\/|$)/i.test(path);
  }
  function shouldCapture(url, method) {
    const m = (method ?? "GET").toUpperCase();
    const path = pathnameOf(url);
    const urlStr = String(url ?? "");
    if (isPrivyOrAuthUrl(urlStr, path)) return false;
    if (path.includes(ACTION_PATH) && m === "POST") return true;
    if (path.includes(STATE_PATH) && (m === "GET" || m === "POST")) return true;
    if (/\/api\/game\//i.test(path) && !isUnrelatedGamePath(path)) return true;
    if (/\/api\/gamewebui(\/|$)/i.test(path) && !isUnrelatedGamePath(path)) return true;
    if (/cards|pond|bobber|focus|fishing|fish|play_cards|move_focus/i.test(path)) return true;
    return false;
  }
  function pickActionFromObject(obj) {
    if (!obj || typeof obj !== "object") return null;
    for (const key of ["action", "Action", "actionName", "type"]) {
      if (typeof obj[key] === "string" && obj[key]) return obj[key];
    }
    if (obj.payload && typeof obj.payload.action === "string") return obj.payload.action;
    if (obj.data && typeof obj.data.action === "string") return obj.data.action;
    return null;
  }
  function extractRequestAction(body) {
    if (body == null) return null;
    try {
      if (typeof body === "string") {
        const parsed = JSON.parse(body);
        return pickActionFromObject(parsed);
      }
      if (typeof body === "object" && !(body instanceof FormData) && !(body instanceof Blob)) {
        return pickActionFromObject(body);
      }
    } catch {
    }
    return null;
  }
  function publishCapture(payload) {
    const message = {
      source: PAGE_MESSAGE_SOURCE,
      type: PAGE_MESSAGE_TYPE,
      payload
    };
    window.postMessage(message, "*");
  }
  /** Opt-in via content script / console: window.__GDC_DEBUG__ = true */
  function debugFetchFail(url, method, err) {
    try {
      if (!window.__GDC_DEBUG__) return;
      const name = err && typeof err === "object" && "name" in err ? err.name : "Error";
      const msg = err && typeof err === "object" && "message" in err ? String(err.message) : String(err);
      // No Authorization / cookie / JWT — url path + method only.
      console.debug("[GDC][fetch-fail]", (method ?? "GET").toUpperCase(), pathnameOf(url), name, msg);
    } catch {
      // never break the page for logging
    }
  }
  /**
   * Read POST action from init.body or a *clone* of Request.
   * Never consume the original Request body stream (needed for originalFetch / retry).
   */
  async function peekRequestAction(input, init, method) {
    if ((method ?? "GET").toUpperCase() !== "POST") return null;
    const fromInit = extractRequestAction(init == null ? void 0 : init.body);
    if (fromInit != null) return fromInit;
    if (typeof Request === "undefined" || !(input instanceof Request)) return null;
    try {
      const clonedReq = input.clone();
      return extractRequestAction(await clonedReq.text());
    } catch {
      return null;
    }
  }
  function installFetchHook() {
    const originalFetch = window.fetch.bind(window);
    window.fetch = async (input, init) => {
      const url = resolveUrl(input);
      const method =
        (init == null ? void 0 : init.method) ??
        (typeof Request !== "undefined" && input instanceof Request ? input.method : "GET");
      const capture = shouldCapture(url, method);
      let requestAction = null;
      if (capture) {
        requestAction = await peekRequestAction(input, init, method);
      }
      let response;
      try {
        // Network / abort / CORS failures must reject the same way as native fetch.
        response = await originalFetch(input, init);
      } catch (err) {
        debugFetchFail(url, method, err);
        throw err;
      }
      if (!capture) return response;
      try {
        const cloned = response.clone();
        const data = await cloned.json();
        publishCapture({
          url,
          method: (method ?? "GET").toUpperCase(),
          capturedAt: (/* @__PURE__ */ new Date()).toISOString(),
          response: data,
          requestAction
        });
      } catch {
        // Non-JSON responses: ignore capture, still return the real Response.
      }
      return response;
    };
  }
  async function parseXhrResponse(xhr) {
    const rt = xhr.responseType || "";
    if (rt === "arraybuffer" && xhr.response instanceof ArrayBuffer) {
      const text = new TextDecoder("utf-8").decode(xhr.response);
      return JSON.parse(text);
    }
    if (rt === "blob" && typeof Blob !== "undefined" && xhr.response instanceof Blob) {
      const text = await xhr.response.text();
      return JSON.parse(text);
    }
    if (typeof xhr.responseText === "string" && xhr.responseText) {
      return JSON.parse(xhr.responseText);
    }
    if (xhr.response && typeof xhr.response === "object") return xhr.response;
    return null;
  }
  function installXhrHook() {
    const originalOpen = XMLHttpRequest.prototype.open;
    const originalSend = XMLHttpRequest.prototype.send;
    XMLHttpRequest.prototype.open = function(method, url, async, username, password) {
      const urlStr = typeof url === "string" ? url : url.toString();
      this.__gdcUrl = urlStr;
      this.__gdcMethod = method;
      if (async === void 0) {
        return originalOpen.call(this, method, url, true, username ?? null, password ?? null);
      }
      return originalOpen.call(this, method, url, async, username ?? null, password ?? null);
    };
    XMLHttpRequest.prototype.send = function(body) {
      const xhr = this;
      if (!xhr.__gdcHooked) {
        xhr.__gdcHooked = true;
        xhr.addEventListener("load", () => {
          const url = xhr.__gdcUrl ?? "";
          const method = (xhr.__gdcMethod ?? "GET").toUpperCase();
          if (!shouldCapture(url, method)) return;
          void (async () => {
            try {
              const parsed = await parseXhrResponse(xhr);
              if (parsed == null) return;
              publishCapture({
                url,
                method,
                capturedAt: (/* @__PURE__ */ new Date()).toISOString(),
                response: parsed,
                requestAction: extractRequestAction(body)
              });
            } catch {
              // Ignore binary / non-JSON XHR silently.
            }
          })();
        });
      }
      return originalSend.call(this, body);
    };
  }

  function looksFishingJson(data) {
    if (!data || typeof data !== "object") return false;
    const blob = JSON.stringify(Object.keys(data)).toLowerCase();
    return /fish|fishing|play_cards|move_focus|catchmeter|fishcell|bobber|focus|fishing_game|doctype|fishposition|deckcarddata/.test(blob);
  }
  function installWsHook() {
    const Orig = window.WebSocket;
    if (!Orig) return;
    const Wrapped = function (url, protocols) {
      const ws = protocols === undefined ? new Orig(url) : new Orig(url, protocols);
      ws.addEventListener("message", (event) => {
        try {
          const raw = event.data;
          if (typeof raw !== "string" || raw.length > 200000) return;
          if (raw[0] !== "{" && raw[0] !== "[") return;
          const data = JSON.parse(raw);
          if (!looksFishingJson(data)) return;
          publishCapture({
            url: String(url),
            method: "WS",
            capturedAt: new Date().toISOString(),
            response: data,
            requestAction: null,
          });
        } catch {
          // ignore non-json
        }
      });
      return ws;
    };
    Wrapped.prototype = Orig.prototype;
    Wrapped.CONNECTING = Orig.CONNECTING;
    Wrapped.OPEN = Orig.OPEN;
    Wrapped.CLOSING = Orig.CLOSING;
    Wrapped.CLOSED = Orig.CLOSED;
    window.WebSocket = Wrapped;
  }

  installFetchHook();
  installXhrHook();
  installWsHook();
})();
