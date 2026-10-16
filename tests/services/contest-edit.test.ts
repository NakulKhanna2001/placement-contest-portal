import { afterEach, describe, expect, it } from "vitest";
import { asc, eq, sql } from "drizzle-orm";
import { closeTestDbs } from "@/db/test-db";
import { auditLog, batches, contests, problems, solves } from "@/db/schema";
import { createContest, publishContest, updateContest, visibleProblems } from "@/services/contest";
import { at, batch, setup } from "../helpers";

afterEach(closeTestDbs);
const edited = () => ({ title: "Updated contest", startsAt: at(30), status: "scheduled" as const, batches: [batch(4), batch(5)], graceSeconds: 900, bonusWindowSeconds: 300, bonusMultiplier: 2 });

describe("contest editing", () => {
  it("updates the same contest, preserves remaining problem IDs, recalculates windows and audits", async () => {
    const { db, admin, contestId } = await setup();
    const originalProblems = await db.select().from(problems).orderBy(asc(problems.id));
    await updateContest(db, edited(), { adminId: admin.id, contestId, revision: 0, now: at(-10) });
    const [contest] = await db.select().from(contests).where(eq(contests.id, contestId));
    expect(contest).toMatchObject({ id: contestId, title: "Updated contest", startsAt: at(30), endsAt: at(150), graceSeconds: 900, bonusWindowSeconds: 300, bonusMultiplier: 2, revision: 1 });
    expect(await db.select().from(contests)).toHaveLength(1);
    const saved = await db.select().from(problems).orderBy(asc(problems.id));
    expect(saved.map(p => p.id)).toEqual(originalProblems.slice(0, 8).map(p => p.id));
    expect(saved.map(p => p.slug)).toEqual([...batch(4), ...batch(5)].map(p => p.slug));
    expect(saved.map(p => p.points)).toEqual([2, 2, 5, 12, 2, 2, 5, 12]);
    expect(await db.select().from(batches)).toHaveLength(2);
    const visible = await visibleProblems(db, contestId, at(30));
    expect(visible).toHaveLength(4);
    expect(visible[0]).toMatchObject({ unlockAt: at(30), closesAt: at(90) });
    const [audit] = await db.select().from(auditLog);
    expect(audit).toMatchObject({ action: "update_contest", actorId: admin.id, createdAt: at(-10) });
    const details = JSON.parse(audit.details);
    expect(details.before.contest.title).toBe("Saturday Sprint");
    expect(details.before.problems).toHaveLength(12);
    expect(details.after.contest.title).toBe("Updated contest");
  });

  it("edits an expired draft, adds batches, and publishes it at a future start", async () => {
    const { db, admin } = await setup();
    const contestId = await createContest(db, { title: "Old draft", startsAt: at(-300), status: "draft", batches: [batch(8)] });
    await updateContest(db, { ...edited(), startsAt: at(300), batches: [batch(8), batch(9)] }, { adminId: admin.id, contestId, revision: 0, now: at(200) });
    expect((await db.select().from(contests).where(eq(contests.id, contestId)))[0]).toMatchObject({ status: "scheduled", endsAt: at(420), revision: 1 });
    expect(await visibleProblems(db, contestId, at(360))).toHaveLength(8);
  });

  it.each([0, 60, 180, 200])("locks a published contest at minute %i, even if a future start is requested", async minute => {
    const { db, admin, contestId } = await setup();
    await expect(updateContest(db, { ...edited(), startsAt: at(400) }, { adminId: admin.id, contestId, revision: 0, now: at(minute) })).rejects.toMatchObject({ status: 409 });
    expect((await db.select().from(contests))[0].title).toBe("Saturday Sprint");
    expect(await db.select().from(auditLog)).toEqual([]);
  });

  it("rejects stale editors, including an editor opened before a draft was published", async () => {
    const { db, admin, contestId } = await setup();
    await updateContest(db, edited(), { adminId: admin.id, contestId, revision: 0, now: at(-10) });
    await expect(updateContest(db, { ...edited(), title: "Stale overwrite" }, { adminId: admin.id, contestId, revision: 0, now: at(-9) })).rejects.toMatchObject({ status: 409 });
    const draft = await createContest(db, { title: "Draft", startsAt: at(300), status: "draft", batches: [batch(8)] });
    await publishContest(db, draft, admin.id, at(-8));
    await expect(updateContest(db, { ...edited(), status: "draft", startsAt: at(300) }, { adminId: admin.id, contestId: draft, revision: 0, now: at(-7) })).rejects.toMatchObject({ status: 409 });
    expect((await db.select().from(contests).where(eq(contests.id, contestId)))[0].title).toBe("Updated contest");
  });

  it("enforces admin role, future start, overlap through grace, and batch validation", async () => {
    const { db, admin, student, contestId } = await setup();
    const actor = { adminId: admin.id, contestId, revision: 0, now: at(-10) };
    await expect(updateContest(db, edited(), { ...actor, adminId: student.id })).rejects.toMatchObject({ status: 403 });
    await expect(updateContest(db, { ...edited(), startsAt: at(-10) }, actor)).rejects.toMatchObject({ status: 400 });
    await expect(updateContest(db, edited(), { ...actor, contestId: 9999 })).rejects.toMatchObject({ status: 404 });
    await createContest(db, { title: "Other", startsAt: at(200), batches: [batch(9)] });
    await expect(updateContest(db, { ...edited(), startsAt: at(80) }, actor)).rejects.toMatchObject({ status: 409 });
    await expect(updateContest(db, { ...edited(), batches: [[batch(4)[0]]] }, actor)).rejects.toThrow();
    await expect(updateContest(db, { ...edited(), batches: [batch(4), batch(4)] }, actor)).rejects.toThrow();
    expect((await db.select().from(contests).where(eq(contests.id, contestId)))[0].revision).toBe(0);
  });

  it("can return a future scheduled contest to draft without exposing its problems", async () => {
    const { db, admin, contestId } = await setup();
    await updateContest(db, { ...edited(), status: "draft" }, { adminId: admin.id, contestId, revision: 0, now: at(-10) });
    expect(await visibleProblems(db, contestId, at(400))).toEqual([]);
  });

  it("preserves contests with solve records even if their schedule was altered externally", async () => {
    const { db, admin, student, contestId } = await setup();
    const [p] = await db.select().from(problems);
    await db.insert(solves).values({ userId: student.id, problemId: p.id, acceptedAt: at(1), multiplier: 1, points: 2, source: "auto" });
    await expect(updateContest(db, edited(), { adminId: admin.id, contestId, revision: 0, now: at(-10) })).rejects.toMatchObject({ status: 409 });
    expect(await db.select().from(problems)).toHaveLength(12);
  });

  it("rolls back all contest and problem changes if auditing fails", async () => {
    const { db, admin, contestId } = await setup();
    await db.execute(sql`ALTER TABLE audit_log ADD CONSTRAINT reject_test_update CHECK (action <> 'update_contest')`);
    await expect(updateContest(db, edited(), { adminId: admin.id, contestId, revision: 0, now: at(-10) })).rejects.toThrow();
    expect((await db.select().from(contests))[0]).toMatchObject({ title: "Saturday Sprint", revision: 0 });
    expect(await db.select().from(problems)).toHaveLength(12);
    expect(await db.select().from(batches)).toHaveLength(3);
  });
});
