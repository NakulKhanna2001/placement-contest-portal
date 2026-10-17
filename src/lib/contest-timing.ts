export const FINAL_SOLVE_SECONDS = 60;

// Every unlocked problem shares this inclusive acceptance deadline.
export function solveDeadline(contest: { endsAt: Date }): Date {
  return new Date(+contest.endsAt + FINAL_SOLVE_SECONDS * 1000);
}

// A configured link grace cannot cut off the final scoring minute.
export function linkDeadline(contest: { endsAt: Date; graceSeconds: number }): Date {
  return new Date(+contest.endsAt + Math.max(contest.graceSeconds, FINAL_SOLVE_SECONDS) * 1000);
}
