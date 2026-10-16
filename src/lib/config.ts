export const DEFAULTS = {
  batchesPerContest: 3, batchSpacingSeconds: 3600, windowSeconds: 3600,
  bonusWindowSeconds: 900, bonusMultiplier: 1.5, graceSeconds: 600,
  snapshotIntervalSeconds: 300, attemptCooldownSeconds: 5,
  points: { easy: 2, medium: 5, hard: 12 },
} as const;
