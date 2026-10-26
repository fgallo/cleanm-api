import type { AddressInfo } from "node:net";

import { app } from "./app.ts";
import { config } from "./config.ts";
import { pool } from "./db/pool.ts";
import { closeBrowser } from "./invoices/pdf/render.ts";

const server = app.listen(config.port, () => {
  const { port } = server.address() as AddressInfo;
  console.log(`Server listening on http://localhost:${port}`);
});

// Hosts send SIGTERM on every deploy and when scaling down; Ctrl-C sends
// SIGINT. Stop taking connections, let the requests in flight finish, then
// release Chromium and the database connections, so no response is cut off
// and nothing is left behind. Whatever still runs after the grace period is
// dropped: the host would kill the process at that point anyway. A second
// signal exits at once, since the handlers run only once.
const gracePeriodMs = 10_000;

function shutdown(signal: NodeJS.Signals): void {
  console.log(`${signal} received, shutting down`);
  const deadline = setTimeout(() => {
    console.error("Shutdown took too long, exiting");
    process.exit(1);
  }, gracePeriodMs);
  // Does not keep the process alive on its own: once everything is closed,
  // the process ends by itself.
  deadline.unref();

  server.close((error) => {
    void (async () => {
      try {
        if (error !== undefined) {
          throw error;
        }
        await closeBrowser();
        await pool.end();
      } catch (failure) {
        console.error(failure);
        process.exitCode = 1;
      } finally {
        clearTimeout(deadline);
      }
    })();
  });
}

process.once("SIGTERM", shutdown);
process.once("SIGINT", shutdown);
