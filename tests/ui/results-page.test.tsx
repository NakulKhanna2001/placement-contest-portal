import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
const { getDb, getSession, getContestCatalog } = vi.hoisted(() => ({ getDb: vi.fn(), getSession: vi.fn(), getContestCatalog: vi.fn() }));
vi.mock("@/db", () => ({ getDb }));
vi.mock("@/services/viewer", () => ({ getSession }));
vi.mock("@/services/contest-catalog", () => ({ getContestCatalog }));
import Results from "@/app/results/[contestId]/page";
import { closeTestDbs } from "@/db/test-db";
import { contests } from "@/db/schema";
import { at, setup } from "../helpers";

beforeEach(() => {
  vi.stubEnv("DATABASE_URL", "test-database-injected");
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(at(200));
  getSession.mockResolvedValue({ user: { id: 1, role: "student" } });
});
afterEach(async () => { vi.useRealTimers(); vi.unstubAllEnvs(); await closeTestDbs(); });

async function fixture() {
  const { db, contestId } = await setup();
  getDb.mockReturnValue(db);
  getContestCatalog.mockResolvedValue(await db.select().from(contests));
  return { params: Promise.resolve({ contestId: String(contestId) }) };
}

it("shows all finished-contest problems even when no participant has a solve", async () => {
  const html = renderToStaticMarkup(await Results(await fixture()));
  expect(html).toContain("Problems");
  expect(html.match(/href="https:\/\/leetcode.com\/problems\//g)).toHaveLength(12);
  expect(html).toContain("/problems/easy-1-a/");
  expect(html).toContain("/problems/hard-3/");
  expect(html).toContain("No solves yet");
});

it.each([-1, 30, 180])("keeps future/live results gated at minute %i and points users to the contest", async minute => {
  const props = await fixture();
  vi.setSystemTime(at(minute));
  const html = renderToStaticMarkup(await Results(props));
  expect(html).not.toContain("https://leetcode.com/problems/");
  expect(html).toContain("Open contest");
});

it("requires sign-in before showing the archived problem set", async () => {
  const props = await fixture(); getSession.mockResolvedValue(null);
  await expect(Results(props)).rejects.toThrow("NEXT_REDIRECT");
});

it("does not show a draft or unknown contest", async () => {
  const props = await fixture(); getContestCatalog.mockResolvedValue([]);
  await expect(Results(props)).rejects.toMatchObject({ digest: "NEXT_HTTP_ERROR_FALLBACK;404" });
});
