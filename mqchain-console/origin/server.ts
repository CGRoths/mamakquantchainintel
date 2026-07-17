import { randomUUID } from "node:crypto";
import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";

import { compare } from "bcryptjs";
import { eq, sql } from "drizzle-orm";

import { closeDb, getDb } from "../src/db/client";
import { mqUsers } from "../src/db/schema";

const SERVICE_NAME = "mqchain-origin";
const API_VERSION = "v1";
const MAX_BODY_BYTES = 16 * 1024;

const host = process.env.MQCHAIN_ORIGIN_HOST ?? "127.0.0.1";
const port = Number.parseInt(
  process.env.MQCHAIN_ORIGIN_PORT ?? "8020",
  10,
);

if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error("MQCHAIN_ORIGIN_PORT must be a valid TCP port.");
}

type JsonObject = Record<string, unknown>;

class HttpError extends Error {
  constructor(
    readonly statusCode: number,
    message: string,
  ) {
    super(message);
    this.name = "HttpError";
  }
}

function sendJson(
  response: ServerResponse,
  statusCode: number,
  payload: JsonObject,
): void {
  response.statusCode = statusCode;
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.setHeader("Cache-Control", "no-store");
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.end(JSON.stringify(payload));
}

async function readJsonBody(
  request: IncomingMessage,
): Promise<JsonObject> {
  const chunks: Buffer[] = [];
  let totalBytes = 0;

  return await new Promise<JsonObject>((resolve, reject) => {
    request.on("data", (chunk: Buffer) => {
      totalBytes += chunk.length;

      if (totalBytes <= MAX_BODY_BYTES) {
        chunks.push(chunk);
      }
    });

    request.on("end", () => {
      if (totalBytes > MAX_BODY_BYTES) {
        reject(new HttpError(413, "Request body is too large."));
        return;
      }

      const raw = Buffer.concat(chunks).toString("utf8").trim();

      if (!raw) {
        resolve({});
        return;
      }

      try {
        const parsed: unknown = JSON.parse(raw);

        if (
          typeof parsed !== "object" ||
          parsed === null ||
          Array.isArray(parsed)
        ) {
          reject(new HttpError(400, "JSON body must be an object."));
          return;
        }

        resolve(parsed as JsonObject);
      } catch {
        reject(new HttpError(400, "Invalid JSON body."));
      }
    });

    request.on("error", reject);
  });
}

async function databaseIsReachable(): Promise<boolean> {
  try {
    const db = getDb();
    await db.execute(sql`select 1 as ok`);
    return true;
  } catch (error) {
    console.error(
      JSON.stringify({
        level: "error",
        event: "database_health_failed",
        message:
          error instanceof Error ? error.message : "Unknown database error",
      }),
    );

    return false;
  }
}

const server = createServer(async (request, response) => {
  const startedAt = Date.now();
  const requestIdHeader = request.headers["x-mqchain-request-id"];

  const requestId =
    typeof requestIdHeader === "string" && requestIdHeader.length > 0
      ? requestIdHeader
      : randomUUID();

  response.setHeader("X-MQCHAIN-Request-Id", requestId);

  response.on("finish", () => {
    console.log(
      JSON.stringify({
        level: "info",
        event: "http_request",
        requestId,
        method: request.method ?? "UNKNOWN",
        path: request.url ?? "/",
        statusCode: response.statusCode,
        durationMs: Date.now() - startedAt,
      }),
    );
  });

  try {
    const method = request.method ?? "GET";

    const requestUrl = new URL(
      request.url ?? "/",
      `http://${request.headers.host ?? `${host}:${port}`}`,
    );

    const pathname = requestUrl.pathname;

    if (method === "GET" && pathname === "/v1/health") {
      const databaseReachable = await databaseIsReachable();

      sendJson(response, databaseReachable ? 200 : 503, {
        status: databaseReachable ? "ok" : "degraded",
        service: SERVICE_NAME,
        environment: process.env.MQCHAIN_ORIGIN_ENV ?? "unknown",
        database: databaseReachable ? "reachable" : "unreachable",
      });

      return;
    }

    if (method === "GET" && pathname === "/v1/ready") {
      const databaseReachable = await databaseIsReachable();

      sendJson(response, databaseReachable ? 200 : 503, {
        ready: databaseReachable,
        service: SERVICE_NAME,
        database: databaseReachable ? "reachable" : "unreachable",
      });

      return;
    }

    if (method === "GET" && pathname === "/v1/version") {
      sendJson(response, 200, {
        service: SERVICE_NAME,
        apiVersion: API_VERSION,
        applicationVersion: "0.1.0",
      });

      return;
    }

    if (
      method === "POST" &&
      pathname === "/v1/auth/credentials"
    ) {
      const body = await readJsonBody(request);

      const email =
        typeof body.email === "string"
          ? body.email.trim().toLowerCase()
          : "";

      const password =
        typeof body.password === "string"
          ? body.password
          : "";

      if (
        !email ||
        !password ||
        email.length > 320 ||
        password.length > 1024
      ) {
        throw new HttpError(
          400,
          "A valid email and password are required.",
        );
      }

      const db = getDb();

      const [user] = await db
        .select({
          id: mqUsers.id,
          email: mqUsers.email,
          displayName: mqUsers.displayName,
          passwordHash: mqUsers.passwordHash,
          role: mqUsers.role,
          isActive: mqUsers.isActive,
        })
        .from(mqUsers)
        .where(eq(mqUsers.email, email))
        .limit(1);

      const passwordMatches =
        user?.passwordHash
          ? await compare(password, user.passwordHash)
          : false;

      if (
        !user ||
        !user.isActive ||
        !passwordMatches
      ) {
        throw new HttpError(401, "Invalid credentials.");
      }

      sendJson(response, 200, {
        id: user.id,
        email: user.email,
        name: user.displayName,
        role: user.role,
      });

      return;
    }

    throw new HttpError(404, "Route not found.");
  } catch (error) {
    const statusCode =
      error instanceof HttpError
        ? error.statusCode
        : 500;

    const publicMessage =
      error instanceof HttpError
        ? error.message
        : "Internal server error.";

    if (statusCode >= 500) {
      console.error(
        JSON.stringify({
          level: "error",
          event: "request_failed",
          requestId,
          message:
            error instanceof Error
              ? error.message
              : "Unknown server error",
        }),
      );
    }

    sendJson(response, statusCode, {
      error: publicMessage,
      requestId,
    });
  }
});

server.on("error", (error: NodeJS.ErrnoException) => {
  if (error.code === "EADDRINUSE") {
    console.error(
      `Port ${port} is already in use. Check the existing listener before restarting MQCHAIN Origin.`,
    );
  } else {
    console.error(error);
  }

  process.exit(1);
});

server.listen(port, host, () => {
  console.log(
    JSON.stringify({
      level: "info",
      event: "origin_started",
      service: SERVICE_NAME,
      url: `http://${host}:${port}`,
      environment:
        process.env.MQCHAIN_ORIGIN_ENV ?? "unknown",
    }),
  );
});

let shuttingDown = false;

async function shutdown(signal: string): Promise<void> {
  if (shuttingDown) {
    return;
  }

  shuttingDown = true;

  console.log(
    JSON.stringify({
      level: "info",
      event: "origin_shutdown",
      signal,
    }),
  );

  const forceExitTimer = setTimeout(() => {
    process.exit(1);
  }, 10_000);

  forceExitTimer.unref();

  server.close(() => {
    void closeDb().finally(() => {
      clearTimeout(forceExitTimer);
      process.exit(0);
    });
  });
}

process.on("SIGINT", () => {
  void shutdown("SIGINT");
});

process.on("SIGTERM", () => {
  void shutdown("SIGTERM");
});
