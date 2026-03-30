import { describe, expect, it } from "vitest";
import { buildErrorXml } from "../../src/core/util/errorXml.js";

describe("buildErrorXml", () => {
  it("produces correct XML declaration and root element", () => {
    const xml = buildErrorXml("no-conflicting-lock");
    expect(xml).toContain('<?xml version="1.0" encoding="utf-8"?>');
    expect(xml).toContain('<D:error xmlns:D="DAV:">');
    expect(xml).toContain("</D:error>");
  });

  it("wraps condition in DAV: namespace element", () => {
    const xml = buildErrorXml("no-conflicting-lock");
    expect(xml).toContain("<D:no-conflicting-lock/>");
  });

  it("lock-token-matches-request-uri", () => {
    const xml = buildErrorXml("lock-token-matches-request-uri");
    expect(xml).toContain("<D:lock-token-matches-request-uri/>");
  });

  it("lock-token-submitted", () => {
    const xml = buildErrorXml("lock-token-submitted");
    expect(xml).toContain("<D:lock-token-submitted/>");
  });

  it("no-external-entities", () => {
    const xml = buildErrorXml("no-external-entities");
    expect(xml).toContain("<D:no-external-entities/>");
  });

  it("preserved-live-properties", () => {
    const xml = buildErrorXml("preserved-live-properties");
    expect(xml).toContain("<D:preserved-live-properties/>");
  });

  it("propfind-finite-depth", () => {
    const xml = buildErrorXml("propfind-finite-depth");
    expect(xml).toContain("<D:propfind-finite-depth/>");
  });

  it("cannot-modify-protected-property", () => {
    const xml = buildErrorXml("cannot-modify-protected-property");
    expect(xml).toContain("<D:cannot-modify-protected-property/>");
  });

  it("precondition-failed", () => {
    const xml = buildErrorXml("precondition-failed");
    expect(xml).toContain("<D:precondition-failed/>");
  });

  it("produces a single-line string (no extra whitespace)", () => {
    const xml = buildErrorXml("no-conflicting-lock");
    expect(xml).not.toContain("\n");
    expect(xml).not.toContain("\r");
  });

  it("matches RFC 4918 §14 format exactly", () => {
    const xml = buildErrorXml("no-conflicting-lock");
    expect(xml).toBe(
      '<?xml version="1.0" encoding="utf-8"?><D:error xmlns:D="DAV:"><D:no-conflicting-lock/></D:error>',
    );
  });
});
