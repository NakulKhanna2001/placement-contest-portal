export interface ScoreInput {
  basePoints: number; unlockAt: Date; closesAt: Date; acceptedAt: Date;
  bonusWindowSeconds: number; bonusMultiplier: number;
}
export type ScoreResult = { ok: true; points: number; multiplier: number } | { ok: false; reason: "before_unlock" | "after_close" | "invalid_input" };
export function scoreSolve(i: ScoreInput): ScoreResult {
  if (![+i.acceptedAt, +i.unlockAt, +i.closesAt, i.basePoints, i.bonusWindowSeconds, i.bonusMultiplier].every(Number.isFinite) || i.basePoints < 0 || i.bonusWindowSeconds < 0 || i.bonusMultiplier < 1 || i.closesAt < i.unlockAt) return { ok: false, reason: "invalid_input" };
  if (i.acceptedAt < i.unlockAt) return { ok: false, reason: "before_unlock" };
  if (i.acceptedAt > i.closesAt) return { ok: false, reason: "after_close" };
  const multiplier = (+i.acceptedAt - +i.unlockAt) / 1000 <= i.bonusWindowSeconds ? i.bonusMultiplier : 1;
  return { ok: true, points: Math.round(i.basePoints * multiplier * 10) / 10, multiplier };
}
