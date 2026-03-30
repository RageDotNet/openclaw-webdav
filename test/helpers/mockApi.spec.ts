import * as os from "node:os";
import * as path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { createMockApi } from "./mockApi.js";

describe("createMockApi", () => {
  it("returns an api object with expected shape", () => {
    const api = createMockApi();
    expect(api.id).toBe("openclaw-webdav");
    expect(api.name).toBe("OpenClaw WebDAV");
    expect(api.pluginConfig).toEqual({});
    expect(api.runtime.workspaceDir).toBe(path.join(os.tmpdir(), "webdav-claw-test"));
    expect(typeof api.logger.debug).toBe("function");
    expect(typeof api.logger.info).toBe("function");
    expect(typeof api.logger.warn).toBe("function");
    expect(typeof api.logger.error).toBe("function");
    expect(typeof api.registerHttpRoute).toBe("function");
    expect(typeof api.resolvePath).toBe("function");
  });

  it("resolvePath returns the path unchanged by default", () => {
    const api = createMockApi();
    expect(api.resolvePath("/some/path")).toBe("/some/path");
  });

  it("logger methods are vi.fn() spies", () => {
    const api = createMockApi();
    api.logger.info("hello");
    expect(api.logger.info).toHaveBeenCalledWith("hello");
  });

  it("registerHttpRoute is a vi.fn() spy", () => {
    const api = createMockApi();
    api.registerHttpRoute({ path: "/webdav/*", handler: vi.fn() });
    expect(api.registerHttpRoute).toHaveBeenCalledTimes(1);
  });

  it("accepts pluginConfig overrides", () => {
    const api = createMockApi({ pluginConfig: { readOnly: true, maxUploadSizeMb: 50 } });
    expect(api.pluginConfig.readOnly).toBe(true);
    expect(api.pluginConfig.maxUploadSizeMb).toBe(50);
  });

  it("accepts workspaceDir override", () => {
    const api = createMockApi({ runtime: { workspaceDir: "/custom/workspace" } });
    expect(api.runtime.workspaceDir).toBe("/custom/workspace");
  });

  it("accepts custom resolvePath override", () => {
    const customResolve = (p: string) => `/resolved${p}`;
    const api = createMockApi({ resolvePath: customResolve });
    expect(api.resolvePath("/foo")).toBe("/resolved/foo");
  });

  it("accepts custom registerHttpRoute override", () => {
    const customFn = vi.fn();
    const api = createMockApi({ registerHttpRoute: customFn });
    api.registerHttpRoute({ path: "/test" });
    expect(customFn).toHaveBeenCalledTimes(1);
  });
});
