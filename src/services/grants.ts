import { and, asc, eq } from "drizzle-orm";
import type { Db } from "@/db";
import { batches, contests, problems, solves, users } from "@/db/schema";
import { scoreSolve } from "@/lib/scoring";
import { solveDeadline } from "@/lib/contest-timing";
import { proofUrl, text } from "@/lib/validation";
import { requireAdmin, writeAudit } from "./audit";
import { getBatchOpenings } from "./batch-access";
export type GrantResult = { ok: true; solveId: number; points: number; multiplier: number } | { ok: false; reason: "problem_not_found" | "user_not_found" | "outside_window" | "already_solved" | "invalid_evidence" };
export async function grantSolve(db: Db, input: { adminId: number; userId: number; problemId: number; acceptedAt: Date; reason: string; evidence: string; now: Date }): Promise<GrantResult> {
  return db.transaction(async tx => {
    await requireAdmin(tx, input.adminId);
    if (!proofUrl.safeParse(input.evidence).success || !text.safeParse(input.reason).success) return { ok: false, reason: "invalid_evidence" };
    const [user] = await tx.select().from(users).where(eq(users.id, input.userId)).for("update");
    if (!user) return { ok: false, reason: "user_not_found" };
    const [row] = await tx.select({ problem: problems, batch: batches, contest: contests }).from(problems).innerJoin(batches, eq(problems.batchId, batches.id)).innerJoin(contests, eq(batches.contestId, contests.id)).where(eq(problems.id, input.problemId));
    if (!row || row.contest.status === "draft") return { ok: false, reason: "problem_not_found" };
    const opensAt = input.acceptedAt < row.batch.unlockAt
      ? (await getBatchOpenings(tx, row.contest.id, user.id, input.now)).get(row.batch.id) ?? row.batch.unlockAt
      : row.batch.unlockAt;
    const score = scoreSolve({ basePoints: row.problem.points, opensAt, unlockAt: row.batch.unlockAt, closesAt: solveDeadline(row.contest), acceptedAt: input.acceptedAt, bonusWindowSeconds: row.contest.bonusWindowSeconds, bonusMultiplier: row.contest.bonusMultiplier });
    if (!score.ok || input.acceptedAt > input.now) return { ok: false, reason: "outside_window" };
    const [existing] = await tx.select().from(solves).where(and(eq(solves.userId, user.id), eq(solves.problemId, input.problemId)));
    if (existing?.status === "valid") return { ok: false, reason: "already_solved" };
    const values = { userId: user.id, problemId: input.problemId, submissionId: null, acceptedAt: input.acceptedAt, verifiedAt: input.now, points: score.points, multiplier: score.multiplier, source: "manual" as const, grantedBy: input.adminId, evidence: input.evidence, status: "valid" as const };
    const [saved] = existing ? await tx.update(solves).set(values).where(eq(solves.id, existing.id)).returning() : await tx.insert(solves).values(values).returning();
    await writeAudit(tx, { actorId: input.adminId, action: "grant_solve", target: `solve:${saved.id}`, details: JSON.stringify({ reason: input.reason, before: existing ?? null, after: saved }), now: input.now });
    return { ok: true, solveId: saved.id, points: score.points, multiplier: score.multiplier };
  });
}
export async function revokeSolve(db: Db, input: { adminId: number; solveId: number; reason: string; now: Date }) {
  return db.transaction(async tx => {
    await requireAdmin(tx, input.adminId);
    text.parse(input.reason);
    const [s] = await tx.select().from(solves).where(eq(solves.id, input.solveId));
    if (!s) return false;
    await tx.select().from(users).where(eq(users.id, s.userId)).for("update");
    const [before] = await tx.select().from(solves).where(eq(solves.id, s.id));
    if (before.status !== "valid") return false;
    await tx.update(solves).set({ status: "revoked" }).where(eq(solves.id, s.id));
    await writeAudit(tx, { actorId: input.adminId, action: "revoke_solve", target: `solve:${s.id}`, details: JSON.stringify({ reason: input.reason, before }), now: input.now });
    return true;
  });
}
export async function rescoreContest(db: Db, input: { adminId: number; contestId: number; reason: string; now: Date }) {
  return db.transaction(async tx => {
    await requireAdmin(tx, input.adminId); text.parse(input.reason);
    const [contest] = await tx.select().from(contests).where(eq(contests.id, input.contestId));
    if (!contest) throw new Error("Contest not found");
    const rows = await tx.select({ solve: solves, problem: problems, batch: batches }).from(solves).innerJoin(problems, eq(solves.problemId, problems.id)).innerJoin(batches, eq(problems.batchId, batches.id)).where(and(eq(batches.contestId, contest.id), eq(solves.status, "valid"))).orderBy(asc(batches.position), asc(solves.id)).for("update", { of: solves });
    for (const row of rows) {
      const opensAt = row.solve.acceptedAt < row.batch.unlockAt
        ? (await getBatchOpenings(tx, contest.id, row.solve.userId, input.now)).get(row.batch.id) ?? row.batch.unlockAt
        : row.batch.unlockAt;
      const score = scoreSolve({ basePoints: row.problem.points, opensAt, unlockAt: row.batch.unlockAt, closesAt: solveDeadline(contest), acceptedAt: row.solve.acceptedAt, bonusWindowSeconds: contest.bonusWindowSeconds, bonusMultiplier: contest.bonusMultiplier });
      await tx.update(solves).set(score.ok ? { points: score.points, multiplier: score.multiplier } : { status: "revoked" }).where(eq(solves.id, row.solve.id));
    }
    await writeAudit(tx, { actorId: input.adminId, action: "rescore_contest", target: `contest:${contest.id}`, details: JSON.stringify({ reason: input.reason, before: rows.map(r => r.solve) }), now: input.now });
    return rows.length;
  });
}
