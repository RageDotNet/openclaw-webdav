import { describe, it, expect, vi, beforeEach } from "vitest";
import { registerWebDavRoutes, stripHttpMountPath } from "../../src/adapter/routes.js";
import type { PluginApi, WebDavRouteContext } from "../../src/adapter/routes.js";
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
    logger: { error: vi.fn(), info: vi.fn() },
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
  let bodyEmitted = false;
  const req: MockReq = {
    method,
    url,
    headers,
    on(event, listener) {
      listeners[event] = listeners[event] ?? [];
      listeners[event].push(listener);
      // Defer until after readBody() registers both listeners — the handler may await
      // work (e.g. dynamic import) before calling readBody, so setImmediate at creation
      // can miss the "end" event.
      queueMicrotask(() => {
        if (bodyEmitted || !listeners["end"]?.length) return;
        bodyEmitted = true;
        if (bodyBuf.length > 0) listeners["data"]?.forEach((l) => l(bodyBuf));
        listeners["end"]!.forEach((l) => l());
      });
      return req;
    },
  };

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

const TEST_GATEWAY_TOKEN = "test-gateway-token-xyz";

function testRouteContext(params?: { mode?: "token" | "password" | "none" }): WebDavRouteContext {
  const mode = params?.mode ?? "token";
  if (mode === "none") {
    return {
      loadOpenClawConfig: () => ({ gateway: { auth: { mode: "none" } } }),
    };
  }
  if (mode === "password") {
    return {
      loadOpenClawConfig: () => ({
        gateway: { auth: { mode: "password", password: TEST_GATEWAY_TOKEN } },
      }),
    };
  }
  return {
    loadOpenClawConfig: () => ({
      gateway: { auth: { mode: "token", token: TEST_GATEWAY_TOKEN } },
    }),
  };
}

function basicAuth(password: string, username = "any-user"): Record<string, string> {
  const b64 = Buffer.from(`${username}:${password}`, "utf8").toString("base64");
  return { authorization: `Basic ${b64}` };
}

const DEFAULT_CONFIG: WebDavConfig = {
  rootPath: "/workspace",
  httpMountPath: "/webdav",
  readOnly: false,
  maxUploadSizeMb: 100,
  rateLimitPerIp: { enabled: true, max: 100, windowSeconds: 10 },
};

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("stripHttpMountPath", () => {
  it("maps mount root to /", () => {
    expect(stripHttpMountPath("/webdav", "/webdav")).toBe("/");
  });

  it("strips prefix leaving workspace-relative path", () => {
    expect(stripHttpMountPath("/webdav/openclaw.json", "/webdav")).toBe("/openclaw.json");
  });
});

describe("registerWebDavRoutes", () => {
  let storage: MemoryStorageAdapter;
  let lockManager: InMemoryLockManager;

  beforeEach(async () => {
    storage = new MemoryStorageAdapter();
    lockManager = new InMemoryLockManager();
    // MemoryStorageAdapter requires parent directories to exist
    await storage.mkdir("/workspace");
  });

  it("calls api.registerHttpRoute with /webdav path, prefix match, plugin HTTP auth, replaceExisting", () => {
    const { api } = createMockApi();
    registerWebDavRoutes(api, DEFAULT_CONFIG, storage, lockManager, testRouteContext());

    expect(api.registerHttpRoute).toHaveBeenCalledOnce();
    const call = (api.registerHttpRoute as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(call.path).toBe("/webdav");
    expect(call.match).toBe("prefix");
    expect(call.auth).toBe("plugin");
    expect(call.replaceExisting).toBe(true);
    expect(typeof call.handler).toBe("function");
  });

  it("uses custom httpMountPath for registration and path stripping", async () => {
    await storage.writeFile("/workspace/custom.txt", Buffer.from("c"));

    const { api, getHandler } = createMockApi();
    const cfg = { ...DEFAULT_CONFIG, httpMountPath: "/plugin/wd" };
    registerWebDavRoutes(api, cfg, storage, lockManager, testRouteContext());

    const reg = (api.registerHttpRoute as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(reg.path).toBe("/plugin/wd");

    const req = createMockReq("GET", "/plugin/wd/custom.txt", basicAuth(TEST_GATEWAY_TOKEN));
    const res = createMockRes();
    await getHandler()(req, res);

    expect(res.statusCode).toBe(200);
  });

  it("returns 401 without credentials when gateway uses a shared secret", async () => {
    const { api, getHandler } = createMockApi();
    registerWebDavRoutes(api, DEFAULT_CONFIG, storage, lockManager, testRouteContext());

    const req = createMockReq("GET", "/file.txt");
    const res = createMockRes();
    await getHandler()(req, res);

    expect(res.statusCode).toBe(401);
    const wwwAuth = Object.entries(res.headers).find(
      ([k]) => k.toLowerCase() === "www-authenticate",
    )?.[1];
    expect(String(wwwAuth ?? "")).toContain("Basic");
  });

  it("accepts Basic auth with arbitrary username and gateway token as password", async () => {
    await storage.writeFile("/workspace/secret.txt", Buffer.from("x"));

    const { api, getHandler } = createMockApi();
    registerWebDavRoutes(api, DEFAULT_CONFIG, storage, lockManager, testRouteContext());

    const req = createMockReq("GET", "/secret.txt", basicAuth(TEST_GATEWAY_TOKEN, "ignored-login"));
    const res = createMockRes();
    await getHandler()(req, res);

    expect(res.statusCode).toBe(200);
  });

  it("accepts Bearer with gateway token", async () => {
    await storage.writeFile("/workspace/bearer.txt", Buffer.from("y"));

    const { api, getHandler } = createMockApi();
    registerWebDavRoutes(api, DEFAULT_CONFIG, storage, lockManager, testRouteContext());

    const req = createMockReq("GET", "/bearer.txt", {
      authorization: `Bearer ${TEST_GATEWAY_TOKEN}`,
    });
    const res = createMockRes();
    await getHandler()(req, res);

    expect(res.statusCode).toBe(200);
  });

  it("allows unauthenticated requests when gateway auth mode is none", async () => {
    await storage.writeFile("/workspace/open.txt", Buffer.from("z"));

    const { api, getHandler } = createMockApi();
    registerWebDavRoutes(api, DEFAULT_CONFIG, storage, lockManager, testRouteContext({ mode: "none" }));

    const req = createMockReq("GET", "/open.txt");
    const res = createMockRes();
    await getHandler()(req, res);

    expect(res.statusCode).toBe(200);
  });

  it("handles OPTIONS request", async () => {
    const { api, getHandler } = createMockApi();
    registerWebDavRoutes(api, DEFAULT_CONFIG, storage, lockManager, testRouteContext());

    const req = createMockReq("OPTIONS", "/webdav/");
    const res = createMockRes();
    await getHandler()(req, res);

    expect(res.statusCode).toBe(200);
    expect(res.headers["dav"] ?? res.headers["DAV"]).toMatch(/1.*2/);
  });

  it("handles GET request for existing file", async () => {
    await storage.writeFile("/workspace/test.txt", Buffer.from("hello"));

    const { api, getHandler } = createMockApi();
    registerWebDavRoutes(api, DEFAULT_CONFIG, storage, lockManager, testRouteContext());

    const req = createMockReq("GET", "/test.txt", basicAuth(TEST_GATEWAY_TOKEN));
    const res = createMockRes();
    await getHandler()(req, res);

    expect(res.statusCode).toBe(200);
  });

  it("returns 405 for unknown methods", async () => {
    const { api, getHandler } = createMockApi();
    registerWebDavRoutes(api, DEFAULT_CONFIG, storage, lockManager, testRouteContext());

    const req = createMockReq("PATCH", "/webdav/file.txt", basicAuth(TEST_GATEWAY_TOKEN));
    const res = createMockRes();
    await getHandler()(req, res);

    expect(res.statusCode).toBe(405);
  });

  describe("readOnly mode", () => {
    const readOnlyConfig: WebDavConfig = { ...DEFAULT_CONFIG, readOnly: true };

    it("blocks PUT with 405", async () => {
      const { api, getHandler } = createMockApi();
      registerWebDavRoutes(api, readOnlyConfig, storage, lockManager, testRouteContext());

      const req = createMockReq("PUT", "/webdav/file.txt", basicAuth(TEST_GATEWAY_TOKEN), "content");
      const res = createMockRes();
      await getHandler()(req, res);

      expect(res.statusCode).toBe(405);
    });

    it("blocks DELETE with 405", async () => {
      const { api, getHandler } = createMockApi();
      registerWebDavRoutes(api, readOnlyConfig, storage, lockManager, testRouteContext());

      const req = createMockReq("DELETE", "/webdav/file.txt", basicAuth(TEST_GATEWAY_TOKEN));
      const res = createMockRes();
      await getHandler()(req, res);

      expect(res.statusCode).toBe(405);
    });

    it("blocks MKCOL with 405", async () => {
      const { api, getHandler } = createMockApi();
      registerWebDavRoutes(api, readOnlyConfig, storage, lockManager, testRouteContext());

      const req = createMockReq("MKCOL", "/webdav/newdir/", basicAuth(TEST_GATEWAY_TOKEN));
      const res = createMockRes();
      await getHandler()(req, res);

      expect(res.statusCode).toBe(405);
    });

    it("blocks LOCK with 405", async () => {
      const { api, getHandler } = createMockApi();
      registerWebDavRoutes(api, readOnlyConfig, storage, lockManager, testRouteContext());

      const req = createMockReq("LOCK", "/webdav/file.txt", basicAuth(TEST_GATEWAY_TOKEN));
      const res = createMockRes();
      await getHandler()(req, res);

      expect(res.statusCode).toBe(405);
    });

    it("allows GET in readOnly mode", async () => {
      await storage.writeFile("/workspace/file.txt", Buffer.from("hello"));

      const { api, getHandler } = createMockApi();
      registerWebDavRoutes(api, readOnlyConfig, storage, lockManager, testRouteContext());

      const req = createMockReq("GET", "/file.txt", basicAuth(TEST_GATEWAY_TOKEN));
      const res = createMockRes();
      await getHandler()(req, res);

      expect(res.statusCode).toBe(200);
    });

    it("allows OPTIONS in readOnly mode", async () => {
      const { api, getHandler } = createMockApi();
      registerWebDavRoutes(api, readOnlyConfig, storage, lockManager, testRouteContext());

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
      registerWebDavRoutes(api, smallConfig, storage, lockManager, testRouteContext());

      const req = createMockReq("PUT", "/file.txt", {
        ...basicAuth(TEST_GATEWAY_TOKEN),
        "content-length": String(2 * 1024 * 1024), // 2MB
      });
      const res = createMockRes();
      await getHandler()(req, res);

      expect(res.statusCode).toBe(413);
    });

    it("allows PUT within size limit", async () => {
      const { api, getHandler } = createMockApi();
      registerWebDavRoutes(api, DEFAULT_CONFIG, storage, lockManager, testRouteContext());

      const req = createMockReq(
        "PUT",
        "/file.txt",
        {
          ...basicAuth(TEST_GATEWAY_TOKEN),
          "content-length": "100",
        },
        "hello",
      );
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

    registerWebDavRoutes(api, DEFAULT_CONFIG, brokenStorage, lockManager, testRouteContext());

    const req = createMockReq("GET", "/file.txt", basicAuth(TEST_GATEWAY_TOKEN));
    const res = createMockRes();
    await getHandler()(req, res);

    expect(res.statusCode).toBe(500);
    expect(api.logger.error).toHaveBeenCalled();
  });
});
