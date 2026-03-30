import * as path from "node:path";
import { PassThrough, Readable, Writable } from "node:stream";
import type { StatResult, StorageAdapter } from "../../types.js";
import { StorageError } from "../../types.js";

interface MemoryFile {
  type: "file";
  data: Buffer;
  mtime: Date;
  ctime: Date;
}

interface MemoryDir {
  type: "dir";
  mtime: Date;
  ctime: Date;
}

type MemoryEntry = MemoryFile | MemoryDir;

export class MemoryStorageAdapter implements StorageAdapter {
  private readonly store = new Map<string, MemoryEntry>();

  constructor() {
    // Root directory always exists
    const now = new Date();
    this.store.set("/", { type: "dir", mtime: now, ctime: now });
  }

  private normalizePath(p: string): string {
    const normalized = path.posix.normalize(p);
    return normalized === "." ? "/" : normalized;
  }

  async exists(filePath: string): Promise<boolean> {
    return this.store.has(this.normalizePath(filePath));
  }

  async readFile(filePath: string): Promise<Buffer> {
    const entry = this.store.get(this.normalizePath(filePath));
    if (!entry) throw new StorageError("ENOENT", filePath);
    if (entry.type === "dir") throw new StorageError("EISDIR", filePath);
    return Buffer.from(entry.data);
  }

  async writeFile(filePath: string, data: Buffer): Promise<void> {
    const normalized = this.normalizePath(filePath);
    const existing = this.store.get(normalized);
    if (existing?.type === "dir") throw new StorageError("EISDIR", filePath);

    const parent = path.posix.dirname(normalized);
    const parentEntry = this.store.get(parent);
    if (!parentEntry) throw new StorageError("ENOENT", parent);
    if (parentEntry.type === "file") throw new StorageError("ENOTDIR" as "EACCES", parent);

    const now = new Date();
    this.store.set(normalized, {
      type: "file",
      data: Buffer.from(data),
      mtime: now,
      ctime: existing ? existing.ctime : now,
    });
  }

  createReadStream(filePath: string): Readable {
    const normalized = this.normalizePath(filePath);
    const entry = this.store.get(normalized);

    const stream = new PassThrough();
    if (!entry) {
      process.nextTick(() => stream.destroy(new StorageError("ENOENT", filePath)));
    } else if (entry.type === "dir") {
      process.nextTick(() => stream.destroy(new StorageError("EISDIR", filePath)));
    } else {
      process.nextTick(() => {
        stream.end(entry.data);
      });
    }
    return stream;
  }

  createWriteStream(filePath: string): Writable {
    const normalized = this.normalizePath(filePath);
    const chunks: Buffer[] = [];
    const stream = new PassThrough();

    stream.on("data", (chunk: Buffer) => chunks.push(chunk));
    stream.on("end", () => {
      const data = Buffer.concat(chunks);
      const existing = this.store.get(normalized);
      const now = new Date();
      this.store.set(normalized, {
        type: "file",
        data,
        mtime: now,
        ctime: existing ? existing.ctime : now,
      });
    });

    return stream;
  }

  async unlink(filePath: string): Promise<void> {
    const normalized = this.normalizePath(filePath);
    const entry = this.store.get(normalized);
    if (!entry) throw new StorageError("ENOENT", filePath);
    if (entry.type === "dir") throw new StorageError("EISDIR", filePath);
    this.store.delete(normalized);
  }

  async rename(src: string, dest: string): Promise<void> {
    const normalizedSrc = this.normalizePath(src);
    const normalizedDest = this.normalizePath(dest);

    const entry = this.store.get(normalizedSrc);
    if (!entry) throw new StorageError("ENOENT", src);

    const destParent = path.posix.dirname(normalizedDest);
    if (!this.store.has(destParent)) throw new StorageError("ENOENT", destParent);

    if (entry.type === "dir") {
      // Move all entries under src to dest
      const prefix = normalizedSrc === "/" ? "/" : normalizedSrc + "/";
      const toMove: Array<[string, MemoryEntry]> = [];

      for (const [k, v] of this.store.entries()) {
        if (k === normalizedSrc || k.startsWith(prefix)) {
          toMove.push([k, v]);
        }
      }

      for (const [k] of toMove) {
        this.store.delete(k);
      }

      for (const [k, v] of toMove) {
        const newKey = k === normalizedSrc ? normalizedDest : normalizedDest + k.slice(normalizedSrc.length);
        this.store.set(newKey, v);
      }
    } else {
      this.store.delete(normalizedSrc);
      this.store.set(normalizedDest, entry);
    }
  }

  async stat(filePath: string): Promise<StatResult> {
    const entry = this.store.get(this.normalizePath(filePath));
    if (!entry) throw new StorageError("ENOENT", filePath);
    return {
      isDirectory: entry.type === "dir",
      isFile: entry.type === "file",
      size: entry.type === "file" ? entry.data.length : 0,
      mtime: entry.mtime,
      ctime: entry.ctime,
    };
  }

  async readdir(filePath: string): Promise<string[]> {
    const normalized = this.normalizePath(filePath);
    const entry = this.store.get(normalized);
    if (!entry) throw new StorageError("ENOENT", filePath);
    if (entry.type === "file") throw new StorageError("ENOTDIR" as "EACCES", filePath);

    const prefix = normalized === "/" ? "/" : normalized + "/";
    const children = new Set<string>();

    for (const key of this.store.keys()) {
      if (key === normalized) continue;
      if (!key.startsWith(prefix)) continue;

      const rest = key.slice(prefix.length);
      const firstSegment = rest.split("/")[0];
      if (firstSegment) children.add(firstSegment);
    }

    return [...children].sort();
  }

  async mkdir(filePath: string, opts?: { recursive?: boolean }): Promise<void> {
    const normalized = this.normalizePath(filePath);

    if (this.store.has(normalized)) {
      throw new StorageError("EEXIST", filePath);
    }

    if (opts?.recursive) {
      // Create all intermediate directories
      const parts = normalized.split("/").filter(Boolean);
      let current = "";
      for (const part of parts) {
        current += "/" + part;
        if (!this.store.has(current)) {
          const now = new Date();
          this.store.set(current, { type: "dir", mtime: now, ctime: now });
        }
      }
    } else {
      const parent = path.posix.dirname(normalized);
      const parentEntry = this.store.get(parent);
      if (!parentEntry) throw new StorageError("ENOENT", parent);
      if (parentEntry.type === "file") throw new StorageError("EACCES", parent);

      const now = new Date();
      this.store.set(normalized, { type: "dir", mtime: now, ctime: now });
    }
  }

  async rmdir(filePath: string): Promise<void> {
    const normalized = this.normalizePath(filePath);
    const entry = this.store.get(normalized);
    if (!entry) throw new StorageError("ENOENT", filePath);
    if (entry.type === "file") throw new StorageError("EACCES", filePath);

    // Check if directory is empty
    const prefix = normalized === "/" ? "/" : normalized + "/";
    for (const key of this.store.keys()) {
      if (key !== normalized && key.startsWith(prefix)) {
        throw new StorageError("ENOTEMPTY", filePath);
      }
    }

    this.store.delete(normalized);
  }

  async copy(src: string, dest: string): Promise<void> {
    const normalizedSrc = this.normalizePath(src);
    const normalizedDest = this.normalizePath(dest);

    const srcEntry = this.store.get(normalizedSrc);
    if (!srcEntry) throw new StorageError("ENOENT", src);

    if (srcEntry.type === "file") {
      const destParent = path.posix.dirname(normalizedDest);
      if (!this.store.has(destParent)) throw new StorageError("ENOENT", destParent);

      const now = new Date();
      this.store.set(normalizedDest, {
        type: "file",
        data: Buffer.from(srcEntry.data),
        mtime: now,
        ctime: now,
      });
    } else {
      // Recursive directory copy
      const prefix = normalizedSrc === "/" ? "/" : normalizedSrc + "/";
      const toCopy: Array<[string, MemoryEntry]> = [[normalizedSrc, srcEntry]];

      for (const [k, v] of this.store.entries()) {
        if (k.startsWith(prefix)) {
          toCopy.push([k, v]);
        }
      }

      const now = new Date();
      for (const [k, v] of toCopy) {
        const newKey =
          k === normalizedSrc ? normalizedDest : normalizedDest + k.slice(normalizedSrc.length);

        if (v.type === "dir") {
          this.store.set(newKey, { type: "dir", mtime: now, ctime: now });
        } else {
          this.store.set(newKey, {
            type: "file",
            data: Buffer.from(v.data),
            mtime: now,
            ctime: now,
          });
        }
      }
    }
  }
}
