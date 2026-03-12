import { parseSocketIo42Message, SocketIoMessage } from "../utils/parsejson";
import { getBaseDir } from "../utils/filepath";
import { EventEmitter } from "events";
import { spawn, ChildProcess } from "child_process";
import { connect as connectWS, TikTokWebSocket } from "../utils/websocket";
import * as path from "path";
import {
  LOG_MESSAGES,
  TIKTOK_CONSTANTS,
  TIKFINITY_EVENTS,
  PATHS,
} from "../constants";

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
      stdio: ["pipe", "pipe", "pipe"],
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
            console.log(LOG_MESSAGES.TIKFINITY.CLOSING_FOR_PAYLOAD);
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
    this.emit(TIKFINITY_EVENTS.EVENT, { eventName, data: eventData });
    
    // Send event to webview for bidirectional communication
    this.sendEventToWebview(eventName, eventData);
  }

  /**
   * Sends an event to the webview for bidirectional communication.
   */
  private sendEventToWebview(eventName: string, data: unknown): void {
    if (this.webviewProcess?.stdin) {
      const eventPayload = JSON.stringify({ eventName, data });
      this.webviewProcess.stdin?.write(`${TIKTOK_CONSTANTS.EVENT_PREFIX}${eventPayload}\n`);
    }
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
   * Resets the client state for reload: disconnects WebSocket and removes listeners,
   * but keeps the webview process alive for reconnection.
   */
  public reset(): void {
    console.log(LOG_MESSAGES.TIKFINITY.RESETTING);
    this.disconnect();
    this.removeAllListeners();
    // Keep webviewProcess and currentPayload for reconnection
  }

  /**
   * Reinitializes after reset: reconnects using existing payload or starts fresh.
   */
  public async reinitialize(): Promise<void> {
    if (this.currentPayload) {
      // Reconnect with existing payload
      console.log(LOG_MESSAGES.TIKFINITY.RECONNECTING_EXISTING);
      connectWS(this.currentPayload, (message) => {
        this.handleMessage(message);
      }).then((ws) => {
        this.wsConnection = ws;
      });
    } else {
      // No existing payload, need to connect fresh
      console.log(LOG_MESSAGES.TIKFINITY.RECONNECTING_FRESH);
      await this.connect();
    }
  }

  /**
   * Safely reconnects using the current payload, without killing the webview.
   */
  public reconnect(): void {
    console.log(LOG_MESSAGES.TIKFINITY.RECONNECTING);
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
