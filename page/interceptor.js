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
function shouldCapture(url, method) {
  const m = (method ?? "GET").toUpperCase();
  const path = pathnameOf(url);
  if (path.includes(ACTION_PATH) && m === "POST") return true;
  if (path.includes(STATE_PATH) && (m === "GET" || m === "POST")) return true;
  if (/\/api\/.*(?:fish|fishing)/i.test(path)) return true;
  return false;
}
function extractRequestAction(body) {
  if (body == null) return null;
  try {
    if (typeof body === "string") {
      const parsed = JSON.parse(body);
      return typeof parsed.action === "string" ? parsed.action : null;
    }
    if (typeof body === "object" && !(body instanceof FormData) && !(body instanceof Blob)) {
      const action = body.action;
      return typeof action === "string" ? action : null;
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
function installFetchHook() {
  const originalFetch = window.fetch.bind(window);
  window.fetch = async (input, init) => {
    const url = resolveUrl(input);
    const method = (init == null ? void 0 : init.method) ?? (typeof Request !== "undefined" && input instanceof Request ? input.method : "GET");
    const capture = shouldCapture(url, method);
    let requestAction = null;
    if (capture && (method ?? "GET").toUpperCase() === "POST") {
      requestAction = extractRequestAction(init == null ? void 0 : init.body);
      if (requestAction == null && typeof Request !== "undefined" && input instanceof Request) {
        try {
          const clonedReq = input.clone();
          requestAction = extractRequestAction(await clonedReq.text());
        } catch {
          requestAction = null;
        }
      }
    }
    const response = await originalFetch(input, init);
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
    }
    return response;
  };
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
        try {
          publishCapture({
            url,
            method,
            capturedAt: (/* @__PURE__ */ new Date()).toISOString(),
            response: JSON.parse(xhr.responseText),
            requestAction: extractRequestAction(body)
          });
        } catch {
        }
      });
    }
    return originalSend.call(this, body);
  };
}

function looksFishingJson(data) {
  if (!data || typeof data !== "object") return false;
  const blob = JSON.stringify(Object.keys(data)).toLowerCase();
  return /fish|fishing|play_cards|move_focus|catchmeter|fishcell|bobber|focus/.test(blob);
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
(function bootstrapInterceptor() {
  const flag = "__GDC_INTERCEPTOR_INSTALLED__";
  if (window[flag]) return;
  window[flag] = true;
  installFetchHook();
  installXhrHook();
  installWsHook();
})();
