import { unstable_cache } from "next/cache";
import { desc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { contests } from "@/db/schema";

// Only public scheduling metadata is shared. Problem releases, identity, and
// submission deadlines continue to be checked on the server for each request.
const readCatalog = unstable_cache(
  async () => getDb().select().from(contests)
    .where(eq(contests.status, "scheduled")).orderBy(desc(contests.startsAt)),
  ["public-contest-catalog"],
  { revalidate: 30, tags: ["contests"] },
);

export async function getContestCatalog() {
  const rows = await readCatalog();
  // The persistent Next cache uses JSON; restore dates after both hits and misses.
  return rows.map(row => ({ ...row, startsAt: new Date(row.startsAt), endsAt: new Date(row.endsAt) }));
}
