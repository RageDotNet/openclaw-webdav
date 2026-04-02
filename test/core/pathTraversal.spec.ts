/**
 * Dedicated path traversal hardening tests.
 * Covers all known attack vectors against validatePath().
 */
import { describe, it, expect, vi } from "vitest";
import { validatePath } from "../../src/core/storage/pathValidation.js";

const WORKSPACE = "/workspace";

function makeLogger() {
  return { warn: vi.fn() };
}

// ─── Directory Traversal ──────────────────────────────────────────────────────

describe("directory traversal attacks", () => {
  it("rejects ../", () => {
    const result = validatePath("/../etc/passwd", WORKSPACE);
    expect(result.valid).toBe(false);
    expect(result.errorCode).toBe(403);
  });

  it("rejects ../../", () => {
    const result = validatePath("/../../etc/passwd", WORKSPACE);
    expect(result.valid).toBe(false);
    expect(result.errorCode).toBe(403);
  });

  it("rejects nested traversal", () => {
    const result = validatePath("/subdir/../../etc/passwd", WORKSPACE);
    expect(result.valid).toBe(false);
    expect(result.errorCode).toBe(403);
  });

  it("rejects traversal that resolves to workspace root parent", () => {
    const result = validatePath("/..", WORKSPACE);
    expect(result.valid).toBe(false);
    expect(result.errorCode).toBe(403);
  });
});

// ─── URL-Encoded Traversal ────────────────────────────────────────────────────

describe("URL-encoded traversal attacks", () => {
  it("rejects %2e%2e%2f (encoded ../)", () => {
    const result = validatePath("/%2e%2e%2f", WORKSPACE);
    expect(result.valid).toBe(false);
    // %2f is an encoded slash — rejected as encoded separator
    expect(result.errorCode).toBe(400);
  });

  it("rejects %2e%2e/ (encoded dots with literal slash)", () => {
    // %2e%2e decodes to .. — traversal check catches it
    const result = validatePath("/%2e%2e/etc/passwd", WORKSPACE);
    expect(result.valid).toBe(false);
  });

  it("rejects %2F encoded slash", () => {
    const result = validatePath("/foo%2Fbar", WORKSPACE);
    expect(result.valid).toBe(false);
    expect(result.errorCode).toBe(400);
    expect(result.reason).toContain("encoded separator");
  });

  it("rejects %5C encoded backslash", () => {
    const result = validatePath("/foo%5Cbar", WORKSPACE);
    expect(result.valid).toBe(false);
    expect(result.errorCode).toBe(400);
    expect(result.reason).toContain("encoded separator");
  });

  it("rejects double-encoded %252e%252e%252f", () => {
    const result = validatePath("/%252e%252e%252f", WORKSPACE);
    expect(result.valid).toBe(false);
    expect(result.errorCode).toBe(400);
    expect(result.reason).toContain("double-encoded");
  });

  it("rejects double-encoded %252F", () => {
    const result = validatePath("/%252F", WORKSPACE);
    expect(result.valid).toBe(false);
    expect(result.errorCode).toBe(400);
  });

  it("rejects malformed percent encoding", () => {
    const result = validatePath("/%zz/file", WORKSPACE);
    expect(result.valid).toBe(false);
    expect(result.errorCode).toBe(400);
    expect(result.reason).toContain("malformed");
  });
});

// ─── Null Byte Injection ──────────────────────────────────────────────────────

describe("null byte injection", () => {
  it("rejects null byte in path", () => {
    const result = validatePath("/file\x00.txt", WORKSPACE);
    expect(result.valid).toBe(false);
    expect(result.errorCode).toBe(400);
    expect(result.reason).toContain("control character");
  });

  it("rejects null byte at start", () => {
    const result = validatePath("\x00/file.txt", WORKSPACE);
    expect(result.valid).toBe(false);
    expect(result.errorCode).toBe(400);
  });
});

// ─── ASCII Control Characters ─────────────────────────────────────────────────

describe("ASCII control character injection", () => {
  it("rejects 0x01 control char", () => {
    const result = validatePath("/file\x01.txt", WORKSPACE);
    expect(result.valid).toBe(false);
    expect(result.errorCode).toBe(400);
  });

  it("rejects 0x1F control char", () => {
    const result = validatePath("/file\x1f.txt", WORKSPACE);
    expect(result.valid).toBe(false);
    expect(result.errorCode).toBe(400);
  });

  it("rejects DEL (0x7F)", () => {
    const result = validatePath("/file\x7f.txt", WORKSPACE);
    expect(result.valid).toBe(false);
    expect(result.errorCode).toBe(400);
  });
});

// ─── Windows Reserved Names ───────────────────────────────────────────────────

describe("Windows reserved names", () => {
  const reserved = ["CON", "PRN", "AUX", "NUL", "COM1", "COM9", "LPT1", "LPT9"];

  for (const name of reserved) {
    it(`rejects ${name}`, () => {
      const result = validatePath(`/${name}`, WORKSPACE);
      expect(result.valid).toBe(false);
      expect(result.errorCode).toBe(400);
    });

    it(`rejects ${name}.txt`, () => {
      const result = validatePath(`/${name}.txt`, WORKSPACE);
      expect(result.valid).toBe(false);
      expect(result.errorCode).toBe(400);
    });

    it(`rejects ${name.toLowerCase()}`, () => {
      const result = validatePath(`/${name.toLowerCase()}`, WORKSPACE);
      expect(result.valid).toBe(false);
      expect(result.errorCode).toBe(400);
    });
  }
});

// ─── Unicode Normalization ────────────────────────────────────────────────────

describe("Unicode normalization", () => {
  it("normalizes NFD to NFC", () => {
    // 'é' in NFD = e + combining accent (U+0065 U+0301)
    const nfd = "/caf\u0065\u0301/file.txt";
    const result = validatePath(nfd, WORKSPACE);
    expect(result.valid).toBe(true);
    // The normalized path should use NFC 'é' (U+00E9)
    expect(result.normalizedPath).toContain("caf\u00e9");
  });

  it("accepts valid Unicode filenames", () => {
    const result = validatePath("/日本語/ファイル.txt", WORKSPACE);
    expect(result.valid).toBe(true);
  });

  it("accepts emoji in filenames", () => {
    const result = validatePath("/folder/file🎉.txt", WORKSPACE);
    expect(result.valid).toBe(true);
  });
});

// ─── WARN Logging ─────────────────────────────────────────────────────────────

describe("WARN logging on traversal attempts", () => {
  it("logs WARN for directory traversal", () => {
    const logger = makeLogger();
    validatePath("/../etc/passwd", WORKSPACE, logger, "192.168.1.1");

    expect(logger.warn).toHaveBeenCalledOnce();
    const msg = logger.warn.mock.calls[0][0] as string;
    expect(msg).toContain("192.168.1.1");
    expect(msg).toContain("traversal");
  });

  it("logs WARN for encoded separator", () => {
    const logger = makeLogger();
    validatePath("/foo%2Fbar", WORKSPACE, logger, "10.0.0.1");

    expect(logger.warn).toHaveBeenCalledOnce();
    const msg = logger.warn.mock.calls[0][0] as string;
    expect(msg).toContain("10.0.0.1");
  });

  it("logs WARN for double-encoded path", () => {
    const logger = makeLogger();
    validatePath("/%252e%252e", WORKSPACE, logger);

    expect(logger.warn).toHaveBeenCalledOnce();
  });

  it("logs WARN for null byte", () => {
    const logger = makeLogger();
    validatePath("/file\x00.txt", WORKSPACE, logger);

    expect(logger.warn).toHaveBeenCalledOnce();
  });

  it("logs WARN for Windows reserved name", () => {
    const logger = makeLogger();
    validatePath("/CON", WORKSPACE, logger);

    expect(logger.warn).toHaveBeenCalledOnce();
  });

  it("does NOT log WARN for valid paths", () => {
    const logger = makeLogger();
    validatePath("/valid/path/file.txt", WORKSPACE, logger);

    expect(logger.warn).not.toHaveBeenCalled();
  });

  it("includes attempted path in log message", () => {
    const logger = makeLogger();
    validatePath("/../secret", WORKSPACE, logger);

    const msg = logger.warn.mock.calls[0][0] as string;
    expect(msg).toContain("/../secret");
  });
});

// ─── Valid Paths ──────────────────────────────────────────────────────────────

describe("valid paths", () => {
  it("accepts root /", () => {
    const result = validatePath("/", WORKSPACE);
    expect(result.valid).toBe(true);
    expect(result.normalizedPath).toBe(WORKSPACE);
  });

  it("accepts simple file path", () => {
    const result = validatePath("/file.txt", WORKSPACE);
    expect(result.valid).toBe(true);
    expect(result.normalizedPath).toBe(`${WORKSPACE}/file.txt`);
  });

  it("accepts nested path", () => {
    const result = validatePath("/dir/subdir/file.txt", WORKSPACE);
    expect(result.valid).toBe(true);
    expect(result.normalizedPath).toBe(`${WORKSPACE}/dir/subdir/file.txt`);
  });

  it("accepts URL-encoded spaces", () => {
    const result = validatePath("/my%20file.txt", WORKSPACE);
    expect(result.valid).toBe(true);
    expect(result.normalizedPath).toBe(`${WORKSPACE}/my file.txt`);
  });

  it("accepts URL-encoded non-ASCII", () => {
    const result = validatePath("/%E6%97%A5%E6%9C%AC%E8%AA%9E.txt", WORKSPACE);
    expect(result.valid).toBe(true);
    expect(result.normalizedPath).toBe(`${WORKSPACE}/日本語.txt`);
  });
});
