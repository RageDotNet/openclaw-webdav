import * as os from "node:os";
import * as path from "node:path";
import { vi } from "vitest";

export interface MockLogger {
  debug: ReturnType<typeof vi.fn>;
  info: ReturnType<typeof vi.fn>;
  warn: ReturnType<typeof vi.fn>;
  error: ReturnType<typeof vi.fn>;
}

export interface MockPluginConfig {
  rootPath?: string;
  readOnly?: boolean;
  maxUploadSizeMb?: number;
  rateLimitPerIp?: {
    enabled: boolean;
    max: number;
    windowSeconds: number;
  };
  [key: string]: unknown;
}

export interface MockApi {
  id: string;
  name: string;
  pluginConfig: MockPluginConfig;
  runtime: {
    workspaceDir: string;
  };
  logger: MockLogger;
  registerHttpRoute: ReturnType<typeof vi.fn>;
  resolvePath: (p: string) => string;
}

export interface MockApiOverrides {
  id?: string;
  name?: string;
  pluginConfig?: Partial<MockPluginConfig>;
  runtime?: Partial<MockApi["runtime"]>;
  logger?: Partial<MockLogger>;
  registerHttpRoute?: ReturnType<typeof vi.fn>;
  resolvePath?: (p: string) => string;
}

export function createMockApi(overrides: MockApiOverrides = {}): MockApi {
  const defaultWorkspaceDir = path.join(os.tmpdir(), "webdav-claw-test");

  const logger: MockLogger = {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    ...overrides.logger,
  };

  return {
    id: overrides.id ?? "openclaw-webdav",
    name: overrides.name ?? "OpenClaw WebDAV",
    pluginConfig: overrides.pluginConfig ?? {},
    runtime: {
      workspaceDir: defaultWorkspaceDir,
      ...overrides.runtime,
    },
    logger,
    registerHttpRoute: overrides.registerHttpRoute ?? vi.fn(),
    resolvePath: overrides.resolvePath ?? ((p: string) => p),
  };
}
