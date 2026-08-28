/**
 * Smoke: interceptor bootstrap can be evaluated twice without SyntaxError.
 * Uses vm to simulate MAIN-world double inject (manifest + scripting).
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const src = readFileSync(join(root, "page/interceptor.js"), "utf8");

function runInterceptorOnce(sandbox) {
  const script = new vm.Script(src, { filename: "page/interceptor.js" });
  script.runInContext(sandbox);
}

test("interceptor double-inject does not throw PAGE_MESSAGE_SOURCE redeclare", () => {
  const windowObj = {
    fetch: async () => ({ ok: true, clone() { return this; }, json: async () => ({}) }),
    WebSocket: function WebSocket() {},
    postMessage() {},
  };
  windowObj.WebSocket.CONNECTING = 0;
  windowObj.WebSocket.OPEN = 1;
  windowObj.WebSocket.CLOSING = 2;
  windowObj.WebSocket.CLOSED = 3;
  const sandbox = vm.createContext({
    window: windowObj,
    globalThis: windowObj,
    XMLHttpRequest: function XMLHttpRequest() {},
    URL,
    Request: undefined,
    Blob: undefined,
    TextDecoder,
    location: { href: "https://gigaverse.io/play" },
    console,
  });
  // Prototype hooks need a minimal XHR prototype
  sandbox.XMLHttpRequest.prototype = {
    open() {},
    send() {},
    addEventListener() {},
  };

  assert.doesNotThrow(() => runInterceptorOnce(sandbox));
  assert.equal(sandbox.window.__GDC_INTERCEPTOR_INSTALLED__, true);
  assert.doesNotThrow(() => runInterceptorOnce(sandbox));
  assert.equal(sandbox.window.__GDC_INTERCEPTOR_INSTALLED__, true);
});

test("fetch hook rethrows network failures (does not swallow Failed to fetch)", async () => {
  // Fresh window so install runs; native fetch rejects like a real network/abort failure.
  const netErr = new TypeError("Failed to fetch");
  let nativeCalls = 0;
  const windowObj = {
    fetch: async () => {
      nativeCalls += 1;
      throw netErr;
    },
    WebSocket: function WebSocket() {},
    postMessage() {},
  };
  windowObj.WebSocket.CONNECTING = 0;
  windowObj.WebSocket.OPEN = 1;
  windowObj.WebSocket.CLOSING = 2;
  windowObj.WebSocket.CLOSED = 3;
  const sandbox = vm.createContext({
    window: windowObj,
    globalThis: windowObj,
    XMLHttpRequest: function XMLHttpRequest() {},
    URL,
    Request: undefined,
    Blob: undefined,
    TextDecoder,
    location: { href: "https://gigaverse.io/play" },
    console,
  });
  sandbox.XMLHttpRequest.prototype = {
    open() {},
    send() {},
    addEventListener() {},
  };

  runInterceptorOnce(sandbox);
  await assert.rejects(
    () => sandbox.window.fetch("https://gigaverse.io/api/game/dungeon/state"),
    (err) => err === netErr,
  );
  assert.equal(nativeCalls, 1);
});
