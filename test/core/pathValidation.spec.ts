import * as path from "node:path";
import { describe, expect, it } from "vitest";
import { validatePath } from "../../src/core/storage/pathValidation.js";

const WORKSPACE = "/workspace";

function valid(inputPath: string) {
  const result = validatePath(inputPath, WORKSPACE);
  if (!result.valid) throw new Error(`Expected valid but got: ${result.reason}`);
  return result.normalizedPath;
}

function invalid(inputPath: string) {
  const result = validatePath(inputPath, WORKSPACE);
  if (result.valid) throw new Error(`Expected invalid but got normalizedPath: ${result.normalizedPath}`);
  return result;
}

describe("validatePath — traversal attacks", () => {
  it("rejects ../ traversal", () => {
    const r = invalid("../etc/passwd");
    expect(r.errorCode).toBe(403);
    expect(r.reason).toBe("outside workspace");
  });

  it("rejects nested traversal", () => {
    const r = invalid("/foo/../../etc/passwd");
    expect(r.errorCode).toBe(403);
  });

  it("rejects path that resolves to workspace root parent", () => {
    const r = invalid("/..");
    expect(r.errorCode).toBe(403);
  });
});

describe("validatePath — encoded separator attacks", () => {
  it("rejects %2F (encoded forward slash)", () => {
    const r = invalid("/foo%2Fbar");
    expect(r.errorCode).toBe(400);
    expect(r.reason).toBe("encoded separator");
  });

  it("rejects %2f (lowercase encoded forward slash)", () => {
    const r = invalid("/foo%2fbar");
    expect(r.errorCode).toBe(400);
    expect(r.reason).toBe("encoded separator");
  });

  it("rejects %5C (encoded backslash)", () => {
    const r = invalid("/foo%5Cbar");
    expect(r.errorCode).toBe(400);
    expect(r.reason).toBe("encoded separator");
  });

  it("rejects %5c (lowercase encoded backslash)", () => {
    const r = invalid("/foo%5cbar");
    expect(r.errorCode).toBe(400);
    expect(r.reason).toBe("encoded separator");
  });
});

describe("validatePath — double-encoding attacks", () => {
  it("rejects %252e%252e (double-encoded ..)", () => {
    const r = invalid("%252e%252e%2f");
    // %252e%252e%2f → first: encoded separator check catches %2f
    expect(r.errorCode).toBe(400);
  });

  it("rejects %252e%252e without separator", () => {
    const r = invalid("%252e%252e");
    expect(r.errorCode).toBe(400);
    expect(r.reason).toBe("double-encoded path");
  });

  it("rejects %25252e (triple-encoded dot)", () => {
    const r = invalid("%25252e");
    expect(r.errorCode).toBe(400);
    expect(r.reason).toBe("double-encoded path");
  });
});

describe("validatePath — null byte and control characters", () => {
  it("rejects null byte", () => {
    const r = invalid("/foo\x00bar");
    expect(r.errorCode).toBe(400);
    expect(r.reason).toBe("control character in path");
  });

  it("rejects %00 (encoded null byte)", () => {
    const r = invalid("/foo%00bar");
    expect(r.errorCode).toBe(400);
    expect(r.reason).toBe("control character in path");
  });

  it("rejects ASCII control char 0x01", () => {
    const r = invalid("/foo\x01bar");
    expect(r.errorCode).toBe(400);
    expect(r.reason).toBe("control character in path");
  });
});

describe("validatePath — Windows reserved names", () => {
  const reserved = ["CON", "PRN", "AUX", "NUL", "COM1", "COM9", "LPT1", "LPT9"];

  for (const name of reserved) {
    it(`rejects ${name}`, () => {
      const r = invalid(`/${name}`);
      expect(r.errorCode).toBe(400);
      expect(r.reason).toContain("Windows reserved name");
    });

    it(`rejects ${name.toLowerCase()} (case-insensitive)`, () => {
      const r = invalid(`/${name.toLowerCase()}`);
      expect(r.errorCode).toBe(400);
    });

    it(`rejects ${name}.txt (with extension)`, () => {
      const r = invalid(`/${name}.txt`);
      expect(r.errorCode).toBe(400);
    });
  }
});

describe("validatePath — Unicode NFC/NFD normalization", () => {
  it("accepts NFC path", () => {
    // é as NFC (U+00E9)
    const nfc = "/caf\u00e9/file.txt";
    const result = validatePath(nfc, WORKSPACE);
    expect(result.valid).toBe(true);
  });

  it("accepts NFD path (normalizes to NFC)", () => {
    // é as NFD (e + combining accent U+0301)
    const nfd = "/caf\u0065\u0301/file.txt";
    const nfc = "/caf\u00e9/file.txt";
    const resultNfd = validatePath(nfd, WORKSPACE);
    const resultNfc = validatePath(nfc, WORKSPACE);
    expect(resultNfd.valid).toBe(true);
    expect(resultNfc.valid).toBe(true);
    if (resultNfd.valid && resultNfc.valid) {
      // Both should resolve to the same normalized path
      expect(resultNfd.normalizedPath).toBe(resultNfc.normalizedPath);
    }
  });
});

describe("validatePath — valid paths", () => {
  it("accepts simple file path", () => {
    const result = valid("/documents/file.txt");
    expect(result).toBe(path.join(WORKSPACE, "documents/file.txt"));
  });

  it("accepts nested path", () => {
    const result = valid("/a/b/c/d.txt");
    expect(result).toBe(path.join(WORKSPACE, "a/b/c/d.txt"));
  });

  it("accepts root path", () => {
    const result = valid("/");
    expect(result).toBe(WORKSPACE);
  });

  it("accepts empty path (treated as root)", () => {
    const result = valid("");
    expect(result).toBe(WORKSPACE);
  });

  it("accepts path with spaces (URL-encoded)", () => {
    const result = valid("/my%20documents/file.txt");
    expect(result).toBe(path.join(WORKSPACE, "my documents/file.txt"));
  });

  it("accepts path with unicode characters", () => {
    const result = valid("/日本語/ファイル.txt");
    expect(result).toBe(path.join(WORKSPACE, "日本語/ファイル.txt"));
  });

  it("accepts path with dots in filename (not traversal)", () => {
    const result = valid("/files/report.2024.pdf");
    expect(result).toBe(path.join(WORKSPACE, "files/report.2024.pdf"));
  });
});
