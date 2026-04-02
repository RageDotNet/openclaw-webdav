import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  InMemoryLockManager,
  LockConflictError,
  LockNotFoundError,
} from "../../src/core/locks/lockManager.js";

describe("InMemoryLockManager", () => {
  let manager: InMemoryLockManager;

  beforeEach(() => {
    manager = new InMemoryLockManager();
  });

  afterEach(() => {
    manager.destroy();
  });

  // ── lock / unlock ──────────────────────────────────────────────────────────

  it("creates a lock with opaquelocktoken UUID format", async () => {
    const lock = await manager.lock("/file.txt", "<owner/>", "exclusive", "0", 3600);
    expect(lock.token).toMatch(/^opaquelocktoken:[0-9a-f-]{36}$/);
  });

  it("lock returns correct ILock shape", async () => {
    const lock = await manager.lock("/file.txt", "<owner/>", "exclusive", "0", 3600);
    expect(lock.path).toBe("/file.txt");
    expect(lock.owner).toBe("<owner/>");
    expect(lock.scope).toBe("exclusive");
    expect(lock.depth).toBe("0");
    expect(lock.expiresAt).toBeInstanceOf(Date);
    expect(lock.expiresAt.getTime()).toBeGreaterThan(Date.now());
  });

  it("unlock removes the lock", async () => {
    const lock = await manager.lock("/file.txt", "<owner/>", "exclusive", "0", 3600);
    await manager.unlock("/file.txt", lock.token);
    expect(await manager.isLocked("/file.txt")).toBe(false);
  });

  it("unlock throws LockNotFoundError for wrong token", async () => {
    await manager.lock("/file.txt", "<owner/>", "exclusive", "0", 3600);
    await expect(manager.unlock("/file.txt", "opaquelocktoken:wrong")).rejects.toThrow(
      LockNotFoundError,
    );
  });

  it("unlock throws LockNotFoundError for wrong path", async () => {
    const lock = await manager.lock("/file.txt", "<owner/>", "exclusive", "0", 3600);
    await expect(manager.unlock("/other.txt", lock.token)).rejects.toThrow(LockNotFoundError);
  });

  // ── isLocked / getLocks ────────────────────────────────────────────────────

  it("isLocked returns false for unlocked path", async () => {
    expect(await manager.isLocked("/file.txt")).toBe(false);
  });

  it("isLocked returns true for locked path", async () => {
    await manager.lock("/file.txt", "<owner/>", "exclusive", "0", 3600);
    expect(await manager.isLocked("/file.txt")).toBe(true);
  });

  it("getLocks returns empty array for unlocked path", async () => {
    expect(await manager.getLocks("/file.txt")).toEqual([]);
  });

  it("getLocks returns active locks for path", async () => {
    const lock = await manager.lock("/file.txt", "<owner/>", "exclusive", "0", 3600);
    const locks = await manager.getLocks("/file.txt");
    expect(locks).toHaveLength(1);
    expect(locks[0].token).toBe(lock.token);
  });

  it("depth:infinity lock covers child paths", async () => {
    await manager.lock("/docs", "<owner/>", "exclusive", "infinity", 3600);
    expect(await manager.isLocked("/docs/file.txt")).toBe(true);
    expect(await manager.isLocked("/docs/sub/deep.txt")).toBe(true);
  });

  it("depth:0 lock does NOT cover child paths", async () => {
    await manager.lock("/docs", "<owner/>", "exclusive", "0", 3600);
    expect(await manager.isLocked("/docs/file.txt")).toBe(false);
  });

  // ── expiration ─────────────────────────────────────────────────────────────

  it("expired lock is not returned by getLocks", async () => {
    vi.useFakeTimers();
    await manager.lock("/file.txt", "<owner/>", "exclusive", "0", 1); // 1 second
    expect(await manager.isLocked("/file.txt")).toBe(true);

    vi.advanceTimersByTime(2000); // advance 2 seconds
    expect(await manager.isLocked("/file.txt")).toBe(false);
    vi.useRealTimers();
  });

  it("unlock throws for expired lock", async () => {
    vi.useFakeTimers();
    const lock = await manager.lock("/file.txt", "<owner/>", "exclusive", "0", 1);
    vi.advanceTimersByTime(2000);
    await expect(manager.unlock("/file.txt", lock.token)).rejects.toThrow(LockNotFoundError);
    vi.useRealTimers();
  });

  // ── exclusive vs shared conflict ───────────────────────────────────────────

  it("throws LockConflictError when adding exclusive lock to already-locked path", async () => {
    await manager.lock("/file.txt", "<owner1/>", "exclusive", "0", 3600);
    await expect(
      manager.lock("/file.txt", "<owner2/>", "exclusive", "0", 3600),
    ).rejects.toThrow(LockConflictError);
  });

  it("throws LockConflictError when adding shared lock to exclusively-locked path", async () => {
    await manager.lock("/file.txt", "<owner1/>", "exclusive", "0", 3600);
    await expect(
      manager.lock("/file.txt", "<owner2/>", "shared", "0", 3600),
    ).rejects.toThrow(LockConflictError);
  });

  it("throws LockConflictError when adding exclusive lock to shared-locked path", async () => {
    await manager.lock("/file.txt", "<owner1/>", "shared", "0", 3600);
    await expect(
      manager.lock("/file.txt", "<owner2/>", "exclusive", "0", 3600),
    ).rejects.toThrow(LockConflictError);
  });

  it("allows multiple shared locks on the same path", async () => {
    const lock1 = await manager.lock("/file.txt", "<owner1/>", "shared", "0", 3600);
    const lock2 = await manager.lock("/file.txt", "<owner2/>", "shared", "0", 3600);
    expect(lock1.token).not.toBe(lock2.token);
    const locks = await manager.getLocks("/file.txt");
    expect(locks).toHaveLength(2);
  });

  // ── refresh ────────────────────────────────────────────────────────────────

  it("refresh extends lock expiration", async () => {
    const lock = await manager.lock("/file.txt", "<owner/>", "exclusive", "0", 60);
    const originalExpiry = lock.expiresAt.getTime();
    await manager.refresh(lock.token, 3600);
    const updated = manager.getLockByToken(lock.token);
    expect(updated!.expiresAt.getTime()).toBeGreaterThan(originalExpiry);
  });

  it("refresh throws LockNotFoundError for unknown token", async () => {
    await expect(manager.refresh("opaquelocktoken:unknown", 3600)).rejects.toThrow(
      LockNotFoundError,
    );
  });

  // ── concurrent locks on different paths ───────────────────────────────────

  it("allows concurrent locks on different paths", async () => {
    const lock1 = await manager.lock("/file1.txt", "<owner/>", "exclusive", "0", 3600);
    const lock2 = await manager.lock("/file2.txt", "<owner/>", "exclusive", "0", 3600);
    expect(lock1.token).not.toBe(lock2.token);
    expect(await manager.isLocked("/file1.txt")).toBe(true);
    expect(await manager.isLocked("/file2.txt")).toBe(true);
  });
});
