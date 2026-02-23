import { definePlugin, type PluginContext } from "bun_plugins";
import { spawn, ChildProcess } from "child_process";
import * as path from "path";
import { EventEmitter } from "events";
import { connect as connectWS, TikTokWebSocket } from "./utils/websocket";
import { parseSocketIo42Message, SocketIoMessage } from "./utils/parsejson";
import { getBaseDir } from "./utils/filepath";
import {
  LOG_MESSAGES,
  TIKTOK_CONSTANTS,
  PATHS,
  PLATFORMS,
} from "../src/constants";

/**
 * TikFinityClient provides a better API control to connect, disconnect,
 * clean and reconnect to the TikFinity webview and websocket.
 */
export class TikFinityClient extends EventEmitter {
  private webviewProcess: ChildProcess | null = null;
  private wsConnection: TikTokWebSocket | null = null;
  private currentPayload: string | null = null;

  constructor() {
    super();
  }

  /**
   * Starts the webview process and initializes the WebSocket connection 
   * once the payload is received.
   */
  public async connect(): Promise<void> {
    if (this.webviewProcess) {
      console.log(LOG_MESSAGES.WEBVIEW.STARTED);
      return;
    }

    console.log(LOG_MESSAGES.WEBVIEW.STARTED);

    const baseScript = path.join(getBaseDir(), PATHS.TIKFINITY_WEBVIEW_TS);
    const webviewScriptPath = await Bun.file(baseScript).exists()
      ? baseScript
      : path.join(getBaseDir(), PATHS.TIKFINITY_WEBVIEW_JS);

    this.webviewProcess = spawn("bun", ["run", webviewScriptPath], {
      stdio: ["ignore", "pipe", "pipe"],
      shell: true,
      detached: false,
    });

    if (this.webviewProcess.stdout) {
      this.webviewProcess.stdout.on("data", (data) => {
        const output = data.toString();

        if (output.includes(TIKTOK_CONSTANTS.PAYLOAD_PREFIX)) {
          const lines = output.split('\n');
          let payload = "";
          
          for (const line of lines) {
            if (line.includes(TIKTOK_CONSTANTS.PAYLOAD_PREFIX)) {
              payload = line.split(TIKTOK_CONSTANTS.PAYLOAD_PREFIX)[1].trim();
            } else if (line.trim()) {
              console.log(TIKTOK_CONSTANTS.EVENT_MESSAGE, line.trim());
            }
          }
          
          if (!payload || this.currentPayload === payload) {
            return;
          }
          
          this.currentPayload = payload;

          if (this.wsConnection) {
            console.log("Closing previous WS connection for new payload...");
            this.wsConnection.disconnect();
            this.wsConnection = null;
          }

          connectWS(payload, (message) => {
            this.handleMessage(message);
          }).then((ws) => {
            this.wsConnection = ws;
          });
        } else {
            console.log(TIKTOK_CONSTANTS.EVENT_MESSAGE, output.trim());
        }
      });
    }

    if (this.webviewProcess.stderr) {
      this.webviewProcess.stderr.on("data", (data) => {
        console.error(LOG_MESSAGES.WEBVIEW.ERROR, data.toString());
      });
    }

    this.webviewProcess.on("close", (code) => {
      console.log(LOG_MESSAGES.WEBVIEW.CLOSED, code);
      this.webviewProcess = null;
    });

    this.webviewProcess.on("error", (error) => {
      console.error(LOG_MESSAGES.WEBVIEW.ERROR, error);
      this.webviewProcess = null;
    });
  }

  private handleMessage(message: string) {
    const info = SocketIoMessage(message);
    if (!message || !info) return;

    if (info.engineType?.length !== 1) {
      // console.log({ invalidtype: info.engineType });
    }

    const data = parseSocketIo42Message(message);
    if (!data || !data.eventName) return;

    const eventName = data.eventName;
    const eventData = data?.data || message;

    // Emit standard event
    this.emit("event", { eventName, data: eventData });
  }

  /**
   * Closes the active WebSocket connection.
   */
  public disconnect(): void {
    if (this.wsConnection) {
      console.log(LOG_MESSAGES.TIKFINITY.CLOSING_WS);
      this.wsConnection.disconnect();
      this.wsConnection = null;
    }
  }

  /**
   * Fully cleans the state: disconnects the socket, kills the webview,
   * removes the payload and detaches event listeners.
   */
  public clean(): void {
    this.disconnect();
    if (this.webviewProcess) {
      console.log(LOG_MESSAGES.WEBVIEW.CLOSING);
      this.webviewProcess.kill();
      this.webviewProcess = null;
    }
    this.currentPayload = null;
    this.removeAllListeners();
  }

  /**
   * Safely reconnects using the current payload, without killing the webview.
   */
  public reconnect(): void {
    console.log("Reconnecting TikFinity...");
    this.disconnect();
    
    if (this.currentPayload) {
      connectWS(this.currentPayload, (message) => {
        this.handleMessage(message);
      }).then((ws) => {
        this.wsConnection = ws;
      });
    } else {
      this.connect();
    }
  }
}

// Global instance to be used by the plugin
const client = new TikFinityClient();

export default definePlugin({
  name: "tikfinity",
  version: "1.0.0",
  onLoad: async (context: PluginContext) => {
    client.on("event", (payload) => {
      if (context && typeof context.emit === "function") {
        context.emit(PLATFORMS.TIKTOK, payload);
      } else {
        console.log(`[${PLATFORMS.TIKTOK}]`, payload);
      }
    });

    await client.connect();
  },
  onUnload: () => {
    console.log(LOG_MESSAGES.WEBVIEW.ON_UNLOAD);
    client.clean();
  },
});

if (import.meta.main) {
  client.on("event", (payload) => {
    if (payload.eventName === 'chat') {
      console.log(payload.data.comment);
    }
    return
    console.log(`[${PLATFORMS.TIKTOK} Event]:`, typeof payload);
  });
  
  // Test methods on initialization
  client.connect().catch(console.error);
  // test clean
  setTimeout(() => {
    console.log("Cleaning TikFinity...");
    client.clean();
  }, 15000);
}