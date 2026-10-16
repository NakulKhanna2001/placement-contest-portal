import { and, eq } from "drizzle-orm";
import type { Db } from "@/db";
import { batches, disqualifications, problems, solves, users } from "@/db/schema";
import { rankLeaderboard } from "@/lib/ranking";
export async function getLeaderboard(db: Db, contestId: number) {
  const [rows, dq] = await Promise.all([
    db.select({ userId: solves.userId, name: users.name, points: solves.points, difficulty: problems.difficulty, acceptedAt: solves.acceptedAt }).from(solves)
      .innerJoin(users, eq(solves.userId, users.id)).innerJoin(problems, eq(solves.problemId, problems.id)).innerJoin(batches, eq(problems.batchId, batches.id))
      .where(and(eq(batches.contestId, contestId), eq(solves.status, "valid"))),
    db.select().from(disqualifications).where(eq(disqualifications.contestId, contestId)),
  ]);
  const names = new Map(rows.map(r => [r.userId, r.name]));
  return rankLeaderboard(rows, new Set(dq.map(d => d.userId))).map(r => ({ ...r, name: names.get(r.userId) ?? "Student" }));
}
