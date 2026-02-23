import { Application } from "webview-napi";

const injectionScript = `
    (function () {
        window.TiktokPayload = "";
        window.getPayload = function () {
            return window.TiktokPayload;
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
                return;
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
    width: 500,
    height: 700,
  });

  const webview = window.createWebview({
    preload: injectionScript,
    url: "https://tikfinity.zerody.one/",
    enableDevtools: true,
  });

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
    }
  });

  app.onEvent((_e, event) => {
    console.log("event", event);
  });

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
