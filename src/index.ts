import { type IPlugin, type PluginContext,type EventEmitterPluginType } from "./types/plugin.js";
import {
  LOG_MESSAGES,
  PLATFORMS,
  TIKFINITY_EVENTS,
  type TikFinityOptions,
} from "./constants.js";
import { TikFinityClient } from "./client/index.js";

// Global instance to be used by the plugin
const client = new TikFinityClient();

// Event handler reference for cleanup
let eventHandler: ((payload: unknown) => void) | null = null;

export { TikFinityClient };
export const tikfinityClient = client;
export type { TikFinityOptions };

/**
 * Create a TikFinity client with custom options
 */
export function createTikFinityClient(options?: TikFinityOptions): TikFinityClient {
  return new TikFinityClient(options);
}
declare const __APP_VERSION__: string;

const requireVersion = typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : "unknown";
export default class TikfinityPlugin implements IPlugin {
  metadata = {
    name: "tikfinity",
    version: requireVersion,
    description: "TikFinity Plugin for TikTok",
  };
  defaultConfig: Record<string, boolean | string> = {
    reinitialize: true,
    payload: false
  };
  async onLoad(context: PluginContext) {
    const info = console.log;
    info(LOG_MESSAGES.PLUGIN.LOADING);

    // Set up event handler
    eventHandler = (payload: unknown) => {
    const emitter = context.getPlugin<EventEmitterPluginType>("event-emitter")
    const { on, emit } = emitter ?? {};
      if (emit && typeof emit === "function") {
        emit(PLATFORMS.TIKTOK, payload);
      } else {
        info(`[${PLATFORMS.TIKTOK}]`, payload);
      }
    };

    client.on(TIKFINITY_EVENTS.EVENT, eventHandler);
    client.on(TIKFINITY_EVENTS.PAYLOAD, async (payload) => {
      if (!payload) return;
      this.defaultConfig.payload = payload;
    });
    await client.connect();
  }

  async onReload(context: PluginContext) {
    const info = console.log;
    info(LOG_MESSAGES.PLUGIN.RELOADING);

    // Remove old event handler
    if (eventHandler) {
      client.off(TIKFINITY_EVENTS.EVENT, eventHandler);
    }

    // Reset client state (keep webview alive, remove listeners)
    client.reset();

    // Re-setup event handler
    eventHandler = (payload: unknown) => {
    const emitter = context.getPlugin<EventEmitterPluginType>("event-emitter")
    //if (!emitter) return;
    const { on, emit } = emitter ?? {};
      if (emit && typeof emit === "function") {
        emit(PLATFORMS.TIKTOK, payload);
      } else {
        console.log(`[${PLATFORMS.TIKTOK}]`, payload);
      }
    };

    client.on(TIKFINITY_EVENTS.EVENT, eventHandler);

    // Reinitialize (reconnect WebSocket or start fresh)
    if (this.defaultConfig.reinitialize && this.defaultConfig.payload) {
      await client.reinitialize();
    }
  }

  async onUnload() {
    console.log(LOG_MESSAGES.WEBVIEW.ON_UNLOAD);

    // Clean up event handler first (synchronous, fast)
    if (eventHandler) {
      client.off(TIKFINITY_EVENTS.EVENT, eventHandler);
      eventHandler = null;
    }

    // Clean up client - this will kill the webview process
    client.clean();

    // Small delay to ensure process termination
    await new Promise(resolve => setTimeout(resolve, 200));
  }
}

function isMainModule(): boolean {
  // Bun and Deno support import.meta.main
  try {
    // @ts-ignore - import.meta.main is not in standard TypeScript types
    if (typeof import.meta.main === 'boolean') return import.meta.main;
  } catch {}
  // Node.js fallback
  if (typeof process !== 'undefined' && process.argv[1]) {
    try {
      return process.argv[1] === new URL(import.meta.url).pathname;
    } catch {}
  }
  return false;
}

if (isMainModule()) {
  // Create client with custom options
  const defaultTimes = {
    reconnect: 30000,
    disconnect: 10000,
  }
  const customClient = new TikFinityClient({
    autoReconnect: true,
    maxReconnectAttempts: 5,
    reconnectDelay: defaultTimes.reconnect,
    debug: true,
    logger: (msg: string, ...args: any[]) => console.log(`[Custom]`, msg, ...args),
  });

  customClient.on(TIKFINITY_EVENTS.EVENT, (payload: unknown) => {
    const p = payload as { eventName?: string; data?: { comment?: string } };
    if (p?.eventName === TIKFINITY_EVENTS.CHAT && p?.data?.comment) {
      console.log(p.data.comment);
    }
    console.log(`[${PLATFORMS.TIKTOK} Event]:`, p?.eventName);
  });

  // Test methods on initialization
  console.log('Connecting with custom options...');
  await customClient.connect().catch(console.error);

  // Test disconnect/reconnect cycle after 25 seconds
  await new Promise(resolver => setTimeout(resolver, defaultTimes.reconnect));
  console.log('Disconnecting...');
  customClient.disconnect();

  // Wait 5 seconds then reconnect (uses existing payload + webview)
/*   await new Promise(resolver => setTimeout(resolver, 5000));
  console.log('Reconnecting with existing payload...');
  customClient.reconnect(); */
  // using args is better for debugging
  await new Promise(resolver => setTimeout(resolver, 15000));
  console.log('Cleaning up...');
  customClient.clean();
}
