/**
 * WebDAV HTTP authentication: Basic (password = gateway token or gateway password) or Bearer.
 * Username in Basic auth is ignored. Uses OpenClaw's resolveGatewayAuth when available.
 */
import { createHash, timingSafeEqual } from "node:crypto";
import type { HandlerResult } from "../types.js";
import type { OpenClawRequest } from "./http.js";

const BASIC_REALM = "OpenClaw WebDAV";

export type WebDavAuthExpectation =
  | { kind: "open" }
  | { kind: "secret"; value: string }
  | { kind: "misconfigured"; detail: string };

export function safeEqualSecret(
  provided: string | undefined | null,
  expected: string | undefined | null,
): boolean {
  if (typeof provided !== "string" || typeof expected !== "string") {
    return false;
  }
  const hash = (s: string) => createHash("sha256").update(s).digest();
  return timingSafeEqual(hash(provided), hash(expected));
}

function trimStr(v: unknown): string | undefined {
  if (typeof v !== "string") {
    return undefined;
  }
  const t = v.trim();
  return t.length > 0 ? t : undefined;
}

function extractGatewayAuthConfig(openClawConfig: unknown): Record<string, unknown> | null {
  if (!openClawConfig || typeof openClawConfig !== "object") {
    return null;
  }
  const g = (openClawConfig as Record<string, unknown>).gateway;
  if (!g || typeof g !== "object") {
    return null;
  }
  const auth = (g as Record<string, unknown>).auth;
  if (!auth || typeof auth !== "object") {
    return null;
  }
  return auth as Record<string, unknown>;
}

/**
 * Fallback when `openclaw` is not loadable: env vars + plain string gateway.auth fields only.
 */
export function syncResolveWebDavAuthExpectation(openClawConfig: unknown): WebDavAuthExpectation {
  const auth = extractGatewayAuthConfig(openClawConfig);
  const env = process.env;
  const envToken = trimStr(env.OPENCLAW_GATEWAY_TOKEN);
  const envPassword = trimStr(env.OPENCLAW_GATEWAY_PASSWORD);
  const cfgToken = auth ? trimStr(auth.token) : undefined;
  const cfgPassword = auth ? trimStr(auth.password) : undefined;
  const token = cfgToken ?? envToken;
  const password = cfgPassword ?? envPassword;

  const modeRaw = auth?.mode;
  const mode = typeof modeRaw === "string" ? modeRaw : undefined;

  let resolvedMode = mode;
  if (!resolvedMode) {
    if (password) {
      resolvedMode = "password";
    } else {
      resolvedMode = "token";
    }
  }

  if (resolvedMode === "none") {
    return { kind: "open" };
  }
  if (resolvedMode === "trusted-proxy") {
    return {
      kind: "misconfigured",
      detail:
        "Gateway auth is trusted-proxy; use token or password mode (or env OPENCLAW_GATEWAY_TOKEN) for WebDAV.",
    };
  }
  if (resolvedMode === "password") {
    if (password) {
      return { kind: "secret", value: password };
    }
    return { kind: "misconfigured", detail: "Gateway password mode but no password is available." };
  }
  if (token) {
    return { kind: "secret", value: token };
  }
  return { kind: "misconfigured", detail: "Gateway token mode but no token is available." };
}

function mapResolvedToExpectation(auth: {
  mode: string;
  token?: string;
  password?: string;
}): WebDavAuthExpectation {
  if (auth.mode === "none") {
    return { kind: "open" };
  }
  if (auth.mode === "trusted-proxy") {
    return {
      kind: "misconfigured",
      detail:
        "Gateway auth is trusted-proxy; WebDAV needs token or password mode with a shared secret.",
    };
  }
  if (auth.mode === "password") {
    if (auth.password) {
      return { kind: "secret", value: auth.password };
    }
    return { kind: "misconfigured", detail: "Gateway password mode but no resolved password." };
  }
  if (auth.token) {
    return { kind: "secret", value: auth.token };
  }
  return { kind: "misconfigured", detail: "Gateway token mode but no resolved token." };
}

export async function loadWebDavAuthExpectation(openClawConfig: unknown): Promise<WebDavAuthExpectation> {
  try {
    const mod = await import("openclaw/plugin-sdk/browser-support");
    const authConfig = extractGatewayAuthConfig(openClawConfig);
    const resolved = mod.resolveGatewayAuth({
      authConfig,
      env: process.env,
    });
    return mapResolvedToExpectation(resolved);
  } catch {
    return syncResolveWebDavAuthExpectation(openClawConfig);
  }
}

export function getAuthorizationHeader(req: OpenClawRequest): string | undefined {
  const h = req.headers;
  if (!h || typeof h !== "object") {
    return undefined;
  }
  for (const [k, v] of Object.entries(h)) {
    if (k.toLowerCase() === "authorization") {
      if (typeof v === "string") {
        return v.trim();
      }
      if (Array.isArray(v) && v[0]) {
        return String(v[0]).trim();
      }
    }
  }
  return undefined;
}

/**
 * Returns the secret the client must send as Basic password or Bearer token (username ignored).
 */
export function extractClientGatewayCredential(authHeader: string | undefined): string | undefined {
  if (!authHeader) {
    return undefined;
  }
  const trimmed = authHeader.trim();
  const lower = trimmed.toLowerCase();
  if (lower.startsWith("bearer ")) {
    const t = trimmed.slice(7).trim();
    return t || undefined;
  }
  if (lower.startsWith("basic ")) {
    const b64 = trimmed.slice(6).trim();
    try {
      const decoded = Buffer.from(b64, "base64").toString("utf8");
      const idx = decoded.indexOf(":");
      const password = idx === -1 ? decoded : decoded.slice(idx + 1);
      return password || undefined;
    } catch {
      return undefined;
    }
  }
  return undefined;
}

export const WEBDAV_UNAUTHORIZED: HandlerResult = {
  status: 401,
  headers: {
    "WWW-Authenticate": `Basic realm="${BASIC_REALM}", charset="UTF-8"`,
    "Content-Type": "text/plain; charset=utf-8",
  },
  body: "Unauthorized",
};

export function webDavAuthMisconfigured(detail: string): HandlerResult {
  return {
    status: 503,
    headers: { "Content-Type": "text/plain; charset=utf-8" },
    body: `WebDAV authentication unavailable: ${detail}`,
  };
}
