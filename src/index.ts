import { definePlugin, type PluginContext } from "bun_plugins";
import * as path from "path";
import { parseSocketIo42Message, SocketIoMessage } from "./utils/parsejson";
import { getBaseDir } from "./utils/filepath";
import {
  LOG_MESSAGES,
  TIKTOK_CONSTANTS,
  PATHS,
  PLATFORMS,
} from "../src/constants";
import { TikFinityClient } from "./client";

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
  // setTimeout(() => {
  //   console.log("Cleaning TikFinity...");
  //   client.clean();
  // }, 15000);
}