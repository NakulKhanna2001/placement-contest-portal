import { afterEach, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { closeTestDbs } from "@/db/test-db";
import { batches, contests, solves } from "@/db/schema";
import { visibleProblems } from "@/services/contest";
import { checkSubmission } from "@/services/submission-checker";
import { grantSolve, rescoreContest, revokeSolve } from "@/services/grants";
import { getLeaderboard } from "@/services/leaderboard";
import { at, batch, fake, link, setup } from "../helpers";

afterEach(closeTestDbs);

async function fixture() {
  const data = await setup();
  let id = 1000;
  const submit = (userId: number, slug: string, accepted: number, now = accepted + 0.1) => {
    const submissionId = String(++id);
    return checkSubmission(data.db, fake([{ id: submissionId, slug, acceptedAt: at(accepted) }]), { userId, link: link(submissionId), now: at(now) });
  };
  const finish = async (number: number, minute: number) => {
    for (const [i, problem] of batch(number).entries()) {
      expect(await submit(data.student.id, problem.slug, minute + i)).toMatchObject({ ok: true, multiplier: 1.5 });
    }
  };
  return { ...data, submit, finish };
}

it("opens only the next batch for its finisher, chains through batch 3, and preserves previous solves and schedule", async () => {
  const { db, student, other, admin, contestId, submit, finish } = await fixture();
  const originalSchedule = await db.select().from(batches);
  const originalContest = await db.select().from(contests);
  for (const [i, problem] of batch(1).slice(0, 3).entries()) expect(await submit(student.id, problem.slug, 5 + i)).toMatchObject({ ok: true });
  expect(await visibleProblems(db, contestId, at(9), student.id)).toHaveLength(4);
  expect(await submit(student.id, "hard-1", 10)).toMatchObject({ ok: true });
  const previous = await db.select().from(solves);
  expect(await visibleProblems(db, contestId, at(11), student.id)).toHaveLength(8);
  expect(await visibleProblems(db, contestId, at(11), other.id)).toHaveLength(4);
  expect(await visibleProblems(db, contestId, at(11))).toHaveLength(4);
  expect(await submit(other.id, "easy-2-a", 12)).toMatchObject({ reason: "outside_window" });
  expect(await submit(student.id, "easy-3-a", 12)).toMatchObject({ reason: "outside_window" });
  await finish(2, 20);
  expect(await visibleProblems(db, contestId, at(24), student.id)).toHaveLength(12);
  expect(await submit(student.id, "hard-3", 25)).toMatchObject({ ok: true, points: 18, multiplier: 1.5 });
  expect((await db.select().from(solves)).filter(s => previous.some(old => old.id === s.id))).toEqual(previous);
  expect(await db.select().from(batches)).toEqual(originalSchedule);
  expect(await db.select().from(contests)).toEqual(originalContest);
  expect(await visibleProblems(db, contestId, at(60), other.id)).toHaveLength(8);
  expect(await submit(other.id, "easy-2-a", 60)).toMatchObject({ ok: true, points: 3 });
  const standings = await getLeaderboard(db, contestId);
  await rescoreContest(db, { adminId: admin.id, contestId, reason: "Check chained early solves", now: at(200) });
  expect(await getLeaderboard(db, contestId)).toEqual(standings);
});

it("keeps the bonus cutoff at scheduled start + 15 minutes and applies the contest-wide close", async () => {
  const { student, submit, finish } = await fixture();
  await finish(1, 5);
  expect(await submit(student.id, "easy-2-a", 30)).toMatchObject({ ok: true, points: 3 });
  expect(await submit(student.id, "easy-2-b", 75, 76)).toMatchObject({ ok: true, points: 3 });
  expect(await submit(student.id, "medium-2", 75 + 1 / 60, 77)).toMatchObject({ ok: true, points: 5, multiplier: 1 });
  expect(await submit(student.id, "hard-2", 181 + 1 / 60, 182)).toMatchObject({ reason: "outside_window" });
  expect(await submit(student.id, "hard-2", 181, 190)).toMatchObject({ ok: true, points: 12 });
  expect(await submit(student.id, "easy-3-a", 130, 191)).toMatchObject({ reason: "no_contest" });
});

it("rejects pre-completion acceptances and selects the earliest eligible archived early solve", async () => {
  const { db, student, finish, submit } = await fixture();
  await finish(1, 5); // Last prerequisite accepted at minute 8.
  expect(await submit(student.id, "easy-2-a", 7, 10)).toMatchObject({ reason: "outside_window" });
  const client = fake([
    { id: "201", slug: "easy-2-a", acceptedAt: at(7) },
    { id: "202", slug: "easy-2-a", acceptedAt: at(8) },
    { id: "203", slug: "easy-2-a", acceptedAt: at(20) },
  ]);
  expect(await checkSubmission(db, client, { userId: student.id, link: link("203"), now: at(30) })).toMatchObject({ ok: true, points: 3 });
  expect((await db.select().from(solves).where(eq(solves.submissionId, "202")))[0].acceptedAt).toEqual(at(8));
  expect(await checkSubmission(db, fake([], true), { userId: student.id, link: link("203"), now: at(31) })).toMatchObject({ reason: "already_solved" });
});

it("does not count revoked prerequisites or expose a draft or a not-yet-started contest", async () => {
  const { db, student, admin, contestId, finish, submit } = await fixture();
  await finish(1, 5);
  const [solved] = await db.select().from(solves);
  await revokeSolve(db, { adminId: admin.id, solveId: solved.id, reason: "Invalid proof", now: at(10) });
  expect(await visibleProblems(db, contestId, at(11), student.id)).toHaveLength(4);
  expect(await submit(student.id, "easy-2-a", 12)).toMatchObject({ reason: "outside_window" });
  expect(await visibleProblems(db, contestId, at(-1), student.id)).toEqual([]);
  await db.update(contests).set({ status: "draft" }).where(eq(contests.id, contestId));
  expect(await visibleProblems(db, contestId, at(30), student.id)).toEqual([]);
});

it("rechecks prerequisite revocation after a slow LeetCode lookup", async () => {
  const { db, student, admin, finish } = await fixture();
  await finish(1, 5);
  const [solved] = await db.select().from(solves);
  let release!: () => void;
  let entered!: () => void;
  const waiting = new Promise<void>(resolve => { release = resolve; });
  const started = new Promise<void>(resolve => { entered = resolve; });
  const checking = checkSubmission(db, { profileBio: async () => "", recentAccepted: async () => { entered(); await waiting; return [{ id: "999", slug: "hard-2", acceptedAt: at(20) }]; } }, { userId: student.id, link: link("999"), now: at(21) });
  await started;
  await revokeSolve(db, { adminId: admin.id, solveId: solved.id, reason: "Invalid proof", now: at(21) });
  release();
  expect(await checking).toMatchObject({ reason: "outside_window" });
  expect(await db.select().from(solves).where(eq(solves.submissionId, "999"))).toEqual([]);
});

it("uses the same early access rules for admin grants and preserves early scores when rescoring", async () => {
  const { db, student, other, admin, contestId, finish } = await fixture();
  await finish(1, 5);
  const list = await visibleProblems(db, contestId, at(200));
  const problem = list.find(p => p.slug === "hard-2")!;
  const input = { adminId: admin.id, userId: student.id, problemId: problem.id, acceptedAt: at(20), now: at(200), reason: "LeetCode outage", evidence: "https://example.com/proof" };
  expect(await grantSolve(db, { ...input, userId: other.id })).toMatchObject({ reason: "outside_window" });
  expect(await grantSolve(db, input)).toMatchObject({ ok: true, points: 18, multiplier: 1.5 });
  const before = await getLeaderboard(db, contestId);
  await rescoreContest(db, { adminId: admin.id, contestId, reason: "Verify scores", now: at(201) });
  expect(await getLeaderboard(db, contestId)).toEqual(before);
  expect(await db.select().from(solves).where(and(eq(solves.userId, student.id), eq(solves.status, "valid")))).toHaveLength(5);
});
