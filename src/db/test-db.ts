import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import * as schema from "./schema";
import type { Db } from "./index";
const clients: PGlite[] = [];
export async function createTestDb(): Promise<Db> {
  const client = new PGlite();
  clients.push(client);
  const db = drizzle(client, { schema });
  await migrate(db, { migrationsFolder: "drizzle" });
  return db;
}
export async function closeTestDbs() {
  await Promise.all(clients.splice(0).map(client => client.close()));
}
