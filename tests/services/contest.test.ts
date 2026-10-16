import { afterEach, describe, it, expect } from "vitest";
import { closeTestDbs } from "@/db/test-db";
import { contests, solves, seenSubmissions, checkLog } from "@/db/schema";
import { createContest, findContestForSubmission, findLiveContest, visibleProblems } from "@/services/contest";
import { snapshotAll } from "@/services/snapshotter";
import { checkSubmission } from "@/services/submission-checker";
import { setup, at, start, batch, fake, link } from "../helpers";
afterEach(closeTestDbs);
describe("contest and verification", () => {
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
  it("archives linked users idempotently, isolates upstream failures and skips idle time", async () => {
    const { db, student } = await setup();
    const client = { recentAccepted: async (name: string) => { if (name === "bo") throw new Error("down"); return [{ id: "1", slug: "hard-1", acceptedAt: at(10) }]; }, profileBio: async () => "" };
    expect(await snapshotAll(db, client, at(-1))).toEqual({ users: 0, stored: 0, failed: 0 });
    expect(await snapshotAll(db, client, at(20))).toEqual({ users: 2, stored: 1, failed: 1 });
    expect((await snapshotAll(db, client, at(26))).stored).toBe(0);
    expect((await db.select().from(seenSubmissions))[0].userId).toBe(student.id);
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
    expect(await check("2", "hard-1", 61, 62)).toMatchObject({ reason: "outside_window" });
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
