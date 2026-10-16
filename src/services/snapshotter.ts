import { and, eq, isNotNull, isNull, lte, or } from "drizzle-orm";
import type { Db } from "@/db";
import { seenSubmissions, users } from "@/db/schema";
import type { LeetCodeClient } from "@/leetcode/client";
import { findContestForSubmission } from "./contest";
export async function snapshotAll(db: Db, client: LeetCodeClient, now: Date) {
  const result = { users: 0, stored: 0, failed: 0 };
  // Include grace so the final minute's accepted submissions get a final snapshot.
  const contest = await findContestForSubmission(db, now);
  if (!contest) return result;
  const linked = await db.select().from(users).where(and(isNotNull(users.leetcodeUsername), isNotNull(users.leetcodeVerifiedAt), lte(users.leetcodeVerifiedAt, contest.startsAt)));
  // Four workers bound upstream load and avoid serial timeouts exhausting the cron budget.
  let cursor = 0;
  await Promise.all(Array.from({ length: Math.min(4, linked.length) }, async () => {
    while (cursor < linked.length) {
      const u = linked[cursor++];
      const claimed = await db.update(users).set({ nextSnapshotAt: new Date(+now + (270 + u.id % 25) * 1000) }).where(and(eq(users.id, u.id), or(isNull(users.nextSnapshotAt), lte(users.nextSnapshotAt, now)))).returning();
      if (!claimed.length) continue;
      result.users++;
      try {
        const list = await client.recentAccepted(u.leetcodeUsername!);
        if (list.length) {
          const inserted = await db.insert(seenSubmissions).values(list.map(s => ({ userId: u.id, submissionId: s.id, slug: s.slug, acceptedAt: s.acceptedAt, firstSeenAt: now }))).onConflictDoNothing().returning();
          result.stored += inserted.length;
        }
      } catch { result.failed++; }
    }
  }));
  return result;
}
