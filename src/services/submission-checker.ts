import { and, asc, eq, gte, isNull, lte, or } from "drizzle-orm";
import type { Db } from "@/db";
import { batches, checkLog, disqualifications, problems, seenSubmissions, solves, users } from "@/db/schema";
import { parseSubmissionId } from "@/lib/link";
import { scoreSolve } from "@/lib/scoring";
import { solveDeadline } from "@/lib/contest-timing";
import type { LeetCodeClient } from "@/leetcode/client";
import { findContestForSubmission } from "./contest";
import { getBatchOpenings } from "./batch-access";
type Reason = "bad_link" | "no_contest" | "not_linked" | "cooldown" | "not_found" | "not_contest_problem" | "outside_window" | "already_solved" | "lookup_failed" | "disqualified";
export type CheckResult = { ok: true; problemId: number; points: number; multiplier: number } | { ok: false; reason: Reason };
export async function checkSubmission(db: Db, client: LeetCodeClient, input: { userId: number; link: string; now: Date }): Promise<CheckResult> {
  const { userId, link, now } = input;
  const log = async (outcome: string, error?: string) => { await db.insert(checkLog).values({ userId, submittedLink: link.slice(0, 500), outcome, error, createdAt: now }); };
  const fail = async (reason: Reason, error?: string): Promise<CheckResult> => { await log(reason, error); return { ok: false, reason }; };
  // Claim before any network I/O; independent concurrent requests cannot both pass.
  const [me] = await db.update(users).set({ lastAttemptAt: now }).where(and(eq(users.id, userId), or(isNull(users.lastAttemptAt), lte(users.lastAttemptAt, new Date(+now - 5000))))).returning();
  if (!me) return fail("cooldown");
  const submissionId = parseSubmissionId(link);
  if (!submissionId) return fail("bad_link");
  const contest = await findContestForSubmission(db, now);
  if (!contest) return fail("no_contest");
  if (!me.leetcodeUsername || !me.leetcodeVerifiedAt) return fail("not_linked");
  if ((await db.select().from(disqualifications).where(and(eq(disqualifications.contestId, contest.id), eq(disqualifications.userId, userId)))).length) return fail("disqualified");
  let [found] = await db.select().from(seenSubmissions).where(and(eq(seenSubmissions.userId, userId), eq(seenSubmissions.submissionId, submissionId)));
  if (!found) {
    let list;
    try { list = await client.recentAccepted(me.leetcodeUsername); }
    catch (error) { return fail("lookup_failed", error instanceof Error ? error.message : "upstream failure"); }
    if (list.length) await db.insert(seenSubmissions).values(list.map(s => ({ userId, submissionId: s.id, slug: s.slug, acceptedAt: s.acceptedAt, firstSeenAt: now }))).onConflictDoNothing();
    [found] = await db.select().from(seenSubmissions).where(and(eq(seenSubmissions.userId, userId), eq(seenSubmissions.submissionId, submissionId)));
  }
  if (!found) return fail("not_found");
  const [row] = await db.select({ problem: problems, batch: batches }).from(problems).innerJoin(batches, eq(problems.batchId, batches.id)).where(and(eq(batches.contestId, contest.id), eq(problems.slug, found.slug)));
  if (!row) return fail("not_contest_problem");
  const closesAt = solveDeadline(contest);
  if (found.acceptedAt > closesAt || found.acceptedAt > now) return fail("outside_window");
  return db.transaction(async tx => {
    // A short row lock also serializes admin grants/revokes for this student.
    await tx.select().from(users).where(eq(users.id, userId)).for("update");
    const reject = async (reason: Reason): Promise<CheckResult> => {
      await tx.insert(checkLog).values({ userId, submittedLink: link.slice(0, 500), outcome: reason, createdAt: now });
      return { ok: false, reason };
    };
    const [disqualified] = await tx.select().from(disqualifications).where(and(eq(disqualifications.contestId, contest.id), eq(disqualifications.userId, userId)));
    if (disqualified) return reject("disqualified");
    // Check personal access under the same lock as prerequisite grants/revokes.
    const opensAt = (await getBatchOpenings(tx, contest.id, userId, now)).get(row.batch.id) ?? row.batch.unlockAt;
    if (found.acceptedAt < opensAt || opensAt > now) return reject("outside_window");
    const [earliest] = await tx.select().from(seenSubmissions).where(and(eq(seenSubmissions.userId, userId), eq(seenSubmissions.slug, found.slug), gte(seenSubmissions.acceptedAt, opensAt), lte(seenSubmissions.acceptedAt, found.acceptedAt))).orderBy(asc(seenSubmissions.acceptedAt), asc(seenSubmissions.id)).limit(1);
    const counted = earliest ?? found;
    const scored = scoreSolve({ basePoints: row.problem.points, opensAt, unlockAt: row.batch.unlockAt, closesAt, acceptedAt: counted.acceptedAt, bonusWindowSeconds: contest.bonusWindowSeconds, bonusMultiplier: contest.bonusMultiplier });
    if (!scored.ok) return reject("outside_window");
    const [existing] = await tx.select().from(solves).where(and(eq(solves.userId, userId), eq(solves.problemId, row.problem.id)));
    if (existing && (existing.status === "revoked" || existing.acceptedAt <= counted.acceptedAt)) {
      return reject("already_solved");
    }
    const values = { userId, problemId: row.problem.id, submissionId: counted.submissionId, acceptedAt: counted.acceptedAt, verifiedAt: now, multiplier: scored.multiplier, points: scored.points, source: "auto" as const, grantedBy: null, evidence: null };
    if (existing) await tx.update(solves).set(values).where(eq(solves.id, existing.id));
    else await tx.insert(solves).values(values);
    await tx.insert(checkLog).values({ userId, submittedLink: link.slice(0, 500), outcome: "accepted", createdAt: now });
    return { ok: true, problemId: row.problem.id, points: scored.points, multiplier: scored.multiplier };
  });
}
