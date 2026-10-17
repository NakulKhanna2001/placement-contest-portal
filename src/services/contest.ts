import { and, asc, eq, inArray, lte, or, sql } from "drizzle-orm";
import type { Db } from "@/db";
import { batches, contests, problems, solves } from "@/db/schema";
import { DEFAULTS } from "@/lib/config";
import { FINAL_SOLVE_SECONDS, linkDeadline, solveDeadline } from "@/lib/contest-timing";
import { contestInput } from "@/lib/validation";
import type { Difficulty } from "@/lib/types";
import { requireAdmin, writeAudit } from "./audit";
import { HttpError } from "@/lib/errors";
import { canPreviewProblems, getBatchOpenings } from "./batch-access";
export interface ProblemInput { difficulty: Difficulty; slug: string; title: string }
export interface ContestInput { title: string; startsAt: Date; batches: ProblemInput[][]; status?: "draft" | "scheduled"; graceSeconds?: number; bonusWindowSeconds?: number; bonusMultiplier?: number }
export type ContestRow = typeof contests.$inferSelect;
export function contestPhase(c: ContestRow, now: Date) {
  if (c.status === "draft") return "draft";
  return now < c.startsAt ? "scheduled" : now <= solveDeadline(c) ? "live" : now <= linkDeadline(c) ? "grace" : "ended";
}
async function assertNoOverlap(db: Db, startsAt: Date, endsAt: Date, grace: number, exceptId = 0) {
  const [overlap] = await db.select().from(contests).where(and(eq(contests.status, "scheduled"), sql`${contests.id} <> ${exceptId}`, lte(contests.startsAt, linkDeadline({ endsAt, graceSeconds: grace })), sql`${contests.endsAt} + greatest(${contests.graceSeconds}, ${FINAL_SOLVE_SECONDS}) * interval '1 second' >= ${startsAt.toISOString()}::timestamptz`)).limit(1);
  if (overlap) throw new HttpError(409, "Contest overlaps another contest or its submission grace period.");
}
export async function createContest(db: Db, raw: ContestInput, actor?: { adminId: number; now: Date }): Promise<number> {
  const input = contestInput.parse(raw);
  const endsAt = new Date(+input.startsAt + input.batches.length * DEFAULTS.windowSeconds * 1000);
  const grace = input.graceSeconds ?? DEFAULTS.graceSeconds;
  return db.transaction(async tx => {
    if (actor) await requireAdmin(tx, actor.adminId);
    // Serialize scheduling so two admins cannot race the overlap check.
    await tx.execute(sql`LOCK TABLE contests IN SHARE ROW EXCLUSIVE MODE`);
    if (input.status === "scheduled") await assertNoOverlap(tx, input.startsAt, endsAt, grace);
    const [c] = await tx.insert(contests).values({ title: input.title, startsAt: input.startsAt, endsAt, status: input.status, graceSeconds: grace, bonusWindowSeconds: input.bonusWindowSeconds ?? DEFAULTS.bonusWindowSeconds, bonusMultiplier: input.bonusMultiplier ?? DEFAULTS.bonusMultiplier }).returning();
    for (const [position, list] of input.batches.entries()) {
      const unlockAt = new Date(+input.startsAt + position * 3600000);
      const [b] = await tx.insert(batches).values({ contestId: c.id, position, unlockAt, closesAt: new Date(+unlockAt + 3600000) }).returning();
      await tx.insert(problems).values(list.map(p => ({ ...p, batchId: b.id, points: DEFAULTS.points[p.difficulty] })));
    }
    if (actor) await writeAudit(tx, { actorId: actor.adminId, action: "create_contest", target: `contest:${c.id}`, now: actor.now });
    return c.id;
  });
}
export async function publishContest(db: Db, contestId: number, adminId: number, now: Date) {
  return db.transaction(async tx => {
    await requireAdmin(tx, adminId);
    await tx.execute(sql`LOCK TABLE contests IN SHARE ROW EXCLUSIVE MODE`);
    const [c] = await tx.select().from(contests).where(eq(contests.id, contestId));
    if (!c || c.status !== "draft" || c.startsAt <= now) return false;
    await assertNoOverlap(tx, c.startsAt, c.endsAt, c.graceSeconds, c.id);
    await tx.update(contests).set({ status: "scheduled", revision: c.revision + 1 }).where(eq(contests.id, c.id));
    await writeAudit(tx, { actorId: adminId, action: "publish_contest", target: `contest:${c.id}`, now });
    return true;
  });
}

export async function updateContest(db: Db, raw: ContestInput, actor: {
  adminId: number; contestId: number; revision: number; now: Date;
}): Promise<number> {
  const input = contestInput.parse(raw);
  const endsAt = new Date(+input.startsAt + input.batches.length * DEFAULTS.windowSeconds * 1000);
  return db.transaction(async tx => {
    await requireAdmin(tx, actor.adminId);
    // Use the same scheduling lock as create/publish for race-free overlap checks.
    await tx.execute(sql`LOCK TABLE contests IN SHARE ROW EXCLUSIVE MODE`);
    const [current] = await tx.select().from(contests).where(eq(contests.id, actor.contestId)).for("update");
    if (!current) throw new HttpError(404, "Contest not found.");
    if (current.status === "scheduled" && current.startsAt <= actor.now) throw new HttpError(409, "This contest has started and can no longer be edited.");
    if (current.revision !== actor.revision) throw new HttpError(409, "This contest changed since you opened it. Refresh the page and reopen the editor.");
    if (input.startsAt <= actor.now) throw new HttpError(400, "Choose a future start time.");
    const [hasSolve] = await tx.select({ id: solves.id }).from(solves)
      .innerJoin(problems, eq(solves.problemId, problems.id)).innerJoin(batches, eq(problems.batchId, batches.id))
      .where(eq(batches.contestId, current.id)).limit(1);
    if (hasSolve) throw new HttpError(409, "A contest with solve records cannot be edited.");
    const graceSeconds = input.graceSeconds ?? current.graceSeconds;
    const status = raw.status ?? current.status;
    if (status === "scheduled") await assertNoOverlap(tx, input.startsAt, endsAt, graceSeconds, current.id);

    const oldBatches = await tx.select().from(batches).where(eq(batches.contestId, current.id)).orderBy(asc(batches.position));
    const oldProblems = await tx.select({ problem: problems }).from(problems).innerJoin(batches, eq(problems.batchId, batches.id))
      .where(eq(batches.contestId, current.id)).orderBy(asc(problems.id));
    const [updated] = await tx.update(contests).set({
      title: input.title, startsAt: input.startsAt, endsAt, status,
      graceSeconds, bonusWindowSeconds: input.bonusWindowSeconds ?? current.bonusWindowSeconds,
      bonusMultiplier: input.bonusMultiplier ?? current.bonusMultiplier, revision: current.revision + 1,
    }).where(eq(contests.id, current.id)).returning();

    // Retain IDs for existing batch positions and difficulty slots. This keeps
    // links and administrative references stable when only content/timing changes.
    for (const [position, list] of input.batches.entries()) {
      const unlockAt = new Date(+input.startsAt + position * DEFAULTS.batchSpacingSeconds * 1000);
      const values = { contestId: current.id, position, unlockAt, closesAt: new Date(+unlockAt + DEFAULTS.windowSeconds * 1000) };
      const existing = oldBatches.find(b => b.position === position);
      const [savedBatch] = existing
        ? await tx.update(batches).set(values).where(eq(batches.id, existing.id)).returning()
        : await tx.insert(batches).values(values).returning();
      const available = oldProblems.map(row => row.problem).filter(p => p.batchId === savedBatch.id);
      const used = new Set<number>();
      for (const problem of list) {
        const old = available.find(p => p.difficulty === problem.difficulty && !used.has(p.id));
        const values = { ...problem, batchId: savedBatch.id, points: DEFAULTS.points[problem.difficulty] };
        if (old) { used.add(old.id); await tx.update(problems).set(values).where(eq(problems.id, old.id)); }
        else await tx.insert(problems).values(values);
      }
      const unused = available.filter(p => !used.has(p.id)).map(p => p.id);
      if (unused.length) await tx.delete(problems).where(inArray(problems.id, unused));
    }
    const removed = oldBatches.filter(b => b.position >= input.batches.length).map(b => b.id);
    if (removed.length) {
      await tx.delete(problems).where(inArray(problems.batchId, removed));
      await tx.delete(batches).where(inArray(batches.id, removed));
    }
    await writeAudit(tx, {
      actorId: actor.adminId, action: "update_contest", target: `contest:${current.id}`, now: actor.now,
      details: JSON.stringify({ before: { contest: current, batches: oldBatches, problems: oldProblems.map(r => r.problem) }, after: { contest: updated, batches: input.batches } }),
    });
    return current.id;
  });
}
export async function findLiveContest(db: Db, now: Date): Promise<ContestRow | null> {
  return (await db.select().from(contests).where(and(eq(contests.status, "scheduled"), lte(contests.startsAt, now), sql`${contests.endsAt} + ${FINAL_SOLVE_SECONDS} * interval '1 second' >= ${now.toISOString()}::timestamptz`)).limit(1))[0] ?? null;
}
export async function findContestForSubmission(db: Db, now: Date): Promise<ContestRow | null> {
  return (await db.select().from(contests).where(and(eq(contests.status, "scheduled"), lte(contests.startsAt, now), sql`${contests.endsAt} + greatest(${contests.graceSeconds}, ${FINAL_SOLVE_SECONDS}) * interval '1 second' >= ${now.toISOString()}::timestamptz`)).limit(1))[0] ?? null;
}
export async function visibleProblems(db: Db, contestId: number, now: Date, userId?: number) {
  const adminPreview = await canPreviewProblems(db, userId);
  const openings = userId === undefined || adminPreview ? new Map<number, Date>() : await getBatchOpenings(db, contestId, userId, now);
  const accessible = [...openings].filter(([, opensAt]) => opensAt <= now).map(([id]) => id);
  return db.select({ id: problems.id, batchPosition: batches.position, difficulty: problems.difficulty, slug: problems.slug, title: problems.title, points: problems.points, unlockAt: batches.unlockAt, closesAt: batches.closesAt })
    .from(problems).innerJoin(batches, eq(problems.batchId, batches.id)).innerJoin(contests, eq(batches.contestId, contests.id))
    .where(and(eq(contests.id, contestId), adminPreview ? undefined : and(eq(contests.status, "scheduled"), lte(contests.startsAt, now), or(lte(batches.unlockAt, now), inArray(batches.id, accessible))))).orderBy(asc(batches.position), asc(problems.id));
}
