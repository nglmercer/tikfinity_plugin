import { definePlugin, type PluginContext } from "bun_plugins";
import {
  LOG_MESSAGES,
  PLATFORMS,
  TIKFINITY_EVENTS,
  type TikFinityOptions,
} from "../src/constants";
import { TikFinityClient } from "./client";

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

export default definePlugin({
  name: "tikfinity",
  version: "1.0.0",
  onLoad: async (context: PluginContext) => {
    const { emit, log } = context;
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
    await client.connect();
  },
  onReload: async (context: PluginContext) => {
    const { log, emit } = context;
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
    await client.reinitialize();
  },
  onUnload: () => {
    console.log(LOG_MESSAGES.WEBVIEW.ON_UNLOAD);
    if (eventHandler) {
      client.off(TIKFINITY_EVENTS.EVENT, eventHandler);
      eventHandler = null;
    }
    client.clean();
  },
});

if (import.meta.main) {
  // Create client with custom options
  const customClient = new TikFinityClient({
    autoReconnect: true,
    maxReconnectAttempts: 5,
    reconnectDelay: 2000,
    debug: true,
    logger: (msg, ...args) => console.log(`[Custom]`, msg, ...args),
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
  await new Promise(resolver => setTimeout(resolver, 25000));
  console.log('Disconnecting...');
  customClient.disconnect();
  
  // Wait 5 seconds then reconnect (uses existing payload + webview)
  await new Promise(resolver => setTimeout(resolver, 5000));
  console.log('Reconnecting with existing payload...');
  customClient.reconnect();
}