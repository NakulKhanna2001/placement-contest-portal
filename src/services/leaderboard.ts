import { and, asc, eq } from "drizzle-orm";
import type { Db } from "@/db";
import { batches, contests, disqualifications, problems, solves, users } from "@/db/schema";
import { rankLeaderboard } from "@/lib/ranking";
import { HttpError } from "@/lib/errors";
import type { ProblemColumn, ProblemSolve } from "@/lib/leaderboard-details";
import { canPreviewProblems, getBatchOpenings } from "./batch-access";

async function readLeaderboard(db: Db, contestId: number) {
  const [rows, dq] = await Promise.all([
    db.select({ userId: solves.userId, name: users.name, campus: users.campus, studyYear: users.studyYear, points: solves.points, difficulty: problems.difficulty, acceptedAt: solves.acceptedAt, verifiedAt: solves.verifiedAt, problemId: solves.problemId, multiplier: solves.multiplier, source: solves.source }).from(solves)
      .innerJoin(users, eq(solves.userId, users.id)).innerJoin(problems, eq(solves.problemId, problems.id)).innerJoin(batches, eq(problems.batchId, batches.id))
      .where(and(eq(batches.contestId, contestId), eq(solves.status, "valid"))),
    db.select().from(disqualifications).where(eq(disqualifications.contestId, contestId)),
  ]);
  const profiles = new Map(rows.map(r => [r.userId, { name: r.name, campus: r.campus, studyYear: r.studyYear }]));
  const board = rankLeaderboard(rows, new Set(dq.map(d => d.userId))).map(r => ({ ...r, ...profiles.get(r.userId)! }));
  return { board, rows };
}

export async function getLeaderboard(db: Db, contestId: number) {
  return (await readLeaderboard(db, contestId)).board;
}

export async function getLeaderboardDetails(db: Db, contestId: number, viewerId: number, now: Date) {
  const [contest] = await db.select().from(contests).where(eq(contests.id, contestId));
  if (!contest || contest.status === "draft") throw new HttpError(404, "Contest not found.");
  const [standing, list, openings, adminPreview] = await Promise.all([
    readLeaderboard(db, contestId),
    db.select({ problem: problems, batchId: batches.id, position: batches.position }).from(problems)
      .innerJoin(batches, eq(problems.batchId, batches.id)).where(eq(batches.contestId, contestId))
      .orderBy(asc(batches.position), asc(problems.id)),
    getBatchOpenings(db, contestId, viewerId, now),
    canPreviewProblems(db, viewerId),
  ]);
  const slots = new Map<number, number>();
  const columns: ProblemColumn[] = list.map(({ problem, batchId, position }) => {
    const index = slots.get(position) ?? 0;
    slots.set(position, index + 1);
    const opensAt = openings.get(batchId);
    return {
      id: problem.id, label: `B${position + 1}.${String.fromCharCode(65 + index)}`, batchPosition: position,
      // Redact on the server: early access belongs to the requesting student.
      problem: adminPreview || (opensAt && opensAt <= now) ? { title: problem.title, slug: problem.slug, difficulty: problem.difficulty, points: problem.points } : null,
    };
  });
  const byStudent = new Map<number, ProblemSolve[]>();
  for (const solve of standing.rows) {
    const list = byStudent.get(solve.userId) ?? [];
    list.push({ problemId: solve.problemId, points: solve.points, multiplier: solve.multiplier, source: solve.source, acceptedAt: solve.acceptedAt.toISOString(), verifiedAt: solve.verifiedAt.toISOString() });
    byStudent.set(solve.userId, list);
  }
  const board = contest.startsAt > now ? [] : standing.board.map(row => ({ ...row, solves: byStudent.get(row.userId) ?? [] }));
  return { board, problems: columns, startsAt: contest.startsAt.toISOString() };
}
