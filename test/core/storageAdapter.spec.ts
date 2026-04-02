import * as fsp from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { NodeFsStorageAdapter } from "../../src/core/storage/nodeFsAdapter.js";
import { MemoryStorageAdapter } from "../../src/core/storage/memoryAdapter.js";
import type { StorageAdapter } from "../../src/types.js";
import { StorageError } from "../../src/types.js";

// ─── Compliance Suite ─────────────────────────────────────────────────────────

function runComplianceSuite(
  name: string,
  factory: () => { adapter: StorageAdapter; root: string; cleanup: () => Promise<void> },
) {
  describe(`${name} — compliance suite`, () => {
    let adapter: StorageAdapter;
    let root: string;
    let cleanup: () => Promise<void>;

    beforeEach(async () => {
      ({ adapter, root, cleanup } = factory());
    });

    afterEach(async () => {
      await cleanup();
    });

    function p(...parts: string[]) {
      return path.posix.join(root, ...parts);
    }

    // ── exists ────────────────────────────────────────────────────────────────

    it("exists() returns false for non-existent path", async () => {
      expect(await adapter.exists(p("nope.txt"))).toBe(false);
    });

    it("exists() returns true after writeFile", async () => {
      await adapter.writeFile(p("file.txt"), Buffer.from("hello"));
      expect(await adapter.exists(p("file.txt"))).toBe(true);
    });

    // ── writeFile / readFile ──────────────────────────────────────────────────

    it("writeFile + readFile round-trips data", async () => {
      const data = Buffer.from("hello world");
      await adapter.writeFile(p("file.txt"), data);
      const result = await adapter.readFile(p("file.txt"));
      expect(result).toEqual(data);
    });

    it("writeFile overwrites existing file", async () => {
      await adapter.writeFile(p("file.txt"), Buffer.from("v1"));
      await adapter.writeFile(p("file.txt"), Buffer.from("v2"));
      const result = await adapter.readFile(p("file.txt"));
      expect(result.toString()).toBe("v2");
    });

    it("readFile throws StorageError ENOENT for missing file", async () => {
      await expect(adapter.readFile(p("missing.txt"))).rejects.toThrow(StorageError);
      await expect(adapter.readFile(p("missing.txt"))).rejects.toMatchObject({ code: "ENOENT" });
    });

    it("readFile throws StorageError EISDIR for directory", async () => {
      await adapter.mkdir(p("mydir"));
      await expect(adapter.readFile(p("mydir"))).rejects.toMatchObject({ code: "EISDIR" });
    });

    // ── stat ──────────────────────────────────────────────────────────────────

    it("stat() returns correct info for file", async () => {
      await adapter.writeFile(p("file.txt"), Buffer.from("hello"));
      const s = await adapter.stat(p("file.txt"));
      expect(s.isFile).toBe(true);
      expect(s.isDirectory).toBe(false);
      expect(s.size).toBe(5);
      expect(s.mtime).toBeInstanceOf(Date);
    });

    it("stat() returns correct info for directory", async () => {
      await adapter.mkdir(p("mydir"));
      const s = await adapter.stat(p("mydir"));
      expect(s.isDirectory).toBe(true);
      expect(s.isFile).toBe(false);
    });

    it("stat() throws ENOENT for missing path", async () => {
      await expect(adapter.stat(p("missing"))).rejects.toMatchObject({ code: "ENOENT" });
    });

    // ── mkdir / readdir ───────────────────────────────────────────────────────

    it("mkdir creates a directory", async () => {
      await adapter.mkdir(p("newdir"));
      expect(await adapter.exists(p("newdir"))).toBe(true);
      const s = await adapter.stat(p("newdir"));
      expect(s.isDirectory).toBe(true);
    });

    it("mkdir throws EEXIST if directory already exists", async () => {
      await adapter.mkdir(p("existing"));
      await expect(adapter.mkdir(p("existing"))).rejects.toMatchObject({ code: "EEXIST" });
    });

    it("mkdir throws ENOENT if parent does not exist (non-recursive)", async () => {
      await expect(adapter.mkdir(p("a/b/c"))).rejects.toMatchObject({ code: "ENOENT" });
    });

    it("mkdir with recursive creates intermediate dirs", async () => {
      await adapter.mkdir(p("a/b/c"), { recursive: true });
      expect(await adapter.exists(p("a/b/c"))).toBe(true);
    });

    it("readdir returns children of directory", async () => {
      await adapter.mkdir(p("parent"));
      await adapter.writeFile(p("parent/file1.txt"), Buffer.from("a"));
      await adapter.writeFile(p("parent/file2.txt"), Buffer.from("b"));
      await adapter.mkdir(p("parent/subdir"));
      const entries = await adapter.readdir(p("parent"));
      expect(entries.sort()).toEqual(["file1.txt", "file2.txt", "subdir"]);
    });

    it("readdir returns empty array for empty directory", async () => {
      await adapter.mkdir(p("empty"));
      expect(await adapter.readdir(p("empty"))).toEqual([]);
    });

    it("readdir throws ENOENT for missing directory", async () => {
      await expect(adapter.readdir(p("missing"))).rejects.toMatchObject({ code: "ENOENT" });
    });

    // ── unlink ────────────────────────────────────────────────────────────────

    it("unlink removes a file", async () => {
      await adapter.writeFile(p("file.txt"), Buffer.from("x"));
      await adapter.unlink(p("file.txt"));
      expect(await adapter.exists(p("file.txt"))).toBe(false);
    });

    it("unlink throws ENOENT for missing file", async () => {
      await expect(adapter.unlink(p("missing.txt"))).rejects.toMatchObject({ code: "ENOENT" });
    });

    it("unlink throws EISDIR for directory", async () => {
      await adapter.mkdir(p("mydir"));
      await expect(adapter.unlink(p("mydir"))).rejects.toMatchObject({ code: "EISDIR" });
    });

    // ── rmdir ─────────────────────────────────────────────────────────────────

    it("rmdir removes an empty directory", async () => {
      await adapter.mkdir(p("emptydir"));
      await adapter.rmdir(p("emptydir"));
      expect(await adapter.exists(p("emptydir"))).toBe(false);
    });

    it("rmdir throws ENOTEMPTY for non-empty directory", async () => {
      await adapter.mkdir(p("nonempty"));
      await adapter.writeFile(p("nonempty/file.txt"), Buffer.from("x"));
      await expect(adapter.rmdir(p("nonempty"))).rejects.toMatchObject({ code: "ENOTEMPTY" });
    });

    it("rmdir throws ENOENT for missing directory", async () => {
      await expect(adapter.rmdir(p("missing"))).rejects.toMatchObject({ code: "ENOENT" });
    });

    // ── rename ────────────────────────────────────────────────────────────────

    it("rename moves a file", async () => {
      await adapter.writeFile(p("old.txt"), Buffer.from("data"));
      await adapter.rename(p("old.txt"), p("new.txt"));
      expect(await adapter.exists(p("old.txt"))).toBe(false);
      expect(await adapter.exists(p("new.txt"))).toBe(true);
      const data = await adapter.readFile(p("new.txt"));
      expect(data.toString()).toBe("data");
    });

    it("rename moves a directory", async () => {
      await adapter.mkdir(p("olddir"));
      await adapter.writeFile(p("olddir/file.txt"), Buffer.from("x"));
      await adapter.rename(p("olddir"), p("newdir"));
      expect(await adapter.exists(p("olddir"))).toBe(false);
      expect(await adapter.exists(p("newdir"))).toBe(true);
      expect(await adapter.exists(p("newdir/file.txt"))).toBe(true);
    });

    it("rename throws ENOENT for missing source", async () => {
      await expect(adapter.rename(p("missing.txt"), p("dest.txt"))).rejects.toMatchObject({
        code: "ENOENT",
      });
    });

    // ── copy ──────────────────────────────────────────────────────────────────

    it("copy duplicates a file", async () => {
      await adapter.writeFile(p("src.txt"), Buffer.from("original"));
      await adapter.copy(p("src.txt"), p("dest.txt"));
      expect(await adapter.exists(p("src.txt"))).toBe(true);
      expect(await adapter.exists(p("dest.txt"))).toBe(true);
      const data = await adapter.readFile(p("dest.txt"));
      expect(data.toString()).toBe("original");
    });

    it("copy duplicates a directory recursively", async () => {
      await adapter.mkdir(p("srcdir"));
      await adapter.writeFile(p("srcdir/a.txt"), Buffer.from("a"));
      await adapter.mkdir(p("srcdir/sub"));
      await adapter.writeFile(p("srcdir/sub/b.txt"), Buffer.from("b"));
      await adapter.copy(p("srcdir"), p("destdir"));
      expect(await adapter.exists(p("destdir/a.txt"))).toBe(true);
      expect(await adapter.exists(p("destdir/sub/b.txt"))).toBe(true);
      const b = await adapter.readFile(p("destdir/sub/b.txt"));
      expect(b.toString()).toBe("b");
    });

    it("copy throws ENOENT for missing source", async () => {
      await expect(adapter.copy(p("missing.txt"), p("dest.txt"))).rejects.toMatchObject({
        code: "ENOENT",
      });
    });

    // ── createReadStream ──────────────────────────────────────────────────────

    it("createReadStream streams file content", async () => {
      await adapter.writeFile(p("stream.txt"), Buffer.from("streamed content"));
      const stream = adapter.createReadStream(p("stream.txt"));
      const chunks: Buffer[] = [];
      await new Promise<void>((resolve, reject) => {
        stream.on("data", (c: Buffer) => chunks.push(c));
        stream.on("end", resolve);
        stream.on("error", reject);
      });
      expect(Buffer.concat(chunks).toString()).toBe("streamed content");
    });

    it("createReadStream emits error for missing file", async () => {
      const stream = adapter.createReadStream(p("missing.txt"));
      await expect(
        new Promise<void>((resolve, reject) => {
          stream.on("data", () => {});
          stream.on("end", resolve);
          stream.on("error", reject);
        }),
      ).rejects.toMatchObject({ code: "ENOENT" });
    });

    // ── createWriteStream ─────────────────────────────────────────────────────

    it("createWriteStream writes file content", async () => {
      const stream = adapter.createWriteStream(p("written.txt"));
      await new Promise<void>((resolve, reject) => {
        stream.on("finish", resolve);
        stream.on("error", reject);
        stream.write(Buffer.from("written "));
        stream.end(Buffer.from("data"));
      });
      const data = await adapter.readFile(p("written.txt"));
      expect(data.toString()).toBe("written data");
    });
  });
}

// ─── NodeFsStorageAdapter ─────────────────────────────────────────────────────

runComplianceSuite("NodeFsStorageAdapter", () => {
  const tmpDir = path.join(os.tmpdir(), `webdav-test-fs-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  let initialized = false;

  const adapter = new NodeFsStorageAdapter();

  // We need to create the tmpDir synchronously-ish — use a lazy init pattern
  const lazyInit = async () => {
    if (!initialized) {
      await fsp.mkdir(tmpDir, { recursive: true });
      initialized = true;
    }
  };

  // Wrap adapter to ensure tmpDir exists before first use
  const wrappedAdapter: StorageAdapter = {
    exists: async (p) => { await lazyInit(); return adapter.exists(p); },
    readFile: async (p) => { await lazyInit(); return adapter.readFile(p); },
    writeFile: async (p, d) => { await lazyInit(); return adapter.writeFile(p, d); },
    createReadStream: (p) => { fsp.mkdir(tmpDir, { recursive: true }).catch(() => {}); return adapter.createReadStream(p); },
    createWriteStream: (p) => { fsp.mkdir(tmpDir, { recursive: true }).catch(() => {}); return adapter.createWriteStream(p); },
    unlink: async (p) => { await lazyInit(); return adapter.unlink(p); },
    rename: async (s, d) => { await lazyInit(); return adapter.rename(s, d); },
    stat: async (p) => { await lazyInit(); return adapter.stat(p); },
    readdir: async (p) => { await lazyInit(); return adapter.readdir(p); },
    mkdir: async (p, o) => { await lazyInit(); return adapter.mkdir(p, o); },
    rmdir: async (p) => { await lazyInit(); return adapter.rmdir(p); },
    copy: async (s, d) => { await lazyInit(); return adapter.copy(s, d); },
  };

  return {
    adapter: wrappedAdapter,
    root: tmpDir,
    cleanup: async () => {
      await fsp.rm(tmpDir, { recursive: true, force: true });
    },
  };
});

// ─── MemoryStorageAdapter ─────────────────────────────────────────────────────

runComplianceSuite("MemoryStorageAdapter", () => {
  const adapter = new MemoryStorageAdapter();
  const root = "/testroot";

  // Pre-create root dir
  const initPromise = adapter.mkdir(root);

  const wrappedAdapter: StorageAdapter = {
    exists: async (p) => { await initPromise; return adapter.exists(p); },
    readFile: async (p) => { await initPromise; return adapter.readFile(p); },
    writeFile: async (p, d) => { await initPromise; return adapter.writeFile(p, d); },
    createReadStream: (p) => adapter.createReadStream(p),
    createWriteStream: (p) => adapter.createWriteStream(p),
    unlink: async (p) => { await initPromise; return adapter.unlink(p); },
    rename: async (s, d) => { await initPromise; return adapter.rename(s, d); },
    stat: async (p) => { await initPromise; return adapter.stat(p); },
    readdir: async (p) => { await initPromise; return adapter.readdir(p); },
    mkdir: async (p, o) => { await initPromise; return adapter.mkdir(p, o); },
    rmdir: async (p) => { await initPromise; return adapter.rmdir(p); },
    copy: async (s, d) => { await initPromise; return adapter.copy(s, d); },
  };

  return {
    adapter: wrappedAdapter,
    root,
    cleanup: async () => {},
  };
});
