/**
 * Runs litmus WebDAV conformance tests against the standalone server.
 * Usage: npm run test:conformance
 */
import { spawn, execSync } from "node:child_process";
import * as http from "node:http";

const PORT = 8765;
const BASE_URL = `http://127.0.0.1:${PORT}`;

function waitForServer(url: string, maxWaitMs = 5000): Promise<void> {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    function attempt() {
      http
        .get(url, (res) => {
          res.resume();
          resolve();
        })
        .on("error", () => {
          if (Date.now() - start > maxWaitMs) {
            reject(new Error(`Server did not start within ${maxWaitMs}ms`));
          } else {
            setTimeout(attempt, 200);
          }
        });
    }
    attempt();
  });
}

async function main() {
  // Start the conformance server
  const server = spawn("node", ["--import", "tsx/esm", ".conformance/server.ts"], {
    stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env, PORT: String(PORT) },
  });

  server.stdout?.on("data", (d: Buffer) => process.stdout.write(d));
  server.stderr?.on("data", (d: Buffer) => process.stderr.write(d));

  try {
    await waitForServer(`${BASE_URL}/`);
    console.log("\nServer ready. Running litmus...\n");

    const litmusResult = execSync(`TESTS="basic copymove props locks" litmus ${BASE_URL}/`, {
      stdio: "inherit",
      timeout: 120_000,
    });
    void litmusResult;
    console.log("\nlitmus conformance tests completed.");
  } catch (err) {
    const exitCode = (err as NodeJS.ErrnoException & { status?: number }).status ?? 1;
    console.error("\nlitmus tests failed or errored.");
    process.exitCode = exitCode;
  } finally {
    server.kill("SIGTERM");
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
