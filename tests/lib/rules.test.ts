import { describe, it, expect } from "vitest";
import { DEFAULTS } from "@/lib/config";
import { parseSubmissionId } from "@/lib/link";
import { scoreSolve } from "@/lib/scoring";
import { rankLeaderboard } from "@/lib/ranking";

describe("contest rules", () => {
  it("matches the approved defaults", () => {
    expect(DEFAULTS).toMatchObject({ batchesPerContest: 3, windowSeconds: 3600, bonusWindowSeconds: 900, bonusMultiplier: 1.5, graceSeconds: 600, points: { easy: 2, medium: 5, hard: 12 } });
  });
  it.each(["https://leetcode.com/submissions/detail/123/", " https://leetcode.com/problems/two-sum/submissions/123?x=y "])("extracts numeric IDs: %s", (link) => expect(parseSubmissionId(link)).toBe("123"));
  it.each(["hello", "https://evil.com/submissions/detail/123", "https://leetcode.com/submissions/detail/abc", "ftp://leetcode.com/submissions/detail/123", "https://x@leetcode.com/submissions/detail/123"])("rejects unsafe links: %s", (link) => expect(parseSubmissionId(link)).toBeNull());
  const start = new Date("2026-10-17T10:00:00Z");
  const at = (s: number) => new Date(+start + s * 1000);
  const score = (s: number) => scoreSolve({ basePoints: 5, unlockAt: start, closesAt: at(3600), acceptedAt: at(s), bonusWindowSeconds: 900, bonusMultiplier: 1.5 });
  it("pins inclusive solve and bonus boundaries", () => {
    expect(score(-1).ok).toBe(false);
    expect(score(0)).toMatchObject({ ok: true, points: 7.5 });
    expect(score(900)).toMatchObject({ ok: true, points: 7.5 });
    expect(score(901)).toMatchObject({ ok: true, points: 5 });
    expect(score(3600).ok).toBe(true);
    expect(score(3601).ok).toBe(false);
    expect(score(NaN).ok).toBe(false);
  });
  it("separates a personal early opening from the original bonus cutoff", () => {
    const early = (s: number) => scoreSolve({ basePoints: 5, opensAt: at(600), unlockAt: at(3600), closesAt: at(7200), acceptedAt: at(s), bonusWindowSeconds: 900, bonusMultiplier: 1.5 });
    expect(early(599)).toMatchObject({ reason: "before_unlock" });
    for (const second of [600, 2000, 3600, 4500]) expect(early(second)).toMatchObject({ ok: true, points: 7.5, multiplier: 1.5 });
    expect(early(4501)).toMatchObject({ ok: true, points: 5, multiplier: 1 });
    expect(early(7200).ok).toBe(true);
    expect(early(7201)).toMatchObject({ reason: "after_close" });
  });
  it("ranks by points, hards, then last solve; ties share rank and DQs disappear", () => {
    const rows = rankLeaderboard([
      { userId: 1, points: 12, difficulty: "hard", acceptedAt: at(50) },
      { userId: 2, points: 12, difficulty: "medium", acceptedAt: at(10) },
      { userId: 3, points: 12, difficulty: "hard", acceptedAt: at(40) },
      { userId: 4, points: 12, difficulty: "hard", acceptedAt: at(40) },
      { userId: 5, points: 18, difficulty: "hard", acceptedAt: at(1) },
    ], new Set([5]));
    expect(rows.map(r => [r.userId, r.rank])).toEqual([[3, 1], [4, 1], [1, 3], [2, 4]]);
  });
});
