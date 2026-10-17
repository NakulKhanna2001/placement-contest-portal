import { and, eq } from "drizzle-orm";
import type { Db } from "@/db";
import { batches, disqualifications, problems, solves, users } from "@/db/schema";
import { rankLeaderboard } from "@/lib/ranking";
export async function getLeaderboard(db: Db, contestId: number) {
  const [rows, dq] = await Promise.all([
    db.select({ userId: solves.userId, name: users.name, campus: users.campus, studyYear: users.studyYear, points: solves.points, difficulty: problems.difficulty, acceptedAt: solves.acceptedAt }).from(solves)
      .innerJoin(users, eq(solves.userId, users.id)).innerJoin(problems, eq(solves.problemId, problems.id)).innerJoin(batches, eq(problems.batchId, batches.id))
      .where(and(eq(batches.contestId, contestId), eq(solves.status, "valid"))),
    db.select().from(disqualifications).where(eq(disqualifications.contestId, contestId)),
  ]);
  const profiles = new Map(rows.map(r => [r.userId, { name: r.name, campus: r.campus, studyYear: r.studyYear }]));
  return rankLeaderboard(rows, new Set(dq.map(d => d.userId))).map(r => ({ ...r, ...profiles.get(r.userId)! }));
}
