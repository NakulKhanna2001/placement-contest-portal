export interface ScoreInput {
  basePoints: number; unlockAt: Date; closesAt: Date; acceptedAt: Date;
  opensAt?: Date; // Personal early opening; unlockAt remains the scheduled bonus anchor.
  bonusWindowSeconds: number; bonusMultiplier: number;
}
export type ScoreResult = { ok: true; points: number; multiplier: number } | { ok: false; reason: "before_unlock" | "after_close" | "invalid_input" };
export function scoreSolve(i: ScoreInput): ScoreResult {
  const opensAt = i.opensAt ?? i.unlockAt;
  if (![+i.acceptedAt, +i.unlockAt, +opensAt, +i.closesAt, i.basePoints, i.bonusWindowSeconds, i.bonusMultiplier].every(Number.isFinite) || i.basePoints < 0 || i.bonusWindowSeconds < 0 || i.bonusMultiplier < 1 || i.closesAt < i.unlockAt || opensAt > i.unlockAt) return { ok: false, reason: "invalid_input" };
  if (i.acceptedAt < opensAt) return { ok: false, reason: "before_unlock" };
  if (i.acceptedAt > i.closesAt) return { ok: false, reason: "after_close" };
  const multiplier = (+i.acceptedAt - +i.unlockAt) / 1000 <= i.bonusWindowSeconds ? i.bonusMultiplier : 1;
  return { ok: true, points: Math.round(i.basePoints * multiplier * 10) / 10, multiplier };
}
