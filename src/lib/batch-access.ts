export interface BatchProgress {
  id: number; position: number; unlockAt: Date; startsAt: Date;
  problemId: number | null; acceptedAt: Date | null;
}

export function personalBatchOpenings(rows: BatchProgress[]): Map<number, Date> {
  const byPosition = new Map<number, BatchProgress[]>();
  for (const row of rows) {
    const group = byPosition.get(row.position) ?? [];
    group.push(row);
    byPosition.set(row.position, group);
  }
  const openings = new Map<number, Date>();
  for (const [position, group] of byPosition) {
    const batch = group[0];
    const previous = byPosition.get(position - 1) ?? [];
    let opensAt = batch.unlockAt;
    if (previous.length === 4 && previous.every(p => p.problemId !== null && p.acceptedAt !== null)) {
      // Once all four solves are verified, LeetCode's last acceptance marks
      // completion. Late links and earliest-solve corrections do not move it later.
      const completedAt = Math.max(+batch.startsAt, ...previous.map(p => +p.acceptedAt!));
      opensAt = new Date(Math.min(+batch.unlockAt, completedAt));
    }
    openings.set(batch.id, opensAt);
  }
  return openings;
}
