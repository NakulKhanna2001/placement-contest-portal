import { expect, it } from "vitest";
import { parseLeetCodeProblemSlug } from "@/lib/contest-form";

it("extracts problem slugs from normal, tab-specific, shared, and contest URLs", () => {
  for (const input of [
    "two-sum", "  two-sum  ", "https://leetcode.com/problems/two-sum",
    "https://leetcode.com/problems/two-sum/", "https://leetcode.com/problems/two-sum/description/",
    "https://www.leetcode.com/problems/two-sum/solutions/123/example/?envType=daily-question#code",
    "https://leetcode.com/problems/two-sum/submissions/12345/",
    "  https://leetcode.com/problems/two-sum/?envId=2026-10-17  ",
    "https://leetcode.com/contest/weekly-contest-100/problems/two-sum/",
  ]) expect(parseLeetCodeProblemSlug(input), input).toBe("two-sum");
});

it("rejects non-problem links, other hosts, malformed slugs, and overlong slugs", () => {
  for (const input of [
    "", "Two Sum", "two_sum", "two--sum", "https://leetcode.com/problems/",
    "https://leetcode.com/problemset/", "https://leetcode.com/u/student/",
    "https://example.com/problems/two-sum/", "https://leetcode.com.example.com/problems/two-sum/",
    "https://leetcode.com@evil.com/problems/two-sum/", "ftp://leetcode.com/problems/two-sum/",
    "https://leetcode.com/problems/two%20sum/", "x".repeat(201),
    `https://leetcode.com/problems/${"x".repeat(201)}/`,
  ]) expect(parseLeetCodeProblemSlug(input), input).toBeNull();
});
