import { and, eq, lte } from "drizzle-orm";
import type { Db } from "@/db";
import { batches, contests, problems, solves, users } from "@/db/schema";
import { personalBatchOpenings } from "@/lib/batch-access";

// Read-only preview privilege. Never use this to authorize a scored submission.
export async function canPreviewProblems(db: Db, userId?: number) {
  if (userId === undefined) return false;
  const [user] = await db.select({ role: users.role }).from(users).where(eq(users.id, userId));
  return user?.role === "admin";
}

export async function getBatchOpenings(db: Db, contestId: number, userId: number, now: Date) {
  const progress = await db.select({
    id: batches.id, position: batches.position, unlockAt: batches.unlockAt, startsAt: contests.startsAt,
    problemId: problems.id, acceptedAt: solves.acceptedAt,
  }).from(batches).innerJoin(contests, eq(batches.contestId, contests.id))
    .leftJoin(problems, eq(problems.batchId, batches.id))
    .leftJoin(solves, and(eq(solves.problemId, problems.id), eq(solves.userId, userId), eq(solves.status, "valid"), lte(solves.acceptedAt, now), lte(solves.verifiedAt, now)))
    .where(and(eq(contests.id, contestId), eq(contests.status, "scheduled"), lte(contests.startsAt, now)));
  return personalBatchOpenings(progress);
}
