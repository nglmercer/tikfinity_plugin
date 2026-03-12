import { Application } from "webview-napi";

// Constants to avoid magic strings
const TIKFINITY_URL = "https://tikfinity.zerody.one/";
const PAYLOAD_PREFIX = "TikFinity_PAYLOAD:";
const EVENT_PREFIX = "TikFinity_EVENT:";
const EVENT_CUSTOM_PREFIX = "tikfinity-";
const SET_UNIQUE_ID = "setUniqueId";
const INJECTION_LOG_NEW_DATA = "injectionScript new data captured:";
const INJECTION_LOG_INTERCEPTOR = "WebSocket interceptor injected";
const STARTUP_LOG = "Starting TikFinity webview process...";
const WINDOW_TITLE = "TikTok Login - Synchronizing TikFinity";
const PAYLOAD_LOG_RECEIVED = "Payload received from browser:";
const PAYLOAD_LOG_CREDENTIALS = "Credentials captured successfully";
const PAYLOAD_LOG_LABEL = "PAYLOAD:";
const EVENT_LOG_FORWARD = "Event to forward to webview:";
const EVENT_LOG_STDIN = "stdin error (non-fatal):";
const EVENT_LOG_STDIN_SETUP = "stdin setup error (non-fatal):";

const injectionScript = `
    (function () {
        window.TiktokPayload = "";
        window.pendingEvents = [];
        
        window.getPayload = function () {
            return window.TiktokPayload;
        };
        
        // Function to get pending events from webview
        window.getPendingEvents = function () {
            const events = window.pendingEvents.slice();
            window.pendingEvents = [];
            return events;
        };
        
        // Listen for events from parent (backend) via custom protocol
        // We'll use a polling mechanism to check for events
        window.checkForEvents = function () {
            if (window.pendingEvents.length > 0) {
                return window.pendingEvents.shift();
            }
            return null;
        };
        
        // Expose function to send messages to parent
        window.sendToBackend = function(data) {
            window.ipc.postMessage(data);
        };
        
        const originalSend = WebSocket.prototype.send;
        WebSocket.prototype.send = function (data) {
            if (typeof data === 'string' && data.includes("${SET_UNIQUE_ID}")) {
                if (window.TiktokPayload !== data) {
                    console.log("${INJECTION_LOG_NEW_DATA}", data)
                    window.TiktokPayload = data;
                    window.ipc.postMessage(data);
                }
                // WE WILL NOT DO "return originalSend()". 
                // Blocking the send in the browser prevents it from kicking out the backend connection (Bun)
                
            }
            return originalSend.apply(this, arguments);
        };
        console.log("${INJECTION_LOG_INTERCEPTOR}");
    })();
`;

async function startWebview() {
  console.log(STARTUP_LOG);

  const app = new Application();
  const window = app.createBrowserWindow({
    title: WINDOW_TITLE,
  });

  const webview = window.createWebview({
    preload: injectionScript,
    url: TIKFINITY_URL,
    enableDevtools: true,
  });
  if (process && process.env.NODE_ENV === "development") {
    webview.openDevtools();
  }
  webview.onIpcMessage((_e, message) => {
    // Convert the message body Buffer to text
    const payload = message.toString();

    console.log(PAYLOAD_LOG_RECEIVED, payload);

    if (payload.includes(SET_UNIQUE_ID)) {
      console.log(PAYLOAD_LOG_CREDENTIALS);
      console.log(PAYLOAD_LOG_LABEL, payload);

      // Send the payload to the parent process via stdout
      process.stdout.write(`${PAYLOAD_PREFIX}${payload}\n`);

      // Wait a moment to ensure the message is sent
      setTimeout(() => {
        // app.exit();
      }, 500);
    } else if (payload.startsWith(EVENT_PREFIX)) {
      // Handle events sent from backend to webview
      const eventData = payload.replace(EVENT_PREFIX, "");
      console.log(EVENT_LOG_FORWARD, eventData);
      
      // Evaluate JavaScript in the webview to dispatch the event
      webview.evaluateScript(`
        (function() {
            window.pendingEvents.push(${eventData});
            window.dispatchEvent(new MessageEvent('message', { 
                data: ${eventData},
                origin: 'tikfinity-backend'
            }));
        })();
      `);
    }
  });

  app.onEvent((_e, event) => {
    console.log("event", event);
  });

  // Listen for events from parent process via stdin
  try {
    process.stdin.resume();
    process.stdin.setEncoding("utf8");
    
    process.stdin.on("data", (chunk) => {
      const input = chunk.toString();
      
      if (input.startsWith(EVENT_PREFIX)) {
        const eventData = input.replace(EVENT_PREFIX, "").trim();
        
        // Forward event to webview JavaScript
        webview.evaluateScript(`
          (function() {
              const event = ${eventData};
              window.pendingEvents.push(event);
              window.dispatchEvent(new MessageEvent('message', { 
                  data: event,
                  origin: 'tikfinity-backend',
                  bubbles: true
              }));
              // Also dispatch specific event
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
