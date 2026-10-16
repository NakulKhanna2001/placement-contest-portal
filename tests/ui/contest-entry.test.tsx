import { beforeEach, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
const { getViewer, getContestCatalog } = vi.hoisted(() => ({ getViewer: vi.fn(), getContestCatalog: vi.fn() }));
vi.mock("@/services/viewer", () => ({ getViewer }));
vi.mock("@/services/contest-catalog", () => ({ getContestCatalog }));
vi.mock("@/auth", () => ({ signIn: vi.fn() }));
vi.mock("@/app/components/auto-refresh", () => ({ AutoRefresh: () => null }));
import Home from "@/app/page";
beforeEach(() => { vi.clearAllMocks(); getContestCatalog.mockResolvedValue([]); });

it.each(["student", "admin"])("requires a verified LeetCode profile before %s contest entry", async role => {
  getViewer.mockResolvedValue({ id: 1, role, leetcodeUsername: "pending-name", leetcodeVerifiedAt: null });
  const html = renderToStaticMarkup(await Home());
  expect(html).toContain("Verify LeetCode to enter contests");
  expect(html).toContain('href="/account"');
  expect(html).not.toContain("https://leetcode.com/problems/");
  expect(html).not.toContain("Leaderboard");
  expect(getContestCatalog).not.toHaveBeenCalled();
});
it("allows a verified participant to open the contest area", async () => {
  getViewer.mockResolvedValue({ id: 1, role: "student", leetcodeUsername: "verified", leetcodeVerifiedAt: new Date() });
  const html = renderToStaticMarkup(await Home());
  expect(html).toContain("No contest scheduled yet");
  expect(html).not.toContain("Verify LeetCode to enter contests");
});
