/**
 * OpenClaw WebDAV Plugin — entry point.
 *
 * Wires together the config adapter, storage adapter, lock manager,
 * and route registration adapter into a complete OpenClaw plugin.
 */
import { parsePluginConfig, webDavRequestLoggingEnabled } from "./adapter/config.js";
import { registerWebDavRoutes } from "./adapter/routes.js";
import { NodeFsStorageAdapter } from "./core/storage/nodeFsAdapter.js";
import { InMemoryLockManager } from "./core/locks/lockManager.js";

export default {
  id: "openclaw-webdav",
  name: "WebDAV",
  description: "Mount your OpenClaw workspace as a WebDAV drive.",

  register(api: {
    pluginConfig: Record<string, unknown>;
    runtime: {
      state: { resolveStateDir(): string };
      config: { loadConfig(): unknown };
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
      match?: string;
      replaceExisting?: boolean;
      handler: (req: unknown, res: unknown) => Promise<void>;
    }): void;
  }): void {
    const stateDir = api.runtime.state.resolveStateDir();
    const config = parsePluginConfig(api.pluginConfig, stateDir);

    api.logger.info(
      `[webdav] starting — root: ${config.rootPath}, readOnly: ${config.readOnly} (HTTP Basic/Bearer = gateway token or password)`,
    );

    if (webDavRequestLoggingEnabled(config.logging)) {
      api.logger.info(
        "[webdav] Request logging on: set `logging: true` in plugin config and/or DEBUG_WEBDAV=1 on the gateway. One info line per request (method + path) after WebDAV auth.",
      );
    }

    const storage = new NodeFsStorageAdapter();
    const lockManager = new InMemoryLockManager();

    registerWebDavRoutes(api, config, storage, lockManager, {
      loadOpenClawConfig: () => api.runtime.config.loadConfig(),
    });

    api.logger.info(
      `[webdav] registered ${config.httpMountPath} (plugin HTTP route; Basic password or Bearer = gateway secret). ` +
        "If curl -u returns JSON 401, another route may still own this path as gateway auth — set plugins.entries.openclaw-webdav.config.httpMountPath to a free prefix and restart.",
    );
  },
};
