/**
 * Config adapter — maps api.pluginConfig to typed WebDavConfig.
 * Validates all options on parse and throws descriptive errors for invalid values.
 */

export interface RateLimitConfig {
  enabled: boolean;
  max: number;
  windowSeconds: number;
}

export interface WebDavConfig {
  /** Root path for WebDAV storage. Defaults to workspaceDir. */
  rootPath: string;
  /** If true, all write operations return 405. Default: false. */
  readOnly: boolean;
  /** Maximum upload size in megabytes. Default: 100. */
  maxUploadSizeMb: number;
  /** Per-IP rate limiting configuration. */
  rateLimitPerIp: RateLimitConfig;
}

const DEFAULTS: Omit<WebDavConfig, "rootPath"> = {
  readOnly: false,
  maxUploadSizeMb: 100,
  rateLimitPerIp: {
    enabled: true,
    max: 100,
    windowSeconds: 10,
  },
};

/**
 * Parse and validate plugin configuration into a typed WebDavConfig.
 *
 * @param pluginConfig - Raw plugin config from api.pluginConfig
 * @param workspaceDir - Fallback rootPath when not specified in config
 * @throws Error with descriptive message if any value is invalid
 */
export function parsePluginConfig(
  pluginConfig: Record<string, unknown>,
  workspaceDir: string,
): WebDavConfig {
  const rootPath = parseRootPath(pluginConfig, workspaceDir);
  const readOnly = parseReadOnly(pluginConfig);
  const maxUploadSizeMb = parseMaxUploadSizeMb(pluginConfig);
  const rateLimitPerIp = parseRateLimitPerIp(pluginConfig);

  return { rootPath, readOnly, maxUploadSizeMb, rateLimitPerIp };
}

function parseRootPath(config: Record<string, unknown>, workspaceDir: string): string {
  const val = config["rootPath"];
  if (val === undefined || val === null || val === "") {
    return workspaceDir;
  }
  if (typeof val !== "string") {
    throw new Error(`WebDAV config error: rootPath must be a string, got ${typeof val}`);
  }
  if (val.trim() === "") {
    return workspaceDir;
  }
  return val;
}

function parseReadOnly(config: Record<string, unknown>): boolean {
  const val = config["readOnly"];
  if (val === undefined || val === null) {
    return DEFAULTS.readOnly;
  }
  if (typeof val !== "boolean") {
    throw new Error(`WebDAV config error: readOnly must be a boolean, got ${typeof val}`);
  }
  return val;
}

function parseMaxUploadSizeMb(config: Record<string, unknown>): number {
  const val = config["maxUploadSizeMb"];
  if (val === undefined || val === null) {
    return DEFAULTS.maxUploadSizeMb;
  }
  if (typeof val !== "number" || !Number.isFinite(val)) {
    throw new Error(`WebDAV config error: maxUploadSizeMb must be a number, got ${typeof val}`);
  }
  if (val <= 0) {
    throw new Error(`WebDAV config error: maxUploadSizeMb must be positive, got ${val}`);
  }
  return val;
}

function parseRateLimitPerIp(config: Record<string, unknown>): RateLimitConfig {
  const val = config["rateLimitPerIp"];
  if (val === undefined || val === null) {
    return { ...DEFAULTS.rateLimitPerIp };
  }
  if (typeof val !== "object" || Array.isArray(val)) {
    throw new Error(
      `WebDAV config error: rateLimitPerIp must be an object, got ${Array.isArray(val) ? "array" : typeof val}`,
    );
  }

  const obj = val as Record<string, unknown>;

  const enabled = obj["enabled"];
  if (enabled !== undefined && typeof enabled !== "boolean") {
    throw new Error(
      `WebDAV config error: rateLimitPerIp.enabled must be a boolean, got ${typeof enabled}`,
    );
  }

  const max = obj["max"];
  if (max !== undefined) {
    if (typeof max !== "number" || !Number.isFinite(max)) {
      throw new Error(
        `WebDAV config error: rateLimitPerIp.max must be a number, got ${typeof max}`,
      );
    }
    if ((max as number) <= 0) {
      throw new Error(`WebDAV config error: rateLimitPerIp.max must be positive, got ${max}`);
    }
  }

  const windowSeconds = obj["windowSeconds"];
  if (windowSeconds !== undefined) {
    if (typeof windowSeconds !== "number" || !Number.isFinite(windowSeconds)) {
      throw new Error(
        `WebDAV config error: rateLimitPerIp.windowSeconds must be a number, got ${typeof windowSeconds}`,
      );
    }
    if ((windowSeconds as number) <= 0) {
      throw new Error(
        `WebDAV config error: rateLimitPerIp.windowSeconds must be positive, got ${windowSeconds}`,
      );
    }
  }

  return {
    enabled: (enabled as boolean) ?? DEFAULTS.rateLimitPerIp.enabled,
    max: (max as number) ?? DEFAULTS.rateLimitPerIp.max,
    windowSeconds: (windowSeconds as number) ?? DEFAULTS.rateLimitPerIp.windowSeconds,
  };
}
