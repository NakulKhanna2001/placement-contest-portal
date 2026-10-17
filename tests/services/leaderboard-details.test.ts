import { afterEach, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { closeTestDbs } from "@/db/test-db";
import { contests, disqualifications, solves } from "@/db/schema";
import { getLeaderboard, getLeaderboardDetails } from "@/services/leaderboard";
import { checkSubmission } from "@/services/submission-checker";
import { at, batch, fake, link, setup } from "../helpers";

afterEach(closeTestDbs);
async function fixture() {
  const data = await setup();
  for (const [i, p] of batch(1).entries()) {
    expect(await checkSubmission(data.db, fake([{ id: String(i + 1), slug: p.slug, acceptedAt: at(5 + i) }]), { userId: data.student.id, link: link(String(i + 1)), now: at(6 + i) })).toMatchObject({ ok: true });
  }
  expect(await checkSubmission(data.db, fake([{ id: "20", slug: "hard-2", acceptedAt: at(20) }]), { userId: data.student.id, link: link("20"), now: at(30) })).toMatchObject({ ok: true });
  return data;
}

it("matches existing rankings and shows counted solves with acceptance and verification times", async () => {
  const { db, contestId, student, other } = await fixture();
  const before = await db.select().from(solves);
  const detail = await getLeaderboardDetails(db, contestId, other.id, at(40));
  const summary = await getLeaderboard(db, contestId);
  expect(detail.board).toHaveLength(summary.length);
  detail.board.forEach((row, i) => expect(row).toMatchObject(summary[i]));
  expect(detail.board[0]).toMatchObject({ userId: student.id, points: 49.5 });
  expect(detail.board[0].solves).toHaveLength(5);
  expect(detail.board[0].solves).toContainEqual(expect.objectContaining({ acceptedAt: at(20).toISOString(), verifiedAt: at(30).toISOString(), points: 18, multiplier: 1.5, source: "auto" }));
  expect(detail.problems).toHaveLength(12);
  expect(detail.problems.map(p => p.label)).toEqual(["B1.A", "B1.B", "B1.C", "B1.D", "B2.A", "B2.B", "B2.C", "B2.D", "B3.A", "B3.B", "B3.C", "B3.D"]);
  expect(detail.problems.filter(p => p.problem)).toHaveLength(4);
  expect(JSON.stringify(detail)).not.toContain("hard-2");
  expect(await db.select().from(solves)).toEqual(before);
});

it("reveals problem names only on the viewer's own early unlock or scheduled release", async () => {
  const { db, contestId, student, other } = await fixture();
  expect((await getLeaderboardDetails(db, contestId, student.id, at(40))).problems.filter(p => p.problem)).toHaveLength(8);
  expect((await getLeaderboardDetails(db, contestId, other.id, at(60))).problems.filter(p => p.problem)).toHaveLength(8);
  expect((await getLeaderboardDetails(db, contestId, other.id, at(200))).problems.filter(p => p.problem)).toHaveLength(12);
  const future = await getLeaderboardDetails(db, contestId, other.id, at(-1));
  expect(future.board).toEqual([]);
  expect(future.problems.every(p => p.problem === null)).toBe(true);
});

it("excludes revoked solves and disqualified students, and rejects draft or missing contests", async () => {
  const { db, contestId, student, other, admin } = await fixture();
  await db.update(solves).set({ status: "revoked" }).where(eq(solves.submissionId, "20"));
  const detail = await getLeaderboardDetails(db, contestId, other.id, at(40));
  expect(detail.board[0].solves).toHaveLength(4);
  expect(detail.board[0].points).toBe(31.5);
  await db.insert(disqualifications).values({ contestId, userId: student.id, reason: "Confirmed", createdBy: admin.id });
  expect((await getLeaderboardDetails(db, contestId, other.id, at(40))).board).toEqual([]);
  await db.update(contests).set({ status: "draft" }).where(eq(contests.id, contestId));
  await expect(getLeaderboardDetails(db, contestId, student.id, at(40))).rejects.toMatchObject({ status: 404 });
  await expect(getLeaderboardDetails(db, 99999, student.id, at(40))).rejects.toMatchObject({ status: 404 });
});
