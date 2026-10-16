import { drizzle } from "drizzle-orm/postgres-js";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import postgres from "postgres";
import * as schema from "./schema";
export type Db = PgDatabase<PgQueryResultHKT, typeof schema>;
let cached: Db | undefined;
export function getDb(): Db {
  if (!cached) {
    if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not set");
    cached = drizzle(postgres(process.env.DATABASE_URL, { max: 5, prepare: false }), { schema });
  }
  return cached;
}
