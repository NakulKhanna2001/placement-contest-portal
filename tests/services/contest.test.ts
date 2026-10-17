import { afterEach, describe, it, expect, vi } from "vitest";
import { eq } from "drizzle-orm";
import { closeTestDbs } from "@/db/test-db";
import { contests, solves, seenSubmissions, checkLog, users } from "@/db/schema";
import { createContest, findContestForSubmission, findLiveContest, visibleProblems } from "@/services/contest";
import { checkSubmission } from "@/services/submission-checker";
import { beginLink, confirmLink } from "@/services/verification";
import { getLeaderboard } from "@/services/leaderboard";
import { setup, at, start, batch, fake, link } from "../helpers";
afterEach(closeTestDbs);
describe("contest and verification", () => {
  it("lets students verify mid-contest and submit without changing existing participants' solves", async () => {
    const { db, contestId, student } = await setup();
    const check = (userId: number, id: string, slug: string, accepted: number, now: number) => checkSubmission(db, fake([{ id, slug, acceptedAt: at(accepted) }]), { userId, link: link(id), now: at(now) });
    expect(await check(student.id, "101", "easy-1-a", 10, 11)).toMatchObject({ ok: true, points: 3 });
    expect(await check(student.id, "102", "hard-1", 20, 21)).toMatchObject({ ok: true, points: 12 });
    const previousSolves = await db.select().from(solves).where(eq(solves.userId, student.id));
    const previousStanding = (await getLeaderboard(db, contestId)).find(row => row.userId === student.id);

    const [late] = await db.insert(users).values({ email: "late@example.test", name: "Late joiner" }).returning();
    const token = await beginLink(db, late.id);
    expect(await check(late.id, "201", "easy-1-b", 30, 31)).toMatchObject({ reason: "not_linked" });
    expect(await confirmLink(db, { ...fake(), profileBio: async () => token }, late.id, "late-joiner", at(35), { campus: "pune", studyYear: 1 })).toMatchObject({ ok: true });
    expect(await check(late.id, "202", "easy-1-b", 40, 41)).toMatchObject({ ok: true, points: 2, multiplier: 1 });
    expect(await check(late.id, "203", "hard-2", 65, 66)).toMatchObject({ ok: true, points: 18, multiplier: 1.5 });
    expect(await check(late.id, "204", "hard-1", 61, 67)).toMatchObject({ ok: true, points: 12 });
    expect(await db.select().from(solves).where(eq(solves.userId, student.id))).toEqual(previousSolves);
    expect((await getLeaderboard(db, contestId)).find(row => row.userId === student.id)).toEqual({ ...previousStanding, rank: 2 });
    expect(await check(student.id, "103", "easy-2-a", 70, 71)).toMatchObject({ ok: true, points: 3 });
    expect((await getLeaderboard(db, contestId)).find(row => row.userId === student.id)).toMatchObject({ points: 18 });
    expect(await check(late.id, "205", "easy-3-a", 130, 190)).toMatchObject({ ok: true, points: 3 });
    expect(await check(late.id, "206", "easy-3-b", 131, 191)).toMatchObject({ reason: "no_contest" });
  });
  it("validates batch composition, duplicates, overlap and server-side release", async () => {
    const { db, contestId } = await setup();
    expect(await visibleProblems(db, contestId, at(-1))).toHaveLength(0);
    expect(await visibleProblems(db, contestId, at(0))).toHaveLength(4);
    expect(await visibleProblems(db, contestId, at(60))).toHaveLength(8);
    expect(await visibleProblems(db, contestId, at(120))).toHaveLength(12);
    expect(await findLiveContest(db, at(185))).toBeNull();
    expect(await findContestForSubmission(db, at(190))).not.toBeNull();
    expect(await findContestForSubmission(db, at(190.01))).toBeNull();
    await expect(createContest(db, { title: "Bad", startsAt: at(300), batches: [[batch(1)[0]]] })).rejects.toThrow();
    await expect(createContest(db, { title: "Duplicate", startsAt: at(300), batches: [batch(1), batch(1)] })).rejects.toThrow();
    await expect(createContest(db, { title: "Overlap", startsAt: at(180), batches: [batch(4)] })).rejects.toThrow();
    expect(await db.select().from(contests)).toHaveLength(1);
  });
  it("archives only the submitting student's list and reuses it without another upstream request", async () => {
    const { db, student } = await setup();
    const recentAccepted = vi.fn(async () => [{ id: "1", slug: "easy-1-a", acceptedAt: at(10) }, { id: "2", slug: "hard-1", acceptedAt: at(12) }]);
    const client = { recentAccepted, profileBio: async () => "" };
    expect(await checkSubmission(db, client, { userId: student.id, link: link("1"), now: at(15) })).toMatchObject({ ok: true, points: 3 });
    expect(recentAccepted).toHaveBeenCalledExactlyOnceWith("asha");
    const archive = await db.select().from(seenSubmissions);
    expect(archive).toHaveLength(2);
    expect(archive.every(row => row.userId === student.id && +row.firstSeenAt === +at(15))).toBe(true);
    recentAccepted.mockRejectedValue(new Error("LeetCode unavailable"));
    expect(await checkSubmission(db, client, { userId: student.id, link: link("2"), now: at(185) })).toMatchObject({ ok: true, points: 18 });
    expect(recentAccepted).toHaveBeenCalledTimes(1);
    expect(await db.select().from(seenSubmissions)).toHaveLength(2);
  });
  it("accepts archive-only late links through grace, with LeetCode's own time", async () => {
    const { db, student } = await setup();
    await db.insert(seenSubmissions).values({ userId: student.id, submissionId: "7", slug: "hard-1", acceptedAt: at(15) });
    expect(await checkSubmission(db, fake([], true), { userId: student.id, link: link("7"), now: at(190) })).toMatchObject({ ok: true, points: 18, multiplier: 1.5 });
    expect(await checkSubmission(db, fake(), { userId: student.id, link: link("8"), now: at(191) })).toMatchObject({ reason: "no_contest" });
    expect((await db.select().from(checkLog))[0].createdAt).toEqual(at(190));
  });
  it("earliest valid solve wins even when links arrive out of order", async () => {
    const { db, student } = await setup();
    expect(await checkSubmission(db, fake([{ id: "2", slug: "hard-1", acceptedAt: at(40) }]), { userId: student.id, link: link("2"), now: at(41) })).toMatchObject({ points: 12 });
    expect(await checkSubmission(db, fake([{ id: "1", slug: "hard-1", acceptedAt: at(10) }]), { userId: student.id, link: link("1"), now: at(42) })).toMatchObject({ points: 18 });
    expect(await checkSubmission(db, fake(), { userId: student.id, link: link("2"), now: at(43) })).toMatchObject({ reason: "already_solved" });
    expect(await db.select().from(solves)).toHaveLength(1);
    expect((await db.select().from(solves))[0].submissionId).toBe("1");
  });
  it("uses the earliest known valid acceptance for a submitted problem", async () => {
    const { db, student } = await setup();
    const client = fake([{ id: "1", slug: "hard-1", acceptedAt: at(-5) }, { id: "2", slug: "hard-1", acceptedAt: at(10) }, { id: "3", slug: "hard-1", acceptedAt: at(40) }]);
    expect(await checkSubmission(db, client, { userId: student.id, link: link("3"), now: at(45) })).toMatchObject({ ok: true, points: 18 });
    expect((await db.select().from(solves))[0].submissionId).toBe("2");
  });
  it("rejects wrong IDs, windows, future timestamps, unlinked accounts and upstream failures", async () => {
    const { db, student, admin } = await setup();
    const check = (id: string, slug: string, accepted: number, now: number) => checkSubmission(db, fake([{ id, slug, acceptedAt: at(accepted) }]), { userId: student.id, link: link(id), now: at(now) });
    expect(await check("1", "hard-2", 10, 12)).toMatchObject({ reason: "outside_window" });
    expect(await check("2", "hard-1", -1, 62)).toMatchObject({ reason: "outside_window" });
    expect(await check("3", "hard-2", 70, 63)).toMatchObject({ reason: "outside_window" });
    expect(await check("4", "other", 10, 64)).toMatchObject({ reason: "not_contest_problem" });
    expect(await checkSubmission(db, fake(), { userId: student.id, link: link("999"), now: at(65) })).toMatchObject({ reason: "not_found" });
    expect(await checkSubmission(db, fake([], true), { userId: student.id, link: link("888"), now: at(66) })).toMatchObject({ reason: "lookup_failed" });
    expect(await checkSubmission(db, fake(), { userId: admin.id, link: link("1"), now: at(10) })).toMatchObject({ reason: "not_linked" });
  });
  it("atomically enforces cooldown under concurrent requests", async () => {
    const { db, student } = await setup();
    const results = await Promise.all([1, 2].map(() => checkSubmission(db, fake([{ id: "1", slug: "hard-1", acceptedAt: at(10) }]), { userId: student.id, link: link("1"), now: at(11) })));
    expect(results.filter(r => r.ok)).toHaveLength(1);
    expect(results.filter(r => !r.ok && r.reason === "cooldown")).toHaveLength(1);
    expect(await db.select().from(solves)).toHaveLength(1);
  });
  it("keeps draft problems private", async () => {
    const { db } = await setup();
    const id = await createContest(db, { title: "Draft", startsAt: start, status: "draft", batches: [batch(5)] });
    expect(await visibleProblems(db, id, at(300))).toEqual([]);
  });
});
