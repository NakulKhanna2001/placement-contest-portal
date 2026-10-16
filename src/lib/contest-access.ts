type LeetCodeProfile = { leetcodeUsername: string | null; leetcodeVerifiedAt: Date | null };

export function hasVerifiedLeetCode<T extends LeetCodeProfile>(profile: T | null | undefined): profile is T & { leetcodeUsername: string; leetcodeVerifiedAt: Date } {
  return !!profile?.leetcodeUsername?.trim()
    && profile.leetcodeVerifiedAt instanceof Date
    && Number.isFinite(profile.leetcodeVerifiedAt.getTime());
}
