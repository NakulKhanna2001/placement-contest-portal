import { afterEach, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { closeTestDbs } from "@/db/test-db";
import { contests, solves, users } from "@/db/schema";
import { visibleProblems } from "@/services/contest";
import { getLeaderboardDetails } from "@/services/leaderboard";
import { checkSubmission } from "@/services/submission-checker";
import { at, fake, link, setup } from "../helpers";
afterEach(closeTestDbs);

it("allows admin problem previews before release and keeps student releases and scoring intact", async () => {
  const { db, contestId, admin, student } = await setup();
  expect(await visibleProblems(db, contestId, at(-1), admin.id)).toHaveLength(12);
  expect(await visibleProblems(db, contestId, at(30), admin.id)).toHaveLength(12);
  expect(await visibleProblems(db, contestId, at(30), student.id)).toHaveLength(4);
  expect(await visibleProblems(db, contestId, at(-1), student.id)).toEqual([]);
  expect((await getLeaderboardDetails(db, contestId, admin.id, at(-1))).problems.every(p => p.problem !== null)).toBe(true);
  const client = fake([{ id: "99", slug: "hard-3", acceptedAt: at(30) }]);
  expect(await checkSubmission(db, client, { userId: admin.id, link: link("99"), now: at(31) })).toMatchObject({ reason: "not_linked" });
  await db.update(users).set({ leetcodeUsername: "verified-admin", leetcodeVerifiedAt: at(0) }).where(eq(users.id, admin.id));
  expect(await checkSubmission(db, client, { userId: admin.id, link: link("99"), now: at(32) })).toMatchObject({ reason: "outside_window" });
  expect(await db.select().from(solves)).toEqual([]);
  await db.update(users).set({ role: "student" }).where(eq(users.id, admin.id));
  expect(await visibleProblems(db, contestId, at(30), admin.id)).toHaveLength(4);
  expect((await getLeaderboardDetails(db, contestId, admin.id, at(30))).problems.filter(p => p.problem)).toHaveLength(4);
});

it("allows only admins to preview draft problem lists", async () => {
  const { db, contestId, admin, student } = await setup();
  await db.update(contests).set({ status: "draft" }).where(eq(contests.id, contestId));
  expect(await visibleProblems(db, contestId, at(30), admin.id)).toHaveLength(12);
  expect(await visibleProblems(db, contestId, at(30), student.id)).toEqual([]);
  expect(await visibleProblems(db, contestId, at(30))).toEqual([]);
});
