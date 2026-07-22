import { Application } from "webview-napi";
import { buildInjectionScript } from "../injection.ts";
import {
  stringifyEvent,
  parseEvent,
  SET_UNIQUE_ID,
} from "../protocol.ts";

const injectionScript = buildInjectionScript();

const htmlContent = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>TikFinity Test Page</title>
</head>
<body>
  <h1>TikFinity Test Harness</h1>
  <script>
    var wsInstance = null;
    class MockWebSocket {
      constructor(url) {
        this.url = url;
        this.readyState = 0;
        wsInstance = this;
        var self = this;
        setTimeout(function() {
          self.readyState = 1;
          if (self.onopen) self.onopen();
        }, 100);
      }
      send(data) {
        if (this.onmessage && data.includes('setUniqueId')) {
          var self = this;
          setTimeout(function() {
            self.onmessage({ data: JSON.stringify({ uniqueId: 'test_user_123', sessionId: 'abc' }) });
          }, 50);
        }
      }
      close() {
        this.readyState = 3;
        if (this.onclose) this.onclose();
      }
    }
    window.WebSocket = MockWebSocket;
  </script>
  <script>${injectionScript}</script>
</body>
</html>`;

interface TestResult {
  name: string;
  passed: boolean;
  error?: string;
}

const results: TestResult[] = [];

function assert(name: string, condition: boolean, error?: string) {
  results.push({ name, passed: condition, error });
  if (!condition) {
    console.error(`  FAIL: ${name}${error ? ` - ${error}` : ''}`);
  } else {
    console.log(`  PASS: ${name}`);
  }
}

const ipcState = {
  messages: [] as string[],
  evalResolvers: new Map<string, { resolve: (v: string) => void; reject: (e: Error) => void; timer: ReturnType<typeof setTimeout> }>(),
};

function setupIpcHandler(webview: any) {
  webview.onIpcMessage((_e: any, message: any) => {
    const payload = message.toString();

    // Handle debug logs from injection script
    if (payload.startsWith('__TIKFIVITY_LOG__:')) {
      const logMsg = payload.replace('__TIKFIVITY_LOG__:', '');
      console.log(`[webview-log] ${logMsg}`);
      return;
    }

    if (payload.startsWith('__EVAL_RESULT__:')) {
      const rest = payload.replace('__EVAL_RESULT__:', '');
      const colonIdx = rest.indexOf(':');
      if (colonIdx !== -1) {
        const requestId = rest.slice(0, colonIdx);
        const result = rest.slice(colonIdx + 1);
        const entry = ipcState.evalResolvers.get(requestId);
        if (entry) {
          clearTimeout(entry.timer);
          ipcState.evalResolvers.delete(requestId);
          if (result.startsWith('ERROR:')) {
            entry.reject(new Error(result.slice(6)));
          } else {
            entry.resolve(result);
          }
        }
      }
      return;
    }

    ipcState.messages.push(payload);
  });
}

function evalScript(webview: any, js: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const requestId = 'eval_' + Date.now() + '_' + Math.random().toString(36).slice(2);
    const timer = setTimeout(() => {
      ipcState.evalResolvers.delete(requestId);
      reject(new Error('eval timed out'));
    }, 5000);

    ipcState.evalResolvers.set(requestId, { resolve, reject, timer });

    const wrappedJs = `
      (function() {
        try {
          var __result = (function() {
            ${js}
          })();
          var __json = JSON.stringify(__result);
          if (__json === undefined) __json = 'null';
          window.ipc.postMessage('__EVAL_RESULT__:${requestId}:' + __json);
        } catch(e) {
          window.ipc.postMessage('__EVAL_RESULT__:${requestId}:ERROR:' + e.message);
        }
      })();
    `;
    webview.evaluateScript(wrappedJs);
  });
}

async function runE2ETests() {
  console.log("=== TikFinity WebView E2E Tests ===\n");

  const app = new Application();
  const window = app.createBrowserWindow({
    title: "E2E Test - TikFinity WebView",
  });

  const webview = window.createWebview({
    html: htmlContent,
    enableDevtools: false,
  });

  setupIpcHandler(webview);

  // REQUIRED: Poll event loop for IPC to work
  const poll = () => {
    if (app.runIteration()) {
      window.id;
      webview.id;
      setTimeout(poll, 10);
    }
  };
  poll();

  function sendEventToWebview(eventName: string, data: unknown) {
    const event = stringifyEvent({ eventName, data });
    const script = `
      (function() {
        var event = JSON.parse(${JSON.stringify(event)});
        window.pendingEvents.push(event);
        window.dispatchEvent(new MessageEvent('message', {
          data: event,
          origin: 'tikfinity-backend',
          bubbles: true
        }));
        if (event.eventName) {
          window.dispatchEvent(new CustomEvent('tikfinity-' + event.eventName, {
            detail: event
          }));
        }
      })();
    `;
    webview.evaluateScript(script);
  }

  const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

  console.log("--- Test Suite ---\n");

  await wait(2000);

  // Test 1: Injection script loaded - all expected APIs available
  try {
    const raw = await evalScript(webview, `return ({
      hasGetPayload: typeof window.getPayload === 'function',
      hasGetPendingEvents: typeof window.getPendingEvents === 'function',
      hasCheckForEvents: typeof window.checkForEvents === 'function',
      hasSendToBackend: typeof window.sendToBackend === 'function',
      hasOnMessage: typeof window.__webview_on_message__ === 'function'
    });`);
    const state = JSON.parse(raw);
    assert("getPayload is exposed", state.hasGetPayload);
    assert("getPendingEvents is exposed", state.hasGetPendingEvents);
    assert("checkForEvents is exposed", state.hasCheckForEvents);
    assert("sendToBackend is exposed", state.hasSendToBackend);
    assert("__webview_on_message__ is exposed", state.hasOnMessage);
  } catch (e: any) {
    assert("Injection script loaded", false, e.message);
  }

  await wait(500);

  // Test 2: Backend -> Webview event communication
  sendEventToWebview("chat", { comment: "Hello from test!", user: "tester" });
  await wait(300);

  try {
    const raw = await evalScript(webview, `return window.getPendingEvents();`);
    const events = JSON.parse(raw);
    assert("Event received in pendingEvents", events.length > 0, `events: ${raw}`);
    assert("Event has correct eventName", events[0]?.eventName === 'chat', `event: ${raw}`);
    assert("Event has correct data", events[0]?.data?.comment === 'Hello from test!', `event: ${raw}`);
  } catch (e: any) {
    assert("Backend -> Webview event communication", false, e.message);
  }

  // Test 3: WebSocket interceptor - payload capture
  try {
    await evalScript(webview, `
      var payload = JSON.stringify({
        eventName: 'setUniqueId',
        data: { uniqueId: 'test_user_e2e', sessionId: 'sess_e2e_123' }
      });
      window.sendToBackend(payload);
      return 'sent';
    `);
  } catch (e: any) {
    assert("WebSocket interceptor payload capture", false, e.message);
  }

  await wait(300);

  // Test 4: IPC message received by backend
  assert("IPC message sent for payload", ipcState.messages.some(m => m.includes('setUniqueId')),
    `ipcMessages: ${JSON.stringify(ipcState.messages)}`);

  // Test 5: Verify IPC message was received by backend with payload content
  assert("IPC payload contains setUniqueId", ipcState.messages.some(m => m.includes('setUniqueId')),
    `ipcMessages: ${JSON.stringify(ipcState.messages)}`);

  // Test 6: __webview_on_message__ handler
  try {
    await evalScript(webview, `
      var testEvent = JSON.stringify({ eventName: 'gift', data: { giftId: 123, user: 'donor' } });
      window.__webview_on_message__(testEvent);
      return 'ok';
    `);
    await wait(100);
    const raw = await evalScript(webview, `return window.getPendingEvents();`);
    const events = JSON.parse(raw);
    assert("__webview_on_message__ pushes to pendingEvents", events.length > 0, `events: ${raw}`);
    assert("__webview_on_message__ parses JSON correctly", events[0]?.eventName === 'gift', `event: ${raw}`);
  } catch (e: any) {
    assert("__webview_on_message__ handler", false, e.message);
  }

  // Test 7: Protocol stringify/parse roundtrip
  try {
    const original = { eventName: 'test', data: { nested: { value: 42 } } };
    const stringified = stringifyEvent(original);
    const parsed = parseEvent(stringified);
    assert("stringifyEvent produces valid JSON", typeof stringified === 'string');
    assert("parseEvent recovers original data", JSON.stringify(parsed) === JSON.stringify(original));
    assert("parseEvent returns null for invalid JSON", parseEvent('not json') === null);
  } catch (e: any) {
    assert("Protocol stringify/parse roundtrip", false, e.message);
  }

  // Test 8: WebSocket interceptor idempotency
  try {
    const raw = await evalScript(webview, `return ({ intercepted: WebSocket.prototype.send.__tikfinityIntercepted });`);
    const state = JSON.parse(raw);
    assert("WebSocket interceptor is marked as intercepted", state.intercepted === true);
  } catch (e: any) {
    assert("WebSocket interceptor idempotency check", false, e.message);
  }

  // Test 9: SET_UNIQUE_ID constant properly interpolated
  // Note: window.ipc is frozen by webview-napi, so we verify by checking
  // that WebSocket.prototype.send triggers payload capture
  try {
    const raw = await evalScript(webview, `
      var testPayload = '{"eventName":"setUniqueId","data":{}}';
      WebSocket.prototype.send(testPayload);
      return window.TiktokPayload;
    `);
    assert("SET_UNIQUE_ID constant properly interpolated in interceptor",
      raw.includes('setUniqueId'), `payload: ${raw}`);
  } catch (e: any) {
    assert("Constant interpolation check", false, e.message);
  }

  // Summary
  console.log("\n=== Test Summary ===");
  const passed = results.filter(r => r.passed).length;
  const failed = results.filter(r => !r.passed).length;
  console.log(`Total: ${results.length} | Passed: ${passed} | Failed: ${failed}`);

  if (failed > 0) {
    console.log("\nFailed tests:");
    results.filter(r => !r.passed).forEach(r => {
      console.log(`  - ${r.name}: ${r.error}`);
    });
  }

  app.exit();
  await wait(500);
  process.exit(failed > 0 ? 1 : 0);
}

const globalTimeout = setTimeout(() => {
  console.error("\n!!! TEST SUITE TIMED OUT AFTER 30 SECONDS !!!");
  process.exit(1);
}, 30000);

runE2ETests()
  .then(() => clearTimeout(globalTimeout))
  .catch(err => {
    clearTimeout(globalTimeout);
    console.error("Test suite crashed:", err);
    process.exit(1);
  });
