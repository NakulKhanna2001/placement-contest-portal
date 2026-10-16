import { afterEach, expect, it } from "vitest";
import { closeTestDbs } from "@/db/test-db";
import { auditLog, problems, solves } from "@/db/schema";
import { grantSolve } from "@/services/grants";
import { setup, at } from "../helpers";
afterEach(closeTestDbs);
it("enforces one solve per student/problem at the database level", async () => {
  const { db, student } = await setup();
  const [problem] = await db.select().from(problems);
  const row = { userId: student.id, problemId: problem.id, acceptedAt: at(5), points: 2.2, multiplier: 1.1, source: "auto" as const };
  await db.insert(solves).values(row);
  expect((await db.select().from(solves))[0].points).toBe(2.2);
  await expect(db.insert(solves).values(row)).rejects.toThrow();
});
it("rolls back a grant if its audit insert fails", async () => {
  const { db, student, admin } = await setup();
  const [problem] = await db.select().from(problems);
  // Deliberately invalidate the audit timestamp. The solve insert succeeds first,
  // but PostgreSQL rejects the NOT NULL audit field and rolls back the transaction.
  await expect(grantSolve(db, { adminId: admin.id, userId: student.id, problemId: problem.id, acceptedAt: at(5), reason: "Proof", evidence: "https://example.com/p", now: undefined as unknown as Date })).rejects.toThrow();
  expect(await db.select().from(solves)).toHaveLength(0);
  expect(await db.select().from(auditLog)).toHaveLength(0);
});
