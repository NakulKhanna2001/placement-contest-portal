import { expect, it } from "vitest";
import { filterLeaderboard } from "@/lib/leaderboard-filters";
const rows = [
  { userId: 1, rank: 1, campus: "sonepat" as const, studyYear: 1 },
  { userId: 2, rank: 2, campus: "pune" as const, studyYear: 2 },
  { userId: 3, rank: 2, campus: "pune" as const, studyYear: 2 },
  { userId: 4, rank: 4, campus: "pune" as const, studyYear: 3 },
  { userId: 5, rank: 5, campus: "bengaluru" as const, studyYear: 2 },
  { userId: 6, rank: 6, campus: null, studyYear: null },
];

it("ranks within a campus, year, or intersection while preserving ties and overall rank", () => {
  expect(filterLeaderboard(rows, "pune", "").map(r => [r.userId, r.rank, r.overallRank])).toEqual([[2, 1, 2], [3, 1, 2], [4, 3, 4]]);
  expect(filterLeaderboard(rows, "", 2).map(r => [r.userId, r.rank])).toEqual([[2, 1], [3, 1], [5, 3]]);
  expect(filterLeaderboard(rows, "pune", 3).map(r => [r.userId, r.rank])).toEqual([[4, 1]]);
  expect(filterLeaderboard(rows, "hyderabad", 1)).toEqual([]);
  expect(filterLeaderboard(rows, "", "").map(r => r.rank)).toEqual([1, 2, 2, 4, 5, 6]);
  expect(rows[1].rank).toBe(2);
});
