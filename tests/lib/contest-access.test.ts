import { expect, it } from "vitest";
import { hasVerifiedLeetCode } from "@/lib/contest-access";
it("requires both an actual username and a valid verification timestamp", () => {
  expect(hasVerifiedLeetCode({ leetcodeUsername: "student", leetcodeVerifiedAt: new Date() })).toBe(true);
  for (const profile of [null, undefined,
    { leetcodeUsername: "student", leetcodeVerifiedAt: null },
    { leetcodeUsername: null, leetcodeVerifiedAt: new Date() },
    { leetcodeUsername: "  ", leetcodeVerifiedAt: new Date() },
    { leetcodeUsername: "student", leetcodeVerifiedAt: new Date("invalid") },
  ]) expect(hasVerifiedLeetCode(profile)).toBe(false);
});
