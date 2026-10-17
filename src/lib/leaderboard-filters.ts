import type { Campus } from "./student-profile";

/** Input is the globally ranked board. Equal overall ranks preserve exact ties. */
export function filterLeaderboard<T extends { rank: number; campus: Campus | null; studyYear: number | null }>(rows: T[], campus: Campus | "", studyYear: number | ""): (T & { overallRank: number })[] {
  const selected = rows.filter(row => (!campus || row.campus === campus) && (!studyYear || row.studyYear === studyYear));
  let rank = 0;
  return selected.map((row, index) => {
    if (index === 0 || row.rank !== selected[index - 1].rank) rank = index + 1;
    return { ...row, overallRank: row.rank, rank };
  });
}
