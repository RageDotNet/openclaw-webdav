import * as crypto from "node:crypto";
import type { ILock, LockManager } from "../../types.js";

export class InMemoryLockManager implements LockManager {
  private readonly locks = new Map<string, ILock>();
  private readonly cleanupInterval: ReturnType<typeof setInterval>;

  constructor(cleanupIntervalMs = 60_000) {
    this.cleanupInterval = setInterval(() => this.cleanExpired(), cleanupIntervalMs);
    // Allow process to exit even if interval is running
    if (this.cleanupInterval.unref) {
      this.cleanupInterval.unref();
    }
  }

  destroy(): void {
    clearInterval(this.cleanupInterval);
  }

  private cleanExpired(): void {
    const now = new Date();
    for (const [token, lock] of this.locks.entries()) {
      if (lock.expiresAt <= now) {
        this.locks.delete(token);
      }
    }
  }

  private isExpired(lock: ILock): boolean {
    return lock.expiresAt <= new Date();
  }

  async lock(
    path: string,
    owner: string,
    scope: "exclusive" | "shared",
    depth: "0" | "infinity",
    timeoutSeconds: number,
  ): Promise<ILock> {
    // Check for conflicting locks
    const existing = await this.getLocks(path);
    for (const existingLock of existing) {
      if (existingLock.scope === "exclusive" || scope === "exclusive") {
        throw new LockConflictError(existingLock);
      }
    }

    const token = `opaquelocktoken:${crypto.randomUUID()}`;
    const now = new Date();
    const expiresAt = new Date(now.getTime() + timeoutSeconds * 1000);

    const lock: ILock = {
      token,
      path,
      owner,
      scope,
      depth,
      expiresAt,
    };

    this.locks.set(token, lock);
    return lock;
  }

  async unlock(path: string, token: string): Promise<void> {
    const lock = this.locks.get(token);
    if (!lock || this.isExpired(lock)) {
      throw new LockNotFoundError(token);
    }
    if (lock.path !== path) {
      throw new LockNotFoundError(token);
    }
    this.locks.delete(token);
  }

  async refresh(token: string, timeoutSeconds: number): Promise<void> {
    const lock = this.locks.get(token);
    if (!lock || this.isExpired(lock)) {
      throw new LockNotFoundError(token);
    }
    lock.expiresAt = new Date(Date.now() + timeoutSeconds * 1000);
  }

  async getLocks(path: string): Promise<ILock[]> {
    const now = new Date();
    const result: ILock[] = [];

    for (const lock of this.locks.values()) {
      if (lock.expiresAt <= now) continue;

      // Exact path match
      if (lock.path === path) {
        result.push(lock);
        continue;
      }

      // Ancestor with depth:infinity covers this path
      if (lock.depth === "infinity" && path.startsWith(lock.path + "/")) {
        result.push(lock);
      }
    }

    return result;
  }

  async isLocked(path: string): Promise<boolean> {
    const locks = await this.getLocks(path);
    return locks.length > 0;
  }

  /** Expose internal lock map for testing */
  getLockByToken(token: string): ILock | undefined {
    return this.locks.get(token);
  }
}

export class LockConflictError extends Error {
  readonly existingLock: ILock;

  constructor(existingLock: ILock) {
    super(`Lock conflict on path: ${existingLock.path}`);
    this.name = "LockConflictError";
    this.existingLock = existingLock;
  }
}

export class LockNotFoundError extends Error {
  readonly token: string;

  constructor(token: string) {
    super(`Lock not found: ${token}`);
    this.name = "LockNotFoundError";
    this.token = token;
  }
}
