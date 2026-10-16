import { and, asc, eq, gte, lte, sql } from "drizzle-orm";
import type { Db } from "@/db";
import { batches, contests, problems } from "@/db/schema";
import { DEFAULTS } from "@/lib/config";
import { contestInput } from "@/lib/validation";
import type { Difficulty } from "@/lib/types";
import { requireAdmin, writeAudit } from "./audit";
import { HttpError } from "@/lib/errors";
export interface ProblemInput { difficulty: Difficulty; slug: string; title: string }
export interface ContestInput { title: string; startsAt: Date; batches: ProblemInput[][]; status?: "draft" | "scheduled"; graceSeconds?: number; bonusWindowSeconds?: number; bonusMultiplier?: number }
export type ContestRow = typeof contests.$inferSelect;
export function contestPhase(c: ContestRow, now: Date) {
  if (c.status === "draft") return "draft";
  return now < c.startsAt ? "scheduled" : now <= c.endsAt ? "live" : +now <= +c.endsAt + c.graceSeconds * 1000 ? "grace" : "ended";
}
async function assertNoOverlap(db: Db, startsAt: Date, endsAt: Date, grace: number, exceptId = 0) {
  const [overlap] = await db.select().from(contests).where(and(eq(contests.status, "scheduled"), sql`${contests.id} <> ${exceptId}`, lte(contests.startsAt, new Date(+endsAt + grace * 1000)), sql`${contests.endsAt} + ${contests.graceSeconds} * interval '1 second' >= ${startsAt.toISOString()}::timestamptz`)).limit(1);
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
    await tx.update(contests).set({ status: "scheduled" }).where(eq(contests.id, c.id));
    await writeAudit(tx, { actorId: adminId, action: "publish_contest", target: `contest:${c.id}`, now });
    return true;
  });
}
export async function findLiveContest(db: Db, now: Date): Promise<ContestRow | null> {
  return (await db.select().from(contests).where(and(eq(contests.status, "scheduled"), lte(contests.startsAt, now), gte(contests.endsAt, now))).limit(1))[0] ?? null;
}
export async function findContestForSubmission(db: Db, now: Date): Promise<ContestRow | null> {
  return (await db.select().from(contests).where(and(eq(contests.status, "scheduled"), lte(contests.startsAt, now), sql`${contests.endsAt} + ${contests.graceSeconds} * interval '1 second' >= ${now.toISOString()}::timestamptz`)).limit(1))[0] ?? null;
}
export async function visibleProblems(db: Db, contestId: number, now: Date) {
  return db.select({ id: problems.id, batchPosition: batches.position, difficulty: problems.difficulty, slug: problems.slug, title: problems.title, points: problems.points, unlockAt: batches.unlockAt, closesAt: batches.closesAt })
    .from(problems).innerJoin(batches, eq(problems.batchId, batches.id)).innerJoin(contests, eq(batches.contestId, contests.id))
    .where(and(eq(contests.id, contestId), eq(contests.status, "scheduled"), lte(batches.unlockAt, now))).orderBy(asc(batches.position), asc(problems.id));
}
