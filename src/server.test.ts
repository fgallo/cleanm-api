import { spawn } from "node:child_process";
import type { ChildProcess } from "node:child_process";
import { once } from "node:events";

import { describe, expect, it } from "vitest";

type Server = { child: ChildProcess; port: number; output: () => string };

// The server runs as its own process, as in production, so the signal
// handling under test is the real thing. PORT=0 takes a free port, printed
// in the first line of output.
async function startServer(): Promise<Server> {
  const child = spawn(process.execPath, ["src/server.ts"], {
    env: { ...process.env, PORT: "0" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let output = "";
  const port = await new Promise<number>((resolve, reject) => {
    for (const stream of [child.stdout, child.stderr]) {
      stream?.on("data", (chunk: Buffer) => {
        output += chunk.toString();
        const match = /localhost:(\d+)/.exec(output);
        if (match !== null) {
          resolve(Number(match[1]));
        }
      });
    }
    child.once("exit", (code) => {
      reject(new Error(`Server exited with code ${code}: ${output}`));
    });
  });
  return { child, port, output: () => output };
}

describe("shutdown", () => {
  it("exits cleanly on SIGTERM and stops listening", async () => {
    const { child, port, output } = await startServer();
    const url = `http://localhost:${port}/health`;
    expect((await fetch(url)).status).toBe(200);

    const started = Date.now();
    child.kill("SIGTERM");
    const [code, signal] = (await once(child, "exit")) as [
      number | null,
      NodeJS.Signals | null,
    ];

    expect({ code, signal }).toEqual({ code: 0, signal: null });
    // Well within the grace period: nothing was left open.
    expect(Date.now() - started).toBeLessThan(5000);
    expect(output()).toContain("SIGTERM received, shutting down");
    await expect(fetch(url)).rejects.toThrow();
  });
});
