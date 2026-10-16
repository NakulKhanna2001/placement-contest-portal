import { and, eq } from "drizzle-orm";
import { z } from "zod";
import type { Db } from "@/db";
import { batches, contests, disqualifications, problems, reports, solves, users } from "@/db/schema";
import { id, proofUrl, text } from "@/lib/validation";
import { requireAdmin, writeAudit } from "./audit";
export type ReportResult = { ok: true; reportId: number } | { ok: false; reason: "contest_not_ended" | "self_report" | "no_proof" | "duplicate" | "invalid_target" };
export async function fileReport(db: Db, input: { contestId: number; reporterId: number; targetUserId: number; problemId: number | null; proofUrl: string; description: string; now: Date }): Promise<ReportResult> {
  const [contest] = await db.select().from(contests).where(eq(contests.id, input.contestId));
  if (!contest || contest.status === "draft" || input.now <= contest.endsAt) return { ok: false, reason: "contest_not_ended" };
  if (input.reporterId === input.targetUserId) return { ok: false, reason: "self_report" };
  if (!proofUrl.safeParse(input.proofUrl).success || !text.safeParse(input.description).success) return { ok: false, reason: "no_proof" };
  const targetSolves = await db.select({ problemId: solves.problemId }).from(solves).innerJoin(problems, eq(solves.problemId, problems.id)).innerJoin(batches, eq(problems.batchId, batches.id)).where(and(eq(batches.contestId, contest.id), eq(solves.userId, input.targetUserId)));
  if (!targetSolves.length || (input.problemId !== null && !targetSolves.some(s => s.problemId === input.problemId))) return { ok: false, reason: "invalid_target" };
  const { now, ...values } = input;
  const [r] = await db.insert(reports).values({ ...values, createdAt: now }).onConflictDoNothing().returning();
  return r ? { ok: true, reportId: r.id } : { ok: false, reason: "duplicate" };
}
export const decisionSchema = z.discriminatedUnion("kind", [z.object({ kind: z.literal("dismiss") }), z.object({ kind: z.literal("revoke_solve"), solveId: id }), z.object({ kind: z.literal("disqualify"), reason: text })]);
export type Decision = z.infer<typeof decisionSchema>;
export async function reviewReport(db: Db, input: { adminId: number; reportId: number; decision: Decision; now: Date }): Promise<boolean> {
  const decision = decisionSchema.parse(input.decision);
  return db.transaction(async tx => {
    await requireAdmin(tx, input.adminId);
    const [rep] = await tx.select().from(reports).where(eq(reports.id, input.reportId)).for("update");
    if (!rep || rep.status !== "pending") return false;
    await tx.select().from(users).where(eq(users.id, rep.targetUserId)).for("update");
    let before: typeof solves.$inferSelect | undefined;
    if (decision.kind === "revoke_solve") {
      const [row] = await tx.select({ solve: solves, contestId: batches.contestId }).from(solves).innerJoin(problems, eq(solves.problemId, problems.id)).innerJoin(batches, eq(problems.batchId, batches.id)).where(eq(solves.id, decision.solveId));
      if (!row || row.solve.userId !== rep.targetUserId || row.contestId !== rep.contestId || (rep.problemId !== null && row.solve.problemId !== rep.problemId) || row.solve.status !== "valid") return false;
      before = row.solve;
      await tx.update(solves).set({ status: "revoked" }).where(eq(solves.id, decision.solveId));
    }
    if (decision.kind === "disqualify") await tx.insert(disqualifications).values({ contestId: rep.contestId, userId: rep.targetUserId, reportId: rep.id, reason: decision.reason, createdBy: input.adminId }).onConflictDoNothing();
    await tx.update(reports).set({ status: decision.kind === "dismiss" ? "dismissed" : "upheld", reviewedBy: input.adminId, reviewedAt: input.now }).where(eq(reports.id, rep.id));
    const action = decision.kind === "dismiss" ? "report_dismissed" : decision.kind === "revoke_solve" ? "report_upheld_revoke" : "report_upheld_disqualify";
    await writeAudit(tx, { actorId: input.adminId, action, target: `report:${rep.id}`, details: JSON.stringify({ decision, before }), now: input.now });
    return true;
  });
}
