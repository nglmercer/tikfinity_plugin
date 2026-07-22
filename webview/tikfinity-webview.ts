import { Application } from "webview-napi";
import { buildInjectionScript } from "./injection.ts";
import {
  PAYLOAD_PREFIX,
  EVENT_PREFIX,
  EVENT_CUSTOM_PREFIX,
  SET_UNIQUE_ID,
  EXIT_COMMAND,
  stringifyEvent,
  parseEvent,
  wrapEvent,
} from "./protocol.ts";

const TIKFINITY_URL = "https://tikfinity.zerody.one/";
const STARTUP_LOG = "Starting TikFinity webview process...";
const WINDOW_TITLE = "TikTok Login - Synchronizing TikFinity";
const PAYLOAD_LOG_RECEIVED = "Payload received from browser:";
const PAYLOAD_LOG_CREDENTIALS = "Credentials captured successfully";
const PAYLOAD_LOG_LABEL = "PAYLOAD:";
const EVENT_LOG_FORWARD = "Event to forward to webview:";
const EVENT_LOG_STDIN = "stdin error (non-fatal):";
const EVENT_LOG_STDIN_SETUP = "stdin setup error (non-fatal):";

async function startWebview() {
  console.log(STARTUP_LOG);

  const app = new Application();
  const window = app.createBrowserWindow({
    title: WINDOW_TITLE,
  });

  const webview = window.createWebview({
    preload: buildInjectionScript(),
    url: TIKFINITY_URL,
    enableDevtools: true,
  });

  webview.onIpcMessage((_e, message) => {
    const payload = message.toString();

    // Handle debug logs from injection script
    if (payload.startsWith('__TIKFIVITY_LOG__:')) {
      const logMsg = payload.replace('__TIKFIVITY_LOG__:', '');
      console.error('[webview]', logMsg);
      return;
    }

    console.log(PAYLOAD_LOG_RECEIVED, payload);

    if (payload.includes(SET_UNIQUE_ID)) {
      console.log(PAYLOAD_LOG_CREDENTIALS);
      console.log(PAYLOAD_LOG_LABEL, payload);

      process.stdout.write(`${PAYLOAD_PREFIX}${payload}\n`);

      setTimeout(() => {}, 500);
    } else if (payload.startsWith(EVENT_PREFIX)) {
      const eventData = payload.replace(EVENT_PREFIX, "");
      console.log(EVENT_LOG_FORWARD, eventData);

      webview.evaluateScript(`
        (function() {
            const eventData = JSON.parse(${JSON.stringify(eventData)});
            window.pendingEvents.push(eventData);
            window.dispatchEvent(new MessageEvent('message', {
                data: eventData,
                origin: 'tikfinity-backend'
            }));
        })();
      `);
    }
  });

  app.onEvent((_e, event) => {
    console.log("event", event);
  });

  try {
    process.stdin.resume();
    process.stdin.setEncoding("utf8");

    process.stdin.on("data", (chunk) => {
      const input = chunk.toString();

      if (input.startsWith(EXIT_COMMAND)) {
        console.log('Received exit command, closing webview...');
        app.exit();
        return;
      }

      if (input.startsWith(EVENT_PREFIX)) {
        const eventData = input.replace(EVENT_PREFIX, "").trim();

        webview.evaluateScript(`
          (function() {
              const event = JSON.parse(${JSON.stringify(eventData)});
              window.pendingEvents.push(event);
              window.dispatchEvent(new MessageEvent('message', {
                  data: event,
                  origin: 'tikfinity-backend',
                  bubbles: true
              }));
              if (event.eventName) {
                  window.dispatchEvent(new CustomEvent('${EVENT_CUSTOM_PREFIX}' + event.eventName, {
                      detail: event
                  }));
              }
          })();
        `);
      }
    });

    process.stdin.on("error", (err) => {
      console.log(EVENT_LOG_STDIN, err.message);
    });
  } catch (err) {
    console.log(EVENT_LOG_STDIN_SETUP, err);
  }

  const poll = () => {
    if (app.runIteration()) {
      window.id;
      webview.id;
      setTimeout(poll, 10);
    } else {
      process.exit(0);
    }
  };
  poll();
}

startWebview();
