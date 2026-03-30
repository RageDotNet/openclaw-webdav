import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  PreconditionError,
  checkPreconditions,
  parseIfHeader,
} from "../../src/core/protocol/preconditions.js";
import { InMemoryLockManager } from "../../src/core/locks/lockManager.js";
import { createMockRequest } from "../helpers/httpHarness.js";

describe("parseIfHeader", () => {
  it("parses single untagged state token", () => {
    const tokens = parseIfHeader("(<opaquelocktoken:12345678-1234-1234-1234-123456789abc>)");
    expect(tokens).toEqual(["opaquelocktoken:12345678-1234-1234-1234-123456789abc"]);
  });

  it("parses multiple tokens", () => {
    const tokens = parseIfHeader(
      "(<opaquelocktoken:aaa>) (<opaquelocktoken:bbb>)",
    );
    expect(tokens).toHaveLength(2);
    expect(tokens[0]).toBe("opaquelocktoken:aaa");
    expect(tokens[1]).toBe("opaquelocktoken:bbb");
  });

  it("returns empty array for empty string", () => {
    expect(parseIfHeader("")).toEqual([]);
  });

  it("returns empty array for non-token If: header", () => {
    expect(parseIfHeader("(not-a-token)")).toEqual([]);
  });
});

describe("checkPreconditions", () => {
  let manager: InMemoryLockManager;

  beforeEach(() => {
    manager = new InMemoryLockManager();
  });

  afterEach(() => {
    manager.destroy();
  });

  it("allows operation when resource is not locked", async () => {
    const req = createMockRequest("PUT", "/file.txt");
    await expect(checkPreconditions(req, "/workspace/file.txt", manager)).resolves.toBeUndefined();
  });

  it("throws PreconditionError(423) when locked and no If: header", async () => {
    await manager.lock("/workspace/file.txt", "<owner/>", "exclusive", "0", 3600);
    const req = createMockRequest("PUT", "/file.txt");
    await expect(checkPreconditions(req, "/workspace/file.txt", manager)).rejects.toThrow(
      PreconditionError,
    );
    await expect(checkPreconditions(req, "/workspace/file.txt", manager)).rejects.toMatchObject({
      code: 423,
    });
  });

  it("throws PreconditionError(412) when If: header has wrong token", async () => {
    await manager.lock("/workspace/file.txt", "<owner/>", "exclusive", "0", 3600);
    const req = createMockRequest("PUT", "/file.txt", {
      if: "(<opaquelocktoken:00000000-0000-0000-0000-000000000000>)",
    });
    await expect(checkPreconditions(req, "/workspace/file.txt", manager)).rejects.toMatchObject({
      code: 412,
    });
  });

  it("allows operation when If: header has valid token", async () => {
    const lock = await manager.lock("/workspace/file.txt", "<owner/>", "exclusive", "0", 3600);
    const req = createMockRequest("PUT", "/file.txt", {
      if: `(<${lock.token}>)`,
    });
    await expect(checkPreconditions(req, "/workspace/file.txt", manager)).resolves.toBeUndefined();
  });

  it("allows operation when If: header has one valid token among multiple", async () => {
    const lock = await manager.lock("/workspace/file.txt", "<owner/>", "exclusive", "0", 3600);
    const req = createMockRequest("PUT", "/file.txt", {
      if: `(<opaquelocktoken:wrong>) (<${lock.token}>)`,
    });
    await expect(checkPreconditions(req, "/workspace/file.txt", manager)).resolves.toBeUndefined();
  });

  it("throws PreconditionError(423) when If: header has no valid lock tokens and resource is locked", async () => {
    await manager.lock("/workspace/file.txt", "<owner/>", "exclusive", "0", 3600);
    const req = createMockRequest("PUT", "/file.txt", { if: "(not-a-token)" });
    await expect(checkPreconditions(req, "/workspace/file.txt", manager)).rejects.toMatchObject({
      code: 423,
    });
  });
});
