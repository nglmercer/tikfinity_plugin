import {
  TIKTOK_CONSTANTS,
  LOG_MESSAGES,
  TIMING,
  WS_CONSTANTS,
} from "../../src/constants";

interface Emitter {
  (message: string): void;
}

interface ConnectionOptions {
  reconnect?: boolean;
  maxReconnectAttempts?: number;
  reconnectDelay?: number;
  maxReconnectDelay?: number;
  logger?: (message: string, ...args: unknown[]) => void;
}

class TikTokWebSocket {
  private socket: WebSocket | null = null;
  private payload: string;
  private emitter?: Emitter;
  private options: Required<ConnectionOptions>;
  private reconnectAttempts = 0;
  private reconnectTimer: Timer | null = null;
  private isManuallyClosed = false;
  private iomsg = TIKTOK_CONSTANTS.ENGINE_IO_MESSAGE;

  constructor(payload: string, emitter?: Emitter, options: ConnectionOptions = {}) {
    this.payload = payload;
    this.emitter = emitter;
    this.options = {
      reconnect: options.reconnect ?? true,
      maxReconnectAttempts: options.maxReconnectAttempts ?? WS_CONSTANTS.MAX_RECONNECT_ATTEMPTS,
      reconnectDelay: options.reconnectDelay ?? TIMING.RECONNECT_DELAY,
      maxReconnectDelay: options.maxReconnectDelay ?? TIMING.MAX_RECONNECT_DELAY,
      logger: options.logger ?? console.log,
    };
  }

  connect(): void {
    if (this.socket?.readyState === WebSocket.OPEN) {
      this.options.logger(LOG_MESSAGES.WEBSOCKET.ALREADY_OPEN);
      return;
    }

    this.isManuallyClosed = false;
    this.options.logger(LOG_MESSAGES.WEBSOCKET.CONNECTING(this.reconnectAttempts + 1));

    this.socket = new WebSocket(
      `${TIKTOK_CONSTANTS.WEBSOCKET_URL}${TIKTOK_CONSTANTS.WEBSOCKET_PARAMS}`
    );

    this.socket.onopen = () => {
      this.options.logger(LOG_MESSAGES.WEBSOCKET.OPEN);
      this.reconnectAttempts = 0;
      // We no longer send '40' or the payload blindly.
      // We will wait for Engine.io and Socket.io handshake messages respectively.
    };

    this.socket.onmessage = (event) => {
      this.emitter?.(event.data);
      const dataStr = String(event.data);

      // PING/PONG handling (Socket.io requires it to not disconnect)
      if (dataStr === TIKTOK_CONSTANTS.PING_MESSAGE) {
        this.socket?.send(TIKTOK_CONSTANTS.PONG_MESSAGE);
      }
      // Handshake step 1: Server sends Engine.io open -> we send Socket.io connect ('40')
      else if (dataStr.startsWith("0{")) {
        this.socket?.send(this.iomsg);
      }
      // Handshake step 2: Server accepts Socket.io connect -> we send our payload ('42[...]')
      else if (dataStr.startsWith("40")) {
        this.socket?.send(this.payload);
        this.options.logger(LOG_MESSAGES.WEBSOCKET.PAYLOAD_SENT);
      }
    };

    this.socket.onerror = (error) => {
      this.options.logger('wsError: ' + JSON.stringify(error));
    };

    this.socket.onclose = (event) => {
      this.options.logger('closed: ' + JSON.stringify(event));

      this.socket = null;

      // Try to reconnect if it wasn't a manual close
      if (!this.isManuallyClosed && this.options.reconnect) {
        this.scheduleReconnect();
      }
    };
  }

  private scheduleReconnect(): void {
    if (this.reconnectAttempts >= this.options.maxReconnectAttempts) {
      this.options.logger(LOG_MESSAGES.WEBSOCKET.MAX_RECONNECT);
      return;
    }

    this.reconnectAttempts++;

    // Exponential backoff with jitter
    const delay = Math.min(
      this.options.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1),
      this.options.maxReconnectDelay
    );
    const jitter = Math.random() * 1000;
    const finalDelay = delay + jitter;

    this.options.logger(
      LOG_MESSAGES.WEBSOCKET.RECONNECTING(finalDelay, this.reconnectAttempts, this.options.maxReconnectAttempts)
    );

    this.reconnectTimer = setTimeout(() => {
      this.connect();
    }, finalDelay);
  }

  disconnect(): void {
    this.isManuallyClosed = true;

    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    if (this.socket) {
      this.socket.close(WS_CONSTANTS.CLOSE_CODE_NORMAL, LOG_MESSAGES.WEBSOCKET.MANUAL_CLOSE);
      this.socket = null;
    }

    this.options.logger(LOG_MESSAGES.WEBSOCKET.DISCONNECTED);
  }

  isConnected(): boolean {
    return this.socket?.readyState === WebSocket.OPEN;
  }

  updatePayload(newPayload: string): void {
    this.payload = newPayload;

    if (this.isConnected()) {
      this.options.logger(LOG_MESSAGES.WEBSOCKET.UPDATING_PAYLOAD);
      this.socket?.send(newPayload);
      this.options.logger(LOG_MESSAGES.WEBSOCKET.NEW_PAYLOAD_SENT);
    } else {
      this.options.logger(LOG_MESSAGES.WEBSOCKET.NOT_CONNECTED);
      this.connect();
    }
  }
}

export async function connect(
  payload: string,
  emitter?: Emitter,
  options?: ConnectionOptions
): Promise<TikTokWebSocket> {
  const ws = new TikTokWebSocket(payload, emitter, options);
  ws.connect();
  return ws;
}

export { TikTokWebSocket };
