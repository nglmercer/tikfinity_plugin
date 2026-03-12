import { Application } from "webview-napi";

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
            if (typeof data === 'string' && data.includes("setUniqueId")) {
                if (window.TiktokPayload !== data) {
                    console.log("injectionScript new data captured:", data)
                    window.TiktokPayload = data;
                    window.ipc.postMessage(data);
                }
                // WE WILL NOT DO "return originalSend()". 
                // Blocking the send in the browser prevents it from kicking out the backend connection (Bun)
                
            }
            return originalSend.apply(this, arguments);
        };
        console.log("WebSocket interceptor injected");
    })();
`;

async function startWebview() {
  console.log("Starting TikFinity webview process...");

  const app = new Application();
  const window = app.createBrowserWindow({
    title: "TikTok Login - Synchronizing TikFinity",
  });

  const webview = window.createWebview({
    preload: injectionScript,
    url: "https://tikfinity.zerody.one/",
    enableDevtools: true,
  });
  webview.openDevtools();
  webview.onIpcMessage((_e, message) => {
    // Convert the message body Buffer to text
    const payload = message.toString();

    console.log("Payload received from browser:", payload);

    if (payload.includes("setUniqueId")) {
      console.log("Credentials captured successfully");
      console.log("PAYLOAD:", payload);

      // Send the payload to the parent process via stdout
      process.stdout.write(`TikFinity_PAYLOAD:${payload}\n`);

      // Wait a moment to ensure the message is sent
      setTimeout(() => {
        // app.exit();
      }, 500);
    } else if (payload.startsWith("TikFinity_EVENT:")) {
      // Handle events sent from backend to webview
      const eventData = payload.replace("TikFinity_EVENT:", "");
      console.log("Event to forward to webview:", eventData);
      
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
      
      if (input.startsWith("TikFinity_EVENT:")) {
        const eventData = input.replace("TikFinity_EVENT:", "").trim();
        
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
                  window.dispatchEvent(new CustomEvent('tikfinity-' + event.eventName, { 
                      detail: event 
                  }));
              }
          })();
        `);
      }
    });
    
    process.stdin.on("error", (err) => {
      console.log("stdin error (non-fatal):", err.message);
    });
  } catch (err) {
    console.log("stdin setup error (non-fatal):", err);
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
