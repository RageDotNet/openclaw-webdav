/**
 * OpenClaw WebDAV Plugin — entry point.
 *
 * Wires together the config adapter, storage adapter, lock manager,
 * and route registration adapter into a complete OpenClaw plugin.
 */
import { parsePluginConfig } from "./adapter/config.js";
import { registerWebDavRoutes } from "./adapter/routes.js";
import { NodeFsStorageAdapter } from "./core/storage/nodeFsAdapter.js";
import { InMemoryLockManager } from "./core/locks/lockManager.js";

/**
 * Minimal OpenClaw plugin API surface.
 * The real API is provided by the OpenClaw runtime.
 */
export interface OpenClawPluginApi {
  pluginConfig: Record<string, unknown>;
  runtime: {
    workspaceDir: string;
  };
  logger: {
    debug(message: string, ...args: unknown[]): void;
    info(message: string, ...args: unknown[]): void;
    warn(message: string, ...args: unknown[]): void;
    error(message: string, ...args: unknown[]): void;
  };
  registerHttpRoute(opts: {
    path: string;
    auth: string;
    handler: (req: unknown, res: unknown) => Promise<void>;
  }): void;
}

let lockManager: InMemoryLockManager | undefined;

/**
 * Plugin registration function called by the OpenClaw runtime.
 * Parses config, creates storage/lock instances, and registers WebDAV routes.
 */
export function registerFull(api: OpenClawPluginApi): void {
  const config = parsePluginConfig(api.pluginConfig, api.runtime.workspaceDir);

  api.logger.info(`WebDAV plugin starting — root: ${config.rootPath}, readOnly: ${config.readOnly}`);

  const storage = new NodeFsStorageAdapter();

  lockManager = new InMemoryLockManager();

  registerWebDavRoutes(
    api as Parameters<typeof registerWebDavRoutes>[0],
    config,
    storage,
    lockManager,
  );

  api.logger.info("WebDAV plugin registered route: /webdav/*");
}

/**
 * Plugin teardown — called by the OpenClaw runtime on shutdown.
 */
export function unregister(): void {
  lockManager?.destroy();
  lockManager = undefined;
}

/**
 * definePluginEntry — the standard OpenClaw plugin entry point pattern.
 * Returns an object with lifecycle hooks for the runtime to call.
 */
export function definePluginEntry(api: OpenClawPluginApi) {
  return {
    register() {
      registerFull(api);
    },
    unregister() {
      unregister();
    },
  };
}

export default definePluginEntry;
