import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
const { auth } = vi.hoisted(() => ({ auth: vi.fn() }));
vi.mock("@/auth", () => ({ auth }));
import { POST as submit } from "@/app/api/submit/route";
import { POST as report } from "@/app/api/report/route";
import { POST as grant } from "@/app/api/admin/grants/route";
import { POST as contest } from "@/app/api/admin/contests/route";
import { POST as review, GET as reports } from "@/app/api/admin/reports/route";
import { POST as linkAccount } from "@/app/api/link/route";
import { GET as snapshot } from "@/app/api/cron/snapshot/route";
import { GET as leaderboard } from "@/app/api/leaderboard/route";
import { readBody } from "@/lib/http";
const request = (body = "{}", headers: Record<string, string> = {}) => new Request("https://portal.test/api/submit", { method: "POST", headers: { "content-type": "application/json", ...headers }, body });
beforeEach(() => { auth.mockReset(); auth.mockResolvedValue(null); });
describe("HTTP boundaries", () => {
  it("requires authentication for every student write and leaderboard request", async () => {
    for (const handler of [submit, report, linkAccount]) expect((await handler(request())).status).toBe(401);
    expect((await leaderboard(new Request("https://portal.test/api/leaderboard?contestId=1"))).status).toBe(401);
  });
  it("rejects student access to all admin endpoints before touching the database", async () => {
    auth.mockResolvedValue({ user: { id: 1, role: "student" } });
    for (const handler of [grant, contest, review]) expect((await handler(request())).status).toBe(403);
    expect((await reports()).status).toBe(403);
  });
  it("validates malformed JSON, forged decisions, dates, and wrong origins", async () => {
    auth.mockResolvedValue({ user: { id: 1, role: "admin" } });
    expect((await submit(request("{"))).status).toBe(400);
    expect((await submit(request("{}", { origin: "https://evil.test" }))).status).toBe(403);
    expect((await review(request(JSON.stringify({ reportId: 1, decision: { kind: "anything" } })))).status).toBe(400);
    expect((await grant(request(JSON.stringify({ action: "grant", userIds: [1], problemId: 1, acceptedAt: "invalid", reason: "r", evidence: "https://example.com" })))).status).toBe(400);
    await expect(readBody(request("{}", { "content-type": "text/plain" }), z.object({}))).rejects.toMatchObject({ status: 415 });
    await expect(readBody(request("x".repeat(50001)), z.object({}))).rejects.toMatchObject({ status: 413 });
  });
  it("fails closed when the cron secret is missing or incorrect", async () => {
    vi.stubEnv("CRON_SECRET", "");
    expect((await snapshot(new Request("https://portal.test/api/cron/snapshot", { headers: { authorization: "Bearer undefined" } }))).status).toBe(401);
    vi.stubEnv("CRON_SECRET", "test-secret-only");
    expect((await snapshot(new Request("https://portal.test/api/cron/snapshot", { headers: { authorization: "Bearer wrong" } }))).status).toBe(401);
    vi.unstubAllEnvs();
  });
});
