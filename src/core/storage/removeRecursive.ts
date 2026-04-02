import * as path from "node:path";
import type { StatResult, StorageAdapter } from "../../types.js";

/** Remove a file or recursively remove a directory tree. Ignores missing paths. */
export async function removeRecursive(filePath: string, storage: StorageAdapter): Promise<void> {
  let stat: StatResult;
  try {
    stat = await storage.stat(filePath);
  } catch {
    return;
  }

  if (stat.isFile) {
    await storage.unlink(filePath);
    return;
  }

  const children = await storage.readdir(filePath);
  for (const child of children) {
    await removeRecursive(path.join(filePath, child), storage);
  }
  await storage.rmdir(filePath);
}
