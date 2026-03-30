import { describe, it, expect, vi, beforeEach } from "vitest";
import { Readable } from "node:stream";
import { registerWebDavRoutes } from "../../src/adapter/routes.js";
import type { PluginApi } from "../../src/adapter/routes.js";
import type { WebDavConfig } from "../../src/adapter/config.js";
import { MemoryStorageAdapter } from "../../src/core/storage/memoryAdapter.js";
import { InMemoryLockManager } from "../../src/core/locks/lockManager.js";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function createMockApi(): { api: PluginApi; getHandler: () => RouteHandler } {
  let registeredHandler: RouteHandler | undefined;

  const api: PluginApi = {
    registerHttpRoute: vi.fn((opts) => {
      registeredHandler = opts.handler;
    }),
    logger: { error: vi.fn() },
  };

  return {
    api,
    getHandler: () => {
      if (!registeredHandler) throw new Error("No handler registered");
      return registeredHandler;
    },
  };
}

type RouteHandler = (req: MockReq, res: MockRes) => Promise<void>;

interface MockReq {
  method?: string;
  url?: string;
  headers: Record<string, string>;
  on(event: string, listener: (...args: unknown[]) => void): MockReq;
}

interface MockRes {
  statusCode: number;
  headers: Record<string, string | string[] | number>;
  body: Buffer;
  writeHead(code: number, headers?: Record<string, string | string[] | number>): void;
  write(chunk: Buffer | string): void;
  end(chunk?: Buffer | string): void;
}

function createMockReq(
  method: string,
  url: string,
  headers: Record<string, string> = {},
  body?: string | Buffer,
): MockReq {
  const bodyBuf =
    body === undefined
      ? Buffer.alloc(0)
      : typeof body === "string"
        ? Buffer.from(body)
        : body;

  const listeners: Record<string, Array<(...args: unknown[]) => void>> = {};
  const req: MockReq = {
    method,
    url,
    headers,
    on(event, listener) {
      listeners[event] = listeners[event] ?? [];
      listeners[event].push(listener);
      return req;
    },
  };

  setImmediate(() => {
    if (bodyBuf.length > 0) listeners["data"]?.forEach((l) => l(bodyBuf));
    listeners["end"]?.forEach((l) => l());
  });

  return req;
}

function createMockRes(): MockRes {
  const chunks: Buffer[] = [];
  const res: MockRes = {
    statusCode: 200,
    headers: {},
    body: Buffer.alloc(0),
    writeHead(code, hdrs) {
      this.statusCode = code;
      if (hdrs) Object.assign(this.headers, hdrs);
    },
    write(chunk) {
      chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
    },
    end(chunk?) {
      if (chunk !== undefined) chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
      this.body = Buffer.concat(chunks);
    },
  };
  return res;
}

const DEFAULT_CONFIG: WebDavConfig = {
  rootPath: "/workspace",
  readOnly: false,
  maxUploadSizeMb: 100,
  rateLimitPerIp: { enabled: true, max: 100, windowSeconds: 10 },
};

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("registerWebDavRoutes", () => {
  let storage: MemoryStorageAdapter;
  let lockManager: InMemoryLockManager;

  beforeEach(async () => {
    storage = new MemoryStorageAdapter();
    lockManager = new InMemoryLockManager();
    // MemoryStorageAdapter requires parent directories to exist
    await storage.mkdir("/workspace");
  });

  it("calls api.registerHttpRoute with /webdav path, prefix match, and gateway auth", () => {
    const { api } = createMockApi();
    registerWebDavRoutes(api, DEFAULT_CONFIG, storage, lockManager);

    expect(api.registerHttpRoute).toHaveBeenCalledOnce();
    const call = (api.registerHttpRoute as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(call.path).toBe("/webdav");
    expect(call.match).toBe("prefix");
    expect(call.auth).toBe("gateway");
    expect(typeof call.handler).toBe("function");
  });

  it("handles OPTIONS request", async () => {
    const { api, getHandler } = createMockApi();
    registerWebDavRoutes(api, DEFAULT_CONFIG, storage, lockManager);

    const req = createMockReq("OPTIONS", "/webdav/");
    const res = createMockRes();
    await getHandler()(req, res);

    expect(res.statusCode).toBe(200);
    expect(res.headers["dav"] ?? res.headers["DAV"]).toMatch(/1.*2/);
  });

  it("handles GET request for existing file", async () => {
    await storage.writeFile("/workspace/test.txt", Buffer.from("hello"));

    const { api, getHandler } = createMockApi();
    registerWebDavRoutes(api, DEFAULT_CONFIG, storage, lockManager);

    const req = createMockReq("GET", "/test.txt");
    const res = createMockRes();
    await getHandler()(req, res);

    expect(res.statusCode).toBe(200);
  });

  it("returns 405 for unknown methods", async () => {
    const { api, getHandler } = createMockApi();
    registerWebDavRoutes(api, DEFAULT_CONFIG, storage, lockManager);

    const req = createMockReq("PATCH", "/webdav/file.txt");
    const res = createMockRes();
    await getHandler()(req, res);

    expect(res.statusCode).toBe(405);
  });

  describe("readOnly mode", () => {
    const readOnlyConfig: WebDavConfig = { ...DEFAULT_CONFIG, readOnly: true };

    it("blocks PUT with 405", async () => {
      const { api, getHandler } = createMockApi();
      registerWebDavRoutes(api, readOnlyConfig, storage, lockManager);

      const req = createMockReq("PUT", "/webdav/file.txt", {}, "content");
      const res = createMockRes();
      await getHandler()(req, res);

      expect(res.statusCode).toBe(405);
    });

    it("blocks DELETE with 405", async () => {
      const { api, getHandler } = createMockApi();
      registerWebDavRoutes(api, readOnlyConfig, storage, lockManager);

      const req = createMockReq("DELETE", "/webdav/file.txt");
      const res = createMockRes();
      await getHandler()(req, res);

      expect(res.statusCode).toBe(405);
    });

    it("blocks MKCOL with 405", async () => {
      const { api, getHandler } = createMockApi();
      registerWebDavRoutes(api, readOnlyConfig, storage, lockManager);

      const req = createMockReq("MKCOL", "/webdav/newdir/");
      const res = createMockRes();
      await getHandler()(req, res);

      expect(res.statusCode).toBe(405);
    });

    it("blocks LOCK with 405", async () => {
      const { api, getHandler } = createMockApi();
      registerWebDavRoutes(api, readOnlyConfig, storage, lockManager);

      const req = createMockReq("LOCK", "/webdav/file.txt");
      const res = createMockRes();
      await getHandler()(req, res);

      expect(res.statusCode).toBe(405);
    });

    it("allows GET in readOnly mode", async () => {
      await storage.writeFile("/workspace/file.txt", Buffer.from("hello"));

      const { api, getHandler } = createMockApi();
      registerWebDavRoutes(api, readOnlyConfig, storage, lockManager);

      const req = createMockReq("GET", "/file.txt");
      const res = createMockRes();
      await getHandler()(req, res);

      expect(res.statusCode).toBe(200);
    });

    it("allows OPTIONS in readOnly mode", async () => {
      const { api, getHandler } = createMockApi();
      registerWebDavRoutes(api, readOnlyConfig, storage, lockManager);

      const req = createMockReq("OPTIONS", "/webdav/");
      const res = createMockRes();
      await getHandler()(req, res);

      expect(res.statusCode).toBe(200);
    });
  });

  describe("upload size limit", () => {
    it("returns 413 when Content-Length exceeds maxUploadSizeMb", async () => {
      const smallConfig: WebDavConfig = { ...DEFAULT_CONFIG, maxUploadSizeMb: 1 };

      const { api, getHandler } = createMockApi();
      registerWebDavRoutes(api, smallConfig, storage, lockManager);

      const req = createMockReq("PUT", "/file.txt", {
        "content-length": String(2 * 1024 * 1024), // 2MB
      });
      const res = createMockRes();
      await getHandler()(req, res);

      expect(res.statusCode).toBe(413);
    });

    it("allows PUT within size limit", async () => {
      const { api, getHandler } = createMockApi();
      registerWebDavRoutes(api, DEFAULT_CONFIG, storage, lockManager);

      const req = createMockReq("PUT", "/file.txt", {
        "content-length": "100",
      }, "hello");
      const res = createMockRes();
      await getHandler()(req, res);

      expect([201, 204]).toContain(res.statusCode);
    });
  });

  it("returns 500 and logs error when handler throws", async () => {
    const { api, getHandler } = createMockApi();

    // Create a broken storage that throws
    const brokenStorage = new MemoryStorageAdapter();
    vi.spyOn(brokenStorage, "stat").mockRejectedValue(new Error("disk failure"));

    registerWebDavRoutes(api, DEFAULT_CONFIG, brokenStorage, lockManager);

    const req = createMockReq("GET", "/file.txt");
    const res = createMockRes();
    await getHandler()(req, res);

    expect(res.statusCode).toBe(500);
    expect(api.logger.error).toHaveBeenCalled();
  });
});
