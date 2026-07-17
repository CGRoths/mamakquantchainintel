import { createServer } from "node:http";

import { closeDb } from "../src/db/client";
import { handleOriginRequest } from "./app";

const host = process.env.MQCHAIN_ORIGIN_HOST ?? "127.0.0.1";
const port = Number.parseInt(process.env.MQCHAIN_ORIGIN_PORT ?? "8020", 10);

if (!Number.isInteger(port) || port < 1 || port > 65_535) {
  throw new Error("MQCHAIN_ORIGIN_PORT must be a valid TCP port.");
}

const server = createServer((request, response) => {
  void handleOriginRequest(request, response);
});

server.on("error", (error: NodeJS.ErrnoException) => {
  console.error(error.code === "EADDRINUSE" ? `Port ${port} is already in use.` : error);
  process.exit(1);
});

server.listen(port, host, () => {
  console.log(JSON.stringify({ level: "info", event: "origin_started", service: "mqchain-origin", url: `http://${host}:${port}`, environment: process.env.MQCHAIN_ORIGIN_ENV ?? "unknown" }));
});

let shuttingDown = false;
async function shutdown(signal: string) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(JSON.stringify({ level: "info", event: "origin_shutdown", signal }));
  const timer = setTimeout(() => process.exit(1), 10_000);
  timer.unref();
  server.close(() => void closeDb().finally(() => { clearTimeout(timer); process.exit(0); }));
}

process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));
