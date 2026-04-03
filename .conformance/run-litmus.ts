/**
 * Runs litmus WebDAV conformance tests.
 *
 * Default: starts `.conformance/server.ts` on 127.0.0.1:8765 and runs litmus (no auth).
 *
 * Remote OpenClaw (or any WebDAV URL):
 *   WEBDAV_CONFORMANCE_URL=https://gateway.example/webdav/ pnpm run test:conformance
 *
 * HTTP Basic (litmus passes URL then USERNAME PASSWORD; OpenClaw ignores the username):
 *   WEBDAV_CONFORMANCE_URL=... WEBDAV_CONFORMANCE_PASSWORD='secret' pnpm run test:conformance
 *   WEBDAV_CONFORMANCE_USER=any   # optional, default "x"
 */
import { spawn, spawnSync } from "node:child_process";
import * as http from "node:http";
import * as https from "node:https";

const PORT = 8765;
const LOCAL_BASE_URL = `http://127.0.0.1:${PORT}`;

function normalizeBaseUrl(raw: string): string {
  const t = raw.trim();
  return t.endsWith("/") ? t : `${t}/`;
}

function basicAuthHeader(user: string, password: string): Record<string, string> {
  const token = Buffer.from(`${user}:${password}`, "utf-8").toString("base64");
  return { Authorization: `Basic ${token}` };
}

function waitForServer(
  url: string,
  maxWaitMs = 15_000,
  auth?: { user: string; password: string },
): Promise<void> {
  const headers: Record<string, string> = auth ? basicAuthHeader(auth.user, auth.password) : {};
  const client = url.startsWith("https:") ? https : http;

  return new Promise((resolve, reject) => {
    const start = Date.now();
    function attempt() {
      const req = client.get(url, { headers }, (res) => {
        res.resume();
        resolve();
      });
      req.on("error", () => {
        if (Date.now() - start > maxWaitMs) {
          reject(new Error(`Server did not respond within ${maxWaitMs}ms at ${url}`));
        } else {
          setTimeout(attempt, 200);
        }
      });
    }
    attempt();
  });
}

function readConformanceTarget(): {
  baseUrl: string;
  remote: boolean;
  litmusUser?: string;
  litmusPassword?: string;
} {
  const remoteRaw = process.env.WEBDAV_CONFORMANCE_URL?.trim();
  if (remoteRaw) {
    const password = process.env.WEBDAV_CONFORMANCE_PASSWORD?.trim();
    const user = (process.env.WEBDAV_CONFORMANCE_USER?.trim() || "x").trim();
    return {
      baseUrl: normalizeBaseUrl(remoteRaw),
      remote: true,
      litmusUser: password !== undefined && password !== "" ? user : undefined,
      litmusPassword: password !== undefined && password !== "" ? password : undefined,
    };
  }
  return { baseUrl: `${LOCAL_BASE_URL}/`, remote: false };
}

function runLitmus(baseUrl: string, user?: string, password?: string): number | null {
  const litmusArgs: string[] = [];
  if (user !== undefined && password !== undefined) {
    litmusArgs.push(baseUrl, user, password);
  } else {
    litmusArgs.push(baseUrl);
  }

  const result = spawnSync("litmus", litmusArgs, {
    stdio: "inherit",
    timeout: 120_000,
    env: { ...process.env, TESTS: process.env.TESTS ?? "basic copymove props locks" },
  });

  if (result.error) {
    throw result.error;
  }
  return result.status;
}

async function main() {
  const target = readConformanceTarget();
  let server: ReturnType<typeof spawn> | undefined;

  if (!target.remote) {
    server = spawn("node", ["--import", "tsx/esm", ".conformance/server.ts"], {
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env, PORT: String(PORT) },
    });
    server.stdout?.on("data", (d: Buffer) => process.stdout.write(d));
    server.stderr?.on("data", (d: Buffer) => process.stderr.write(d));
  }

  const auth =
    target.litmusUser !== undefined && target.litmusPassword !== undefined
      ? { user: target.litmusUser, password: target.litmusPassword }
      : undefined;

  try {
    await waitForServer(target.baseUrl, target.remote ? 15_000 : 5_000, auth);
    console.log(
      target.remote
        ? `\nEndpoint ready. Running litmus against ${target.baseUrl}...\n`
        : "\nServer ready. Running litmus...\n",
    );

    const status = runLitmus(target.baseUrl, target.litmusUser, target.litmusPassword);
    if (status !== 0) {
      console.error("\nlitmus tests failed or errored.");
      process.exitCode = status ?? 1;
    } else {
      console.log("\nlitmus conformance tests completed.");
    }
  } catch (err) {
    console.error("\nlitmus tests failed or errored.", err);
    process.exitCode = 1;
  } finally {
    server?.kill("SIGTERM");
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
