import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import * as schema from "./schema";

let sqlClient: postgres.Sql | null = null;
let dbClient: PostgresJsDatabase<typeof schema> | null = null;

export function getDatabaseUrl() {
  return process.env.DATABASE_URL;
}

export function getDb() {
  const databaseUrl = getDatabaseUrl();

  if (!databaseUrl) {
    throw new Error("DATABASE_URL is not configured. Copy .env.example to .env.local and run the database setup.");
  }

  if (!sqlClient) {
    sqlClient = postgres(databaseUrl, { max: 5, prepare: false });
  }

  if (!dbClient) {
    dbClient = drizzle(sqlClient, { schema });
  }

  return dbClient;
}

export async function closeDb() {
  if (sqlClient) {
    await sqlClient.end();
  }
  sqlClient = null;
  dbClient = null;
}
