export interface PluginContext {
  emit: (platform: string, payload: unknown) => void;
  log: {
    info: (message: string) => void;
    error: (message: string) => void;
    warn: (message: string) => void;
    debug?: (message: string) => void;
  };
  storage: {
    get: (key: string) => Promise<unknown>;
    set: (key: string, value: unknown) => Promise<void>;
    delete?: (key: string) => Promise<void>;
    clear?: () => Promise<void>;
  };
}

export interface IPlugin {
  name: string;
  version: string;
  description?: string;
  defaultConfig?: Record<string, unknown>;
  onLoad?: (context: PluginContext) => Promise<void> | void;
  onReload?: (context: PluginContext) => Promise<void> | void;
  onUnload?: () => Promise<void> | void;
}
