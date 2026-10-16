import { afterEach, expect, it } from "vitest";
import { closeTestDbs } from "@/db/test-db";
import { solves, problems, disqualifications } from "@/db/schema";
import { getLeaderboard } from "@/services/leaderboard";
import { setup, at } from "../helpers";
afterEach(closeTestDbs);
it("ranks valid contest solves, names students, and excludes revoked solves and DQs", async () => {
  const { db, contestId, student, other, admin } = await setup();
  const ps = await db.select().from(problems);
  await db.insert(solves).values([
    { userId: student.id, problemId: ps[0].id, acceptedAt: at(5), points: 3, multiplier: 1.5, source: "auto" },
    { userId: student.id, problemId: ps[3].id, acceptedAt: at(5), points: 18, multiplier: 1.5, source: "auto", status: "revoked" },
    { userId: other.id, problemId: ps[3].id, acceptedAt: at(5), points: 18, multiplier: 1.5, source: "auto" },
  ]);
  expect((await getLeaderboard(db, contestId)).map(r => [r.name, r.points])).toEqual([["Bo", 18], ["Asha", 3]]);
  await db.insert(disqualifications).values({ contestId, userId: other.id, reason: "proof", createdBy: admin.id });
  expect((await getLeaderboard(db, contestId)).map(r => r.name)).toEqual(["Asha"]);
});
