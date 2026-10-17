import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
const { auth } = vi.hoisted(() => ({ auth: vi.fn() }));
vi.mock("@/auth", () => ({ auth }));
vi.mock("@/db", () => ({ getDb: () => { throw new Error("Unexpected database access in an HTTP validation test"); } }));
import { POST as submit } from "@/app/api/submit/route";
import { POST as report } from "@/app/api/report/route";
import { POST as grant } from "@/app/api/admin/grants/route";
import { POST as contest } from "@/app/api/admin/contests/route";
import { POST as review, GET as reports } from "@/app/api/admin/reports/route";
import { POST as linkAccount } from "@/app/api/link/route";
import { POST as profile } from "@/app/api/profile/route";
import { GET as leaderboard } from "@/app/api/leaderboard/route";
import { readBody } from "@/lib/http";
const request = (body = "{}", headers: Record<string, string> = {}) => new Request("https://portal.test/api/submit", { method: "POST", headers: { "content-type": "application/json", ...headers }, body });
beforeEach(() => { auth.mockReset(); auth.mockResolvedValue(null); });
describe("HTTP boundaries", () => {
  it("requires authentication for every student write and leaderboard request", async () => {
    for (const handler of [submit, report, linkAccount, profile]) expect((await handler(request())).status).toBe(401);
    expect((await leaderboard(new Request("https://portal.test/api/leaderboard?contestId=1"))).status).toBe(401);
    expect((await leaderboard(new Request("https://portal.test/api/leaderboard?contestId=1&details=1"))).status).toBe(401);
  });
  it("rejects student access to all admin endpoints before touching the database", async () => {
    auth.mockResolvedValue({ user: { id: 1, role: "student" } });
    for (const handler of [grant, contest, review]) expect((await handler(request())).status).toBe(403);
    expect((await reports()).status).toBe(403);
  });
  it("validates malformed JSON, forged decisions, dates, and wrong origins", async () => {
    auth.mockResolvedValue({ user: { id: 1, role: "admin", leetcodeVerified: true } });
    expect((await submit(request("{"))).status).toBe(400);
    expect((await submit(request("{}", { origin: "https://evil.test" }))).status).toBe(403);
    expect((await profile(request(JSON.stringify({ campus: "pune", studyYear: 2 }), { origin: "https://evil.test" }))).status).toBe(403);
    expect((await review(request(JSON.stringify({ reportId: 1, decision: { kind: "anything" } })))).status).toBe(400);
    expect((await grant(request(JSON.stringify({ action: "grant", userIds: [1], problemId: 1, acceptedAt: "invalid", reason: "r", evidence: "https://example.com" })))).status).toBe(400);
    await expect(readBody(request("{}", { "content-type": "text/plain" }), z.object({}))).rejects.toMatchObject({ status: 415 });
    await expect(readBody(request("x".repeat(50001)), z.object({}))).rejects.toMatchObject({ status: 413 });
  });
  it.each(["student", "admin"])("blocks direct contest APIs for an unverified %s", async role => {
    auth.mockResolvedValue({ user: { id: 1, role, leetcodeVerified: false } });
    expect((await submit(request(JSON.stringify({ link: "https://leetcode.com/submissions/detail/1/" })))).status).toBe(403);
    expect((await report(request())).status).toBe(403);
    if (role === "student") {
      expect((await leaderboard(new Request("https://portal.test/api/leaderboard?contestId=1"))).status).toBe(403);
      expect((await leaderboard(new Request("https://portal.test/api/leaderboard?contestId=1&details=1"))).status).toBe(403);
    }
    // Linking must remain available before verification; an invalid action is a
    // validation error, rather than the contest-access denial above.
    expect((await linkAccount(request(JSON.stringify({ action: "invalid" })))).status).toBe(400);
  });
  it("requires a complete edit contract and never turns unknown actions into new contests", async () => {
    auth.mockResolvedValue({ user: { id: 1, role: "admin" } });
    const fields = { title: "Future", startsAt: new Date(Date.now() + 3600000).toISOString(), batches: [[
      { difficulty: "easy", slug: "easy-a", title: "A" }, { difficulty: "easy", slug: "easy-b", title: "B" },
      { difficulty: "medium", slug: "medium", title: "M" }, { difficulty: "hard", slug: "hard", title: "H" },
    ]] };
    expect((await contest(request(JSON.stringify({ ...fields, action: "unknown" })))).status).toBe(400);
    expect((await contest(request(JSON.stringify({ action: "update", contestId: 1, revision: 0, contest: fields })))).status).toBe(400);
    expect((await contest(request(JSON.stringify({ action: "update", contestId: 1, contest: { ...fields, status: "draft" } })))).status).toBe(400);
  });
});
