import * as fs from "node:fs";
import * as fsp from "node:fs/promises";
import * as path from "node:path";
import type { Readable, Writable } from "node:stream";
import type { StatResult, StorageAdapter } from "../../types.js";
import { StorageError } from "../../types.js";

function mapFsError(err: unknown, filePath: string): StorageError {
  const e = err as NodeJS.ErrnoException;
  switch (e.code) {
    case "ENOENT":
      return new StorageError("ENOENT", filePath);
    case "EISDIR":
      return new StorageError("EISDIR", filePath);
    case "EACCES":
      return new StorageError("EACCES", filePath);
    case "EEXIST":
      return new StorageError("EEXIST", filePath);
    case "ENOTEMPTY":
      return new StorageError("ENOTEMPTY", filePath);
    default:
      return new StorageError("EACCES", filePath, e.message);
  }
}

export class NodeFsStorageAdapter implements StorageAdapter {
  async exists(filePath: string): Promise<boolean> {
    try {
      await fsp.access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  async readFile(filePath: string): Promise<Buffer> {
    try {
      return await fsp.readFile(filePath);
    } catch (err) {
      throw mapFsError(err, filePath);
    }
  }

  async writeFile(filePath: string, data: Buffer): Promise<void> {
    try {
      await fsp.writeFile(filePath, data);
    } catch (err) {
      throw mapFsError(err, filePath);
    }
  }

  createReadStream(filePath: string): Readable {
    return fs.createReadStream(filePath);
  }

  createWriteStream(filePath: string): Writable {
    return fs.createWriteStream(filePath);
  }

  async unlink(filePath: string): Promise<void> {
    try {
      await fsp.unlink(filePath);
    } catch (err) {
      throw mapFsError(err, filePath);
    }
  }

  async rename(src: string, dest: string): Promise<void> {
    try {
      await fsp.rename(src, dest);
    } catch (err) {
      throw mapFsError(err, src);
    }
  }

  async stat(filePath: string): Promise<StatResult> {
    try {
      const s = await fsp.stat(filePath);
      return {
        isDirectory: s.isDirectory(),
        isFile: s.isFile(),
        size: s.size,
        mtime: s.mtime,
        ctime: s.ctime,
      };
    } catch (err) {
      throw mapFsError(err, filePath);
    }
  }

  async readdir(filePath: string): Promise<string[]> {
    try {
      return await fsp.readdir(filePath);
    } catch (err) {
      throw mapFsError(err, filePath);
    }
  }

  async mkdir(filePath: string, opts?: { recursive?: boolean }): Promise<void> {
    try {
      await fsp.mkdir(filePath, opts);
    } catch (err) {
      throw mapFsError(err, filePath);
    }
  }

  async rmdir(filePath: string): Promise<void> {
    try {
      await fsp.rmdir(filePath);
    } catch (err) {
      throw mapFsError(err, filePath);
    }
  }

  async copy(src: string, dest: string): Promise<void> {
    try {
      const srcStat = await fsp.stat(src);
      if (srcStat.isDirectory()) {
        await this._copyDir(src, dest);
      } else {
        await fsp.copyFile(src, dest);
      }
    } catch (err) {
      if (err instanceof StorageError) throw err;
      throw mapFsError(err, src);
    }
  }

  private async _copyDir(src: string, dest: string): Promise<void> {
    await fsp.mkdir(dest, { recursive: true });
    const entries = await fsp.readdir(src, { withFileTypes: true });
    for (const entry of entries) {
      const srcPath = path.join(src, entry.name);
      const destPath = path.join(dest, entry.name);
      if (entry.isDirectory()) {
        await this._copyDir(srcPath, destPath);
      } else {
        await fsp.copyFile(srcPath, destPath);
      }
    }
  }
}
