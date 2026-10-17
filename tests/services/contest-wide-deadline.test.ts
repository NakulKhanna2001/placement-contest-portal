import { afterEach, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { closeTestDbs } from "@/db/test-db";
import { batches, contests, problems, solves } from "@/db/schema";
import { checkSubmission } from "@/services/submission-checker";
import { createContest, findContestForSubmission, findLiveContest, contestPhase } from "@/services/contest";
import { grantSolve, rescoreContest } from "@/services/grants";
import { getLeaderboard } from "@/services/leaderboard";
import { fileReport } from "@/services/reports";
import { at, batch, fake, link, setup } from "../helpers";
afterEach(closeTestDbs);

it("scores all batches through 3h 1m inclusive, keeps bonuses fixed, and preserves existing solves", async () => {
  const { db, contestId, student, other } = await setup();
  let id = 100;
  const submit = (userId: number, slug: string, accepted: number, now: number) => {
    const submissionId = String(++id);
    return checkSubmission(db, fake([{ id: submissionId, slug, acceptedAt: at(accepted) }]), { userId, link: link(submissionId), now: at(now) });
  };
  expect(await submit(student.id, "easy-1-a", 15, 16)).toMatchObject({ ok: true, points: 3, multiplier: 1.5 });
  const before = await db.select().from(solves);
  const schedule = await db.select().from(batches);
  expect(await submit(other.id, "hard-1", 70, 71)).toMatchObject({ ok: true, points: 12, multiplier: 1 });
  expect(await submit(other.id, "hard-2", 130, 131)).toMatchObject({ ok: true, points: 12, multiplier: 1 });
  expect(await submit(other.id, "easy-1-a", 180.5, 180.6)).toMatchObject({ ok: true, points: 2 });
  expect(await submit(other.id, "easy-2-a", 181, 181)).toMatchObject({ ok: true, points: 2 });
  expect(await submit(other.id, "easy-3-a", 181, 185)).toMatchObject({ ok: true, points: 2 });
  expect(await submit(other.id, "easy-1-b", 181 + 1 / 60, 186)).toMatchObject({ reason: "outside_window" });
  expect(await submit(other.id, "easy-3-b", 180, 191)).toMatchObject({ reason: "no_contest" });
  expect(await db.select().from(solves).where(eq(solves.userId, student.id))).toEqual(before);
  expect(await db.select().from(batches)).toEqual(schedule);
  expect((await getLeaderboard(db, contestId)).find(r => r.userId === other.id)?.points).toBe(30);
});

it("uses the shared deadline for grants and rescoring without extending the bonus window", async () => {
  const { db, contestId, student, admin } = await setup();
  const ps = await db.select().from(problems);
  const input = { adminId: admin.id, userId: student.id, problemId: ps[3].id, acceptedAt: at(181), now: at(200), reason: "Proof", evidence: "https://example.com/proof" };
  expect(await grantSolve(db, { ...input, acceptedAt: at(181 + 1 / 60) })).toMatchObject({ reason: "outside_window" });
  expect(await grantSolve(db, input)).toMatchObject({ ok: true, points: 12, multiplier: 1 });
  const before = await db.select().from(solves);
  await rescoreContest(db, { adminId: admin.id, contestId, reason: "Verify extended deadline", now: at(201) });
  expect(await db.select().from(solves)).toEqual(before);
});

it("keeps submission routing open for the final minute even with zero configured link grace", async () => {
  const { db, contestId, student } = await setup();
  const [contest] = await db.update(contests).set({ graceSeconds: 0 }).where(eq(contests.id, contestId)).returning();
  expect(contestPhase(contest, at(181))).toBe("live");
  expect(contestPhase(contest, at(181 + 1 / 60))).toBe("ended");
  expect(await findLiveContest(db, at(181))).toMatchObject({ id: contestId });
  expect(await findContestForSubmission(db, at(181))).toMatchObject({ id: contestId });
  expect(await findContestForSubmission(db, at(181 + 1 / 60))).toBeNull();
  expect(await checkSubmission(db, fake([{ id: "900", slug: "hard-1", acceptedAt: at(181) }]), { userId: student.id, link: link("900"), now: at(181) })).toMatchObject({ ok: true, points: 12 });
  await expect(createContest(db, { title: "Overlaps final minute", startsAt: at(180.5), batches: [batch(4)], graceSeconds: 0 })).rejects.toThrow("overlaps");
});

it("opens reports only after the final scoring minute finishes", async () => {
  const { db, contestId, student, other } = await setup();
  const input = { contestId, reporterId: other.id, targetUserId: student.id, problemId: null, proofUrl: "https://example.com/proof", description: "Evidence", now: at(181) };
  expect(await fileReport(db, input)).toMatchObject({ reason: "contest_not_ended" });
  expect(await fileReport(db, { ...input, now: at(181 + 1 / 60) })).toMatchObject({ reason: "invalid_target" });
});
