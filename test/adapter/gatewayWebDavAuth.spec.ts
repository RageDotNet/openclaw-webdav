import { describe, expect, it } from "vitest";
import {
  extractClientGatewayCredential,
  safeEqualSecret,
  syncResolveWebDavAuthExpectation,
} from "../../src/adapter/gatewayWebDavAuth.js";

describe("gatewayWebDavAuth", () => {
  describe("extractClientGatewayCredential", () => {
    it("reads Bearer token", () => {
      expect(extractClientGatewayCredential("Bearer abc123")).toBe("abc123");
    });

    it("reads Basic password and ignores username", () => {
      const b64 = Buffer.from("anyone:secret-pass", "utf8").toString("base64");
      expect(extractClientGatewayCredential(`Basic ${b64}`)).toBe("secret-pass");
    });

    it("supports password containing colons", () => {
      const b64 = Buffer.from("u:pa:ss:word", "utf8").toString("base64");
      expect(extractClientGatewayCredential(`Basic ${b64}`)).toBe("pa:ss:word");
    });
  });

  describe("safeEqualSecret", () => {
    it("matches equal strings", () => {
      expect(safeEqualSecret("a", "a")).toBe(true);
    });

    it("rejects unequal strings", () => {
      expect(safeEqualSecret("a", "b")).toBe(false);
    });
  });

  describe("syncResolveWebDavAuthExpectation", () => {
    it("returns secret for token mode with inline token", () => {
      const r = syncResolveWebDavAuthExpectation({
        gateway: { auth: { mode: "token", token: "t1" } },
      });
      expect(r).toEqual({ kind: "secret", value: "t1" });
    });

    it("returns open for mode none", () => {
      const r = syncResolveWebDavAuthExpectation({
        gateway: { auth: { mode: "none" } },
      });
      expect(r).toEqual({ kind: "open" });
    });
  });
});
