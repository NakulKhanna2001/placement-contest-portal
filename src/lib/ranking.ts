import type { Difficulty } from "./types";
export interface SolveRow { userId: number; points: number; difficulty: Difficulty; acceptedAt: Date }
export interface RankedRow { rank: number; userId: number; points: number; hardsSolved: number; lastSolveAt: Date }
export function rankLeaderboard(solves: SolveRow[], disqualified: Set<number>): RankedRow[] {
  const totals = new Map<number, Omit<RankedRow, "rank">>();
  for (const s of solves) {
    if (disqualified.has(s.userId)) continue;
    const row = totals.get(s.userId) ?? { userId: s.userId, points: 0, hardsSolved: 0, lastSolveAt: s.acceptedAt };
    row.points = Math.round((row.points + s.points) * 10) / 10;
    row.hardsSolved += Number(s.difficulty === "hard");
    if (s.acceptedAt > row.lastSolveAt) row.lastSolveAt = s.acceptedAt;
    totals.set(s.userId, row);
  }
  const compare = (a: Omit<RankedRow, "rank">, b: Omit<RankedRow, "rank">) => b.points - a.points || b.hardsSolved - a.hardsSolved || +a.lastSolveAt - +b.lastSolveAt;
  const sorted = [...totals.values()].sort((a, b) => compare(a, b) || a.userId - b.userId);
  const out: RankedRow[] = [];
  sorted.forEach((r, i) => out.push({ ...r, rank: i > 0 && compare(r, sorted[i - 1]) === 0 ? out[i - 1].rank : i + 1 }));
  return out;
}
