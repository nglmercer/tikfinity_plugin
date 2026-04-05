import { parseSocketIo42Message, SocketIoMessage } from "../utils/parsejson.js";
import { getBaseDir, findInRoots } from "../utils/filepath.js";
import { EventEmitter } from "events";
import { spawn, ChildProcess } from "child_process";
import { connect as connectWS, TikTokWebSocket } from "../utils/websocket.js";
import * as path from "path";
import * as fs from "fs";
import {
  LOG_MESSAGES,
  TIKTOK_CONSTANTS,
  TIKFINITY_EVENTS,
  PATHS,
  type TikFinityOptions,
} from "../constants.js";

// Function to get webview script - writes embedded content to temp file for executable
async function getWebviewScriptPath(): Promise<string> {
  const scriptName = path.basename(PATHS.TIKFINITY_WEBVIEW_TS);
  const scriptNameJs = scriptName.replace(/\.ts$/, '.js');
  
  const candidates = [
    `webview/${scriptNameJs}`,
    scriptNameJs,
    PATHS.TIKFINITY_WEBVIEW_TS,
    scriptName,
    // Also try relative to the current module directory in case we're deep in dist or src
    (() => {
        try {
            // @ts-ignore
            const currentDir = import.meta.dir;
            if (currentDir) return path.join(currentDir, '..', '..', PATHS.TIKFINITY_WEBVIEW_TS);
        } catch(e) {}
        return "";
    })()
  ].filter(Boolean);


  const foundPath = await findInRoots(candidates);

  if (foundPath) {
    return foundPath;
  }

  const baseDir = getBaseDir();
  throw new Error(
    `Webview script not found. For bundled executable, ensure 'webview/tikfinity-webview.ts' is included.\n` +
    `Looked for these files:\n${candidates.map(c => `  - ${c}`).join('\n')}\n` +
    `Base directory identified as: ${baseDir}`
  );
}



/**
 * TikFinityClient provides a better API control to connect, disconnect,
 * clean and reconnect to the TikFinity webview and websocket.
 */
export class TikFinityClient extends EventEmitter {
  private webviewProcess: ChildProcess | null = null;
  private wsConnection: TikTokWebSocket | null = null;
  private currentPayload: string | null = null;
  private options: TikFinityOptions = {};
  private logger: (message: string, ...args: unknown[]) => void = console.log;

  constructor(options: TikFinityOptions = {}) {
    super();
    this.options = options;
    if (options.logger) {
      this.logger = options.logger;
    } else if (options.debug) {
      this.logger = (msg, ...args) => console.log(`[TikFinity]`, msg, ...args);
    }
  }

  /**
   * Starts the webview process and initializes the WebSocket connection 
   * once the payload is received.
   */
  public async connect(options?: TikFinityOptions): Promise<void> {
    if (this.webviewProcess) {
      this.logger(LOG_MESSAGES.WEBVIEW.STARTED);
      return;
    }

    // Merge options
    if (options) {
      this.options = { ...this.options, ...options };
      if (options.logger) {
        this.logger = options.logger;
      } else if (options.debug && !this.options.logger) {
        this.logger = (msg, ...args) => console.log(`[TikFinity]`, msg, ...args);
      }
    }

    this.logger(LOG_MESSAGES.WEBVIEW.STARTED);

    // Get the webview script path
    const webviewScriptPath = await getWebviewScriptPath();
    this.logger(`Using webview script: ${webviewScriptPath}`);

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
              this.logger(TIKTOK_CONSTANTS.EVENT_MESSAGE, line.trim());
            }
          }
          
          if (!payload || this.currentPayload === payload) {
            return;
          }
          
          this.currentPayload = payload;
          this.emit(TIKFINITY_EVENTS.PAYLOAD, payload);
          if (this.wsConnection) {
            console.log(LOG_MESSAGES.TIKFINITY.CLOSING_FOR_PAYLOAD);
            this.wsConnection.disconnect();
            this.wsConnection = null;
          }

          connectWS(payload, (message) => {
            this.handleMessage(message);
          }, {
            reconnect: this.options.autoReconnect ?? true,
            maxReconnectAttempts: this.options.maxReconnectAttempts,
            reconnectDelay: this.options.reconnectDelay,
            maxReconnectDelay: this.options.maxReconnectDelay,
            logger: this.logger,
          }).then((ws) => {
            this.wsConnection = ws;
          });
        } else {
            this.logger(TIKTOK_CONSTANTS.EVENT_MESSAGE, output.trim());
        }
      });
    }

    if (this.webviewProcess.stderr) {
      this.webviewProcess.stderr.on("data", (data) => {
        console.error(LOG_MESSAGES.WEBVIEW.ERROR, data.toString());
      });
    }

    this.webviewProcess.on("close", (code) => {
      this.logger(LOG_MESSAGES.WEBVIEW.CLOSED, code);
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
      
      try {
        // First, try to gracefully close by writing to stdin
        // The webview script listens for commands
        if (this.webviewProcess.stdin) {
          this.webviewProcess.stdin.write('TikFinity_EXIT\n');
        }
        
        // Try to kill gracefully first
      } catch (e) {
        this.webviewProcess.kill('SIGTERM');
        this.webviewProcess.kill('SIGKILL');
      }
      
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
