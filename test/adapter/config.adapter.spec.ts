import { describe, it, expect } from "vitest";
import { parsePluginConfig } from "../../src/adapter/config.js";

const WORKSPACE = "/home/user/workspace";

describe("parsePluginConfig", () => {
  describe("defaults", () => {
    it("uses workspaceDir as rootPath when not specified", () => {
      const config = parsePluginConfig({}, WORKSPACE);
      expect(config.rootPath).toBe(WORKSPACE);
    });

    it("defaults readOnly to false", () => {
      const config = parsePluginConfig({}, WORKSPACE);
      expect(config.readOnly).toBe(false);
    });

    it("defaults maxUploadSizeMb to 100", () => {
      const config = parsePluginConfig({}, WORKSPACE);
      expect(config.maxUploadSizeMb).toBe(100);
    });

    it("defaults rateLimitPerIp to enabled with max=100, windowSeconds=10", () => {
      const config = parsePluginConfig({}, WORKSPACE);
      expect(config.rateLimitPerIp).toEqual({
        enabled: true,
        max: 100,
        windowSeconds: 10,
      });
    });

    it("defaults httpMountPath to /webdav", () => {
      const config = parsePluginConfig({}, WORKSPACE);
      expect(config.httpMountPath).toBe("/webdav");
    });
  });

  describe("valid values", () => {
    it("accepts custom rootPath", () => {
      const config = parsePluginConfig({ rootPath: "/data/webdav" }, WORKSPACE);
      expect(config.rootPath).toBe("/data/webdav");
    });

    it("accepts readOnly: true", () => {
      const config = parsePluginConfig({ readOnly: true }, WORKSPACE);
      expect(config.readOnly).toBe(true);
    });

    it("accepts custom maxUploadSizeMb", () => {
      const config = parsePluginConfig({ maxUploadSizeMb: 500 }, WORKSPACE);
      expect(config.maxUploadSizeMb).toBe(500);
    });

    it("accepts partial rateLimitPerIp overrides", () => {
      const config = parsePluginConfig(
        { rateLimitPerIp: { enabled: false, max: 50, windowSeconds: 30 } },
        WORKSPACE,
      );
      expect(config.rateLimitPerIp).toEqual({ enabled: false, max: 50, windowSeconds: 30 });
    });

    it("accepts custom httpMountPath and normalizes leading slash", () => {
      expect(parsePluginConfig({ httpMountPath: "plugin/wd" }, WORKSPACE).httpMountPath).toBe(
        "/plugin/wd",
      );
      expect(parsePluginConfig({ httpMountPath: "/openclaw-webdav/" }, WORKSPACE).httpMountPath).toBe(
        "/openclaw-webdav",
      );
    });

    it("accepts rateLimitPerIp with only enabled field", () => {
      const config = parsePluginConfig({ rateLimitPerIp: { enabled: false } }, WORKSPACE);
      expect(config.rateLimitPerIp.enabled).toBe(false);
      expect(config.rateLimitPerIp.max).toBe(100);
      expect(config.rateLimitPerIp.windowSeconds).toBe(10);
    });
  });

  describe("invalid values", () => {
    it("throws for non-string rootPath", () => {
      expect(() => parsePluginConfig({ rootPath: 42 }, WORKSPACE)).toThrow(
        /rootPath must be a string/,
      );
    });

    it("falls back to workspaceDir for whitespace-only rootPath", () => {
      const config = parsePluginConfig({ rootPath: "   " }, WORKSPACE);
      expect(config.rootPath).toBe(WORKSPACE);
    });

    it("throws for non-boolean readOnly", () => {
      expect(() => parsePluginConfig({ readOnly: "yes" }, WORKSPACE)).toThrow(
        /readOnly must be a boolean/,
      );
    });

    it("throws for non-number maxUploadSizeMb", () => {
      expect(() => parsePluginConfig({ maxUploadSizeMb: "100" }, WORKSPACE)).toThrow(
        /maxUploadSizeMb must be a number/,
      );
    });

    it("throws for zero maxUploadSizeMb", () => {
      expect(() => parsePluginConfig({ maxUploadSizeMb: 0 }, WORKSPACE)).toThrow(
        /maxUploadSizeMb must be positive/,
      );
    });

    it("throws for negative maxUploadSizeMb", () => {
      expect(() => parsePluginConfig({ maxUploadSizeMb: -10 }, WORKSPACE)).toThrow(
        /maxUploadSizeMb must be positive/,
      );
    });

    it("throws for non-object rateLimitPerIp", () => {
      expect(() => parsePluginConfig({ rateLimitPerIp: "enabled" }, WORKSPACE)).toThrow(
        /rateLimitPerIp must be an object/,
      );
    });

    it("throws for array rateLimitPerIp", () => {
      expect(() => parsePluginConfig({ rateLimitPerIp: [] }, WORKSPACE)).toThrow(
        /rateLimitPerIp must be an object/,
      );
    });

    it("throws for non-boolean rateLimitPerIp.enabled", () => {
      expect(() =>
        parsePluginConfig({ rateLimitPerIp: { enabled: 1 } }, WORKSPACE),
      ).toThrow(/rateLimitPerIp.enabled must be a boolean/);
    });

    it("throws for non-positive rateLimitPerIp.max", () => {
      expect(() =>
        parsePluginConfig({ rateLimitPerIp: { max: -5 } }, WORKSPACE),
      ).toThrow(/rateLimitPerIp.max must be positive/);
    });

    it("throws for non-positive rateLimitPerIp.windowSeconds", () => {
      expect(() =>
        parsePluginConfig({ rateLimitPerIp: { windowSeconds: 0 } }, WORKSPACE),
      ).toThrow(/rateLimitPerIp.windowSeconds must be positive/);
    });

    it("throws for httpMountPath /", () => {
      expect(() => parsePluginConfig({ httpMountPath: "/" }, WORKSPACE)).toThrow(
        /httpMountPath cannot be/,
      );
    });

    it("throws for non-string httpMountPath", () => {
      expect(() => parsePluginConfig({ httpMountPath: 99 }, WORKSPACE)).toThrow(
        /httpMountPath must be a string/,
      );
    });
  });
});
