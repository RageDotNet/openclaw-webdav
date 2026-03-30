import type { IncomingHttpHeaders, OutgoingHttpHeaders } from "node:http";
import type { Readable, Writable } from "node:stream";

export type { IncomingHttpHeaders, OutgoingHttpHeaders };

// ─── Request / Response ──────────────────────────────────────────────────────

export interface ParsedRequest {
  method: string;
  path: string;
  query: Record<string, string>;
  headers: IncomingHttpHeaders;
  body: Buffer;
}

export interface HandlerResult {
  status: number;
  headers: OutgoingHttpHeaders;
  /** undefined = no body (204); null also acceptable as empty */
  body: string | Buffer | Readable | null | undefined;
}

// ─── Storage ─────────────────────────────────────────────────────────────────

export interface StatResult {
  isDirectory: boolean;
  isFile: boolean;
  size: number;
  mtime: Date;
  ctime: Date;
}

export interface StorageAdapter {
  exists(path: string): Promise<boolean>;
  readFile(path: string): Promise<Buffer>;
  writeFile(path: string, data: Buffer): Promise<void>;
  createReadStream(path: string): Readable;
  createWriteStream(path: string): Writable;
  unlink(path: string): Promise<void>;
  rename(src: string, dest: string): Promise<void>;
  stat(path: string): Promise<StatResult>;
  readdir(path: string): Promise<string[]>;
  mkdir(path: string, opts?: { recursive?: boolean }): Promise<void>;
  rmdir(path: string): Promise<void>;
  copy(src: string, dest: string): Promise<void>;
}

export type StorageErrorCode = "ENOENT" | "EISDIR" | "EACCES" | "EEXIST" | "ENOTEMPTY";

export class StorageError extends Error {
  readonly code: StorageErrorCode;
  readonly path: string;

  constructor(code: StorageErrorCode, path: string, message?: string) {
    super(message ?? `${code}: ${path}`);
    this.name = "StorageError";
    this.code = code;
    this.path = path;
  }
}

// ─── Locking ─────────────────────────────────────────────────────────────────

export interface ILock {
  token: string;
  path: string;
  owner: string;
  scope: "exclusive" | "shared";
  depth: "0" | "infinity";
  expiresAt: Date;
}

export interface LockManager {
  lock(
    path: string,
    owner: string,
    scope: "exclusive" | "shared",
    depth: "0" | "infinity",
    timeoutSeconds: number,
  ): Promise<ILock>;
  unlock(path: string, token: string): Promise<void>;
  refresh(token: string, timeoutSeconds: number): Promise<void>;
  getLocks(path: string): Promise<ILock[]>;
  isLocked(path: string): Promise<boolean>;
}

// ─── Validation ──────────────────────────────────────────────────────────────

export type ValidationResult =
  | { valid: true; normalizedPath: string }
  | { valid: false; errorCode: 403 | 400; reason: string };
