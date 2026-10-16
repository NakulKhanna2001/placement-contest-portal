import { afterEach, expect, it } from "vitest";
import { createTestDb, closeTestDbs } from "@/db/test-db";
import { users } from "@/db/schema";
import { createContest, visibleProblems } from "@/services/contest";
import { checkSubmission } from "@/services/submission-checker";
import { getLeaderboard } from "@/services/leaderboard";
import { fileReport, reviewReport } from "@/services/reports";
import type { AcceptedSubmission } from "@/lib/types";
import { at, start, batch, fake, link } from "../helpers";
afterEach(closeTestDbs);
it("runs 50 students through all three batches, archived late links, final scores and moderation", async () => {
  const db = await createTestDb();
  const contestId = await createContest(db, { title: "Full simulation", startsAt: start, batches: [batch(1), batch(2), batch(3)] });
  const students = await db.insert(users).values(Array.from({ length: 50 }, (_, i) => ({ email: `s${i}@c.edu`, name: `Student ${i}`, leetcodeUsername: `s${i}`, leetcodeVerifiedAt: at(-30) }))).returning();
  const [admin] = await db.insert(users).values({ email: "admin@c.edu", role: "admin" }).returning();
  const pending = new Map<string, AcceptedSubmission[]>();
  for (let b = 1; b <= 3; b++) {
    expect(await visibleProblems(db, contestId, at((b - 1) * 60))).toHaveLength(b * 4);
    const recent = new Map<string, AcceptedSubmission[]>();
    students.forEach((student, i) => {
      const list = [{ id: `${b * 10000 + i * 10 + 1}`, slug: `easy-${b}-a`, acceptedAt: at((b - 1) * 60 + 5 + i % 10) }];
      if (i % 5 === 0) list.push({ id: `${b * 10000 + i * 10 + 2}`, slug: `hard-${b}`, acceptedAt: at((b - 1) * 60 + 50) });
      recent.set(student.leetcodeUsername!, list);
      pending.set(student.leetcodeUsername!, [...pending.get(student.leetcodeUsername!) ?? [], ...list.slice(1)]);
    });
    const client = { recentAccepted: async (name: string) => recent.get(name) ?? [], profileBio: async () => "" };
    // Each student's first link triggers one lookup that also saves their other
    // recent acceptances. No scheduled fetch or background worker is involved.
    for (const student of students) {
      const first = recent.get(student.leetcodeUsername!)![0];
      expect(await checkSubmission(db, client, { userId: student.id, link: link(first.id), now: at((b - 1) * 60 + 55) })).toMatchObject({ ok: true, points: 3 });
    }
  }
  // Upstream is now unavailable and its recent lists have scrolled off. Only the archive remains.
  for (const student of students) {
    for (const [j, submission] of pending.get(student.leetcodeUsername!)!.entries()) {
      expect(await checkSubmission(db, fake([], true), { userId: student.id, link: link(submission.id), now: new Date(+at(185) + j * 6000) })).toMatchObject({ ok: true });
    }
  }
  const board = await getLeaderboard(db, contestId);
  expect(board).toHaveLength(50);
  expect(board.filter(r => r.points === 45 && r.hardsSolved === 3)).toHaveLength(10);
  expect(board.filter(r => r.points === 9)).toHaveLength(40);
  expect(await checkSubmission(db, fake(), { userId: students[0].id, link: link("1"), now: at(191) })).toMatchObject({ reason: "no_contest" });
  const report = await fileReport(db, { contestId, reporterId: students[1].id, targetUserId: students[0].id, problemId: null, proofUrl: "https://example.com/proof", description: "Verified evidence", now: at(200) });
  if (!report.ok) throw new Error("Report failed");
  await reviewReport(db, { adminId: admin.id, reportId: report.reportId, decision: { kind: "disqualify", reason: "Confirmed account sharing" }, now: at(201) });
  expect(await getLeaderboard(db, contestId)).toHaveLength(49);
});
