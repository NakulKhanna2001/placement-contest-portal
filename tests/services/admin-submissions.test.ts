import { afterEach, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { closeTestDbs } from "@/db/test-db";
import { disqualifications, problems, solves, users } from "@/db/schema";
import { getAdminSubmissions } from "@/services/admin-submissions";
import { createContest } from "@/services/contest";
import { at, batch, setup } from "../helpers";
afterEach(closeTestDbs);

it("exposes complete solve records only to admins, including revoked, manual and disqualified records", async () => {
  const { db, admin, student, other, contestId } = await setup();
  const ps = await db.select().from(problems);
  await db.insert(solves).values([
    { userId: student.id, problemId: ps[0].id, submissionId: "123456", acceptedAt: at(10), verifiedAt: at(20), points: 3, multiplier: 1.5, source: "auto" },
    { userId: student.id, problemId: ps[1].id, submissionId: "123457", acceptedAt: at(11), verifiedAt: at(21), points: 3, multiplier: 1.5, source: "auto", status: "revoked" },
    { userId: other.id, problemId: ps[3].id, acceptedAt: at(30), verifiedAt: at(40), points: 12, multiplier: 1, source: "manual", grantedBy: admin.id, evidence: "https://example.com/proof" },
  ]);
  await db.insert(disqualifications).values({ contestId, userId: other.id, reason: "Confirmed", createdBy: admin.id });
  const before = await db.select().from(solves);
  await expect(getAdminSubmissions(db, student.id)).rejects.toMatchObject({ status: 403 });
  await expect(getAdminSubmissions(db, 9999)).rejects.toMatchObject({ status: 403 });
  const result = await getAdminSubmissions(db, admin.id);
  expect(result.total).toBe(3);
  expect(result.rows.map(r => r.status)).toEqual(["valid", "revoked", "valid"]);
  expect(result.rows[0]).toMatchObject({ name: "Bo", disqualified: true, source: "manual", submissionUrl: null, evidenceUrl: "https://example.com/proof" });
  expect(result.rows[2]).toMatchObject({ email: "a@c.edu", leetcodeUsername: "asha", problemTitle: "Easy A", acceptedAt: at(10), verifiedAt: at(20), submissionUrl: "https://leetcode.com/submissions/detail/123456/", multiplier: 1.5 });
  expect(result.rows[2]).not.toHaveProperty("verifyToken");
  const filtered = await getAdminSubmissions(db, admin.id, { contestId, userId: student.id, status: "revoked" });
  expect(filtered.total).toBe(1);
  expect(filtered.rows[0].submissionId).toBe("123457");
  expect((await getAdminSubmissions(db, admin.id, { contestId: 9999 })).rows).toEqual([]);
  expect(await db.select().from(solves)).toEqual(before);
  await db.update(users).set({ role: "student" }).where(eq(users.id, admin.id));
  await expect(getAdminSubmissions(db, admin.id)).rejects.toMatchObject({ status: 403 });
});

it("paginates deterministically and scopes records to the chosen contest", async () => {
  const { db, admin, contestId } = await setup();
  const [problem] = await db.select().from(problems);
  const students = await db.insert(users).values(Array.from({ length: 51 }, (_, i) => ({ email: `paging-${i}@example.test` }))).returning();
  await db.insert(solves).values(students.map(user => ({ userId: user.id, problemId: problem.id, submissionId: String(1000 + user.id), acceptedAt: at(10), verifiedAt: at(20), points: 3, multiplier: 1.5, source: "auto" as const })));
  const nextId = await createContest(db, { title: "Next", startsAt: at(300), batches: [batch(4)] });
  const first = await getAdminSubmissions(db, admin.id, { contestId });
  const second = await getAdminSubmissions(db, admin.id, { contestId, page: 2 });
  expect(first.total).toBe(51); expect(first.rows).toHaveLength(50); expect(second.rows).toHaveLength(1);
  expect(new Set([...first.rows, ...second.rows].map(r => r.id)).size).toBe(51);
  expect(first.rows[0].id).toBeGreaterThan(second.rows[0].id);
  expect((await getAdminSubmissions(db, admin.id, { contestId: nextId })).total).toBe(0);
});
