import { afterEach, expect, it } from "vitest";
import { createTestDb, closeTestDbs } from "@/db/test-db";
import { users } from "@/db/schema";
import { createContest, visibleProblems } from "@/services/contest";
import { checkSubmission } from "@/services/submission-checker";
import { getLeaderboard } from "@/services/leaderboard";
import type { AcceptedSubmission } from "@/lib/types";
import { at, fake, link, start } from "../helpers";

afterEach(closeTestDbs);
it("runs an isolated one-hour demo with correct bonus/base scores, archived links and standings", async () => {
  const db = await createTestDb();
  const contestId = await createContest(db, { title: "Isolated demo", startsAt: start, batches: [[
    { difficulty: "easy", title: "Two Sum", slug: "two-sum" },
    { difficulty: "easy", title: "Palindrome Number", slug: "palindrome-number" },
    { difficulty: "medium", title: "3Sum", slug: "3sum" },
    { difficulty: "hard", title: "Merge k Sorted Lists", slug: "merge-k-sorted-lists" },
  ]] });
  const [a, b, c] = await db.insert(users).values(["A", "B", "C"].map(name => ({ email: `demo-${name}@example.test`, name: `Demo ${name}`, leetcodeUsername: `demo-${name}`, leetcodeVerifiedAt: at(-30) }))).returning();
  const lists: Record<string, AcceptedSubmission[]> = {
    "demo-A": [{ id: "101", slug: "two-sum", acceptedAt: at(5) }, { id: "102", slug: "merge-k-sorted-lists", acceptedAt: at(20) }],
    "demo-B": [{ id: "201", slug: "3sum", acceptedAt: at(10) }, { id: "202", slug: "palindrome-number", acceptedAt: at(30) }],
    "demo-C": [{ id: "301", slug: "merge-k-sorted-lists", acceptedAt: at(10) }],
  };
  const client = { recentAccepted: async (username: string) => lists[username] ?? [], profileBio: async () => "" };
  expect(await visibleProblems(db, contestId, at(-1))).toHaveLength(0);
  expect(await visibleProblems(db, contestId, at(0))).toHaveLength(4);
  expect(await checkSubmission(db, client, { userId: a.id, link: link("101"), now: at(21) })).toMatchObject({ ok: true, points: 3 });
  expect(await checkSubmission(db, client, { userId: b.id, link: link("201"), now: at(31) })).toMatchObject({ ok: true, points: 7.5 });
  expect(await checkSubmission(db, client, { userId: b.id, link: link("202"), now: at(32) })).toMatchObject({ ok: true, points: 2 });
  expect(await checkSubmission(db, client, { userId: c.id, link: link("301"), now: at(12) })).toMatchObject({ ok: true, points: 18 });
  // A's second solve was archived by their first link and survives an upstream outage.
  expect(await checkSubmission(db, fake([], true), { userId: a.id, link: link("102"), now: at(65) })).toMatchObject({ ok: true, points: 12 });
  expect((await getLeaderboard(db, contestId)).map(r => [r.rank, r.name, r.points, r.hardsSolved])).toEqual([
    [1, "Demo C", 18, 1], [2, "Demo A", 15, 1], [3, "Demo B", 9.5, 0],
  ]);
  expect(await checkSubmission(db, client, { userId: a.id, link: link("101"), now: at(66) })).toMatchObject({ reason: "already_solved" });
  expect(await checkSubmission(db, client, { userId: b.id, link: link("102"), now: at(67) })).toMatchObject({ reason: "not_found" });
  expect(await checkSubmission(db, fake([{ id: "302", slug: "two-sum", acceptedAt: at(61) }]), { userId: c.id, link: link("302"), now: at(62) })).toMatchObject({ reason: "outside_window" });
  expect(await checkSubmission(db, client, { userId: a.id, link: link("101"), now: at(71) })).toMatchObject({ reason: "no_contest" });
  expect((await getLeaderboard(db, contestId)).map(r => r.points)).toEqual([18, 15, 9.5]);
});
