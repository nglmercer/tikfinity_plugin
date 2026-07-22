interface PluginMetadata {
    name: string;
    version: string;
    dependencies?: string[];
}
declare enum PluginState {
    DISABLED = "disabled",
    ENABLED = "enabled"
}
interface PluginContext {
    getPlugin<T = unknown>(name: string): T | undefined;
    getPlugins(): string[];
    getManager(): PluginManagerLike;
}
interface PluginManagerLike {
    register(plugin: PluginInput, path?: string): void;
    unregister(name: string): void;
    enable(name: string): void;
    disable(name: string): void;
    loadPlugin(plugin: PluginInput, path?: string): void;
    getPlugin<T = unknown>(name: string): T | undefined;
    getPluginRaw<T = unknown>(name: string): T | undefined;
    getPlugins(): string[];
    getEnabledPlugins(): string[];
    getDisabledPlugins(): string[];
    getState(name: string): PluginState | undefined;
    getPath(name: string): string | undefined;
    has(name: string): boolean;
    isInitialized(): boolean;
}
interface IPlugin {
    readonly metadata: PluginMetadata;
    setup?(ctx: PluginContext): void | Promise<void>;
    onLoad?(ctx: PluginContext): void | Promise<void>;
    onEnable?(ctx: PluginContext): void | Promise<void>;
    onDisable?(ctx: PluginContext): void | Promise<void>;
    onUnload?(ctx: PluginContext): void | Promise<void>;
}
type PluginConst = {
    metadata: PluginMetadata;
    setup?: (ctx: PluginContext) => void | Promise<void>;
    onLoad?: (ctx: PluginContext) => void | Promise<void>;
    onEnable?: (ctx: PluginContext) => void | Promise<void>;
    onDisable?: (ctx: PluginContext) => void | Promise<void>;
    onUnload?: (ctx: PluginContext) => void | Promise<void>;
};
type PluginInput = IPlugin | PluginConst | (new () => IPlugin);
type PluginManagerOptions = Record<string, unknown>;
interface PluginManifest$1 {
    plugins: Array<{
        path?: string;
        url?: string;
    }>;
}

declare class PluginManager {
    private plugins;
    private initialized;
    private context;
    constructor(_options?: PluginManagerOptions);
    register(plugin: PluginInput, path?: string): void;
    unregister(name: string): void;
    enable(name: string): void;
    disable(name: string): void;
    loadPlugin(plugin: PluginInput, path?: string): void;
    getPlugin<T = unknown>(name: string): T | undefined;
    getPluginRaw<T = unknown>(name: string): T | undefined;
    init(): Promise<void>;
    shutdown(): Promise<void>;
    getPlugins(): string[];
    getEnabledPlugins(): string[];
    getDisabledPlugins(): string[];
    getState(name: string): PluginState | undefined;
    getPath(name: string): string | undefined;
    has(name: string): boolean;
    isInitialized(): boolean;
    getContext(): PluginContext;
    private getMetadata;
    private normalize;
}

declare class PluginValidationError extends Error {
    constructor(message: string);
}
declare function validatePlugin(plugin: PluginInput): void;

interface PluginManifest {
    plugins: Array<{
        path?: string;
        url?: string;
    }>;
}
declare function loadPluginFromFile(input: string | URL): Promise<PluginInput>;
declare function loadPluginFromUrl(url: string | URL): Promise<PluginInput>;
declare function loadPluginsFromDir(dir: string | URL): Promise<PluginInput[]>;
declare function loadPluginsFromManifest(manifest: PluginManifest, baseDir?: string): Promise<PluginInput[]>;
export interface EventEmitterPluginType {
  metadata: { name: string; version: string };
  on(event: string, handler: (...args: unknown[]) => void): void;
  off(event: string, handler: (...args: unknown[]) => void): void;
  emit(event: string, ...args: unknown[]): void;
  once(event: string, handler: (...args: unknown[]) => void): void;
  listenerCount(event: string): number;
}

export { type IPlugin, type PluginConst, type PluginContext, type PluginInput, PluginManager, type PluginManagerOptions, type PluginManifest$1 as PluginManifest, type PluginMetadata, PluginState, PluginValidationError, loadPluginFromFile, loadPluginFromUrl, loadPluginsFromDir, loadPluginsFromManifest, validatePlugin };
