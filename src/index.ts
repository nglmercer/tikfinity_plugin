import { type IPlugin, type PluginContext } from "bun_plugins";
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

export class TikfinityPlugin implements IPlugin {
  name: string = "tikfinity";
  version: string = "1.0.0";
  description: string = "TikFinity Plugin for TikTok";
  defaultConfig? = {
    reinitialize: true,
    payload: null
  };
  async onLoad(context: PluginContext) {
    const { emit, log,storage } = context;
    log.info(LOG_MESSAGES.PLUGIN.LOADING);
    
    // Set up event handler
    eventHandler = (payload: unknown) => {
      if (emit && typeof emit === "function") {
        emit(PLATFORMS.TIKTOK, payload);
      } else {
        log.info(`[${PLATFORMS.TIKTOK}]`, payload);
      }
    };
    
    client.on(TIKFINITY_EVENTS.EVENT, eventHandler);
    client.on(TIKFINITY_EVENTS.PAYLOAD, async (payload) => {
      await storage.set(TIKFINITY_EVENTS.PAYLOAD, payload);
      if (!this.defaultConfig || !payload) return;
      this.defaultConfig.payload = payload;
    });
    await client.connect();
  }
  
  async onReload(context: PluginContext) {
    const { log, emit,storage } = context;
    log.info(LOG_MESSAGES.PLUGIN.RELOADING);
    
    // Remove old event handler
    if (eventHandler) {
      client.off(TIKFINITY_EVENTS.EVENT, eventHandler);
    }
    
    // Reset client state (keep webview alive, remove listeners)
    client.reset();
    
    // Re-setup event handler
    eventHandler = (payload: unknown) => {
      if (emit && typeof emit === "function") {
        emit(PLATFORMS.TIKTOK, payload);
      } else {
        console.log(`[${PLATFORMS.TIKTOK}]`, payload);
      }
    };
    
    client.on(TIKFINITY_EVENTS.EVENT, eventHandler);
    
    // Reinitialize (reconnect WebSocket or start fresh)
    if (this.defaultConfig?.reinitialize) {
      const payload = await storage.get(TIKFINITY_EVENTS.PAYLOAD);
      if (!payload || payload !== this.defaultConfig.payload) {
        await client.reinitialize();
      }
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

if (import.meta.main) {
  // Create client with custom options
  const customClient = new TikFinityClient({
    autoReconnect: true,
    maxReconnectAttempts: 5,
    reconnectDelay: 2000,
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
  await new Promise(resolver => setTimeout(resolver, 20000));
  console.log('Disconnecting...');
  customClient.disconnect();
  
  // Wait 5 seconds then reconnect (uses existing payload + webview)
/*   await new Promise(resolver => setTimeout(resolver, 5000));
  console.log('Reconnecting with existing payload...');
  customClient.reconnect(); */
  await new Promise(resolver => setTimeout(resolver, 1000));
  console.log('Cleaning up...');
  customClient.clean();
}