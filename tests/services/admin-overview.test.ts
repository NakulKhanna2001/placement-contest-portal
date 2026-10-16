import { afterEach, expect, it } from "vitest";
import { closeTestDbs } from "@/db/test-db";
import { problems } from "@/db/schema";
import { getAdminOverview } from "@/services/admin-overview";
import { grantSolve, revokeSolve } from "@/services/grants";
import { at, setup } from "../helpers";

afterEach(closeTestDbs);
it("loads an authorized, consistent admin overview with dates and valid solve choices", async () => {
  const { db, admin, student } = await setup();
  const [problem] = await db.select().from(problems);
  const result = await grantSolve(db, { adminId: admin.id, userId: student.id, problemId: problem.id, acceptedAt: at(5), now: at(200), reason: "Proof", evidence: "https://example.com/proof" });
  if (!result.ok) throw new Error("Grant failed");
  const overview = await getAdminOverview(db, admin.id);
  expect(overview.contests).toHaveLength(1);
  expect(overview.contests[0].startsAt).toBeInstanceOf(Date);
  expect(overview.students).toHaveLength(3);
  expect(overview.students[0]).not.toHaveProperty("verifyToken");
  expect(overview.problems).toHaveLength(12);
  expect(overview.solves).toMatchObject([{ id: result.solveId, userId: student.id }]);
  expect(overview.audits[0].createdAt).toEqual(at(200));
  expect(overview.reports).toEqual([]);
  await revokeSolve(db, { adminId: admin.id, solveId: result.solveId, reason: "Correction", now: at(201) });
  expect((await getAdminOverview(db, admin.id)).solves).toEqual([]);
  await expect(getAdminOverview(db, student.id)).rejects.toMatchObject({ status: 403 });
});
