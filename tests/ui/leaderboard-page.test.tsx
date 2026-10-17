import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
const { getViewer, getContestCatalog, getDb } = vi.hoisted(() => ({ getViewer: vi.fn(), getContestCatalog: vi.fn(), getDb: vi.fn() }));
vi.mock("@/services/viewer", () => ({ getViewer }));
vi.mock("@/services/contest-catalog", () => ({ getContestCatalog }));
vi.mock("@/db", () => ({ getDb }));
vi.mock("@/app/components/auto-refresh", () => ({ AutoRefresh: () => null }));
import Leaderboard from "@/app/leaderboard/page";
import { closeTestDbs } from "@/db/test-db";
import { contests } from "@/db/schema";
import { at, setup } from "../helpers";
const props = (contestId?: string) => ({ searchParams: Promise.resolve({ contestId }) });
beforeEach(() => { vi.clearAllMocks(); vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(at(30)); });
afterEach(async () => { vi.useRealTimers(); await closeTestDbs(); });

it("requires sign-in and verification before reading standings", async () => {
  getViewer.mockResolvedValue(null);
  await expect(Leaderboard(props())).rejects.toThrow("NEXT_REDIRECT");
  getViewer.mockResolvedValue({ id: 1, leetcodeUsername: null, leetcodeVerifiedAt: null });
  expect(renderToStaticMarkup(await Leaderboard(props()))).toContain("Verify LeetCode to enter contests");
  expect(getContestCatalog).not.toHaveBeenCalled();
  expect(getDb).not.toHaveBeenCalled();
});
it("selects the active contest, supports archived contests, and hides locked problem names", async () => {
  const { db, student, contestId } = await setup();
  getDb.mockReturnValue(db); getViewer.mockResolvedValue(student);
  getContestCatalog.mockResolvedValue(await db.select().from(contests));
  let html = renderToStaticMarkup(await Leaderboard(props()));
  expect(html).toContain("Saturday Sprint");
  expect(html).toContain("Leaderboard");
  expect(html).toContain("B1.A");
  expect(html).toContain("No solves yet");
  expect(html).not.toContain("hard-2");
  vi.setSystemTime(at(200));
  html = renderToStaticMarkup(await Leaderboard(props(String(contestId))));
  expect(html).toContain("hard-3");
  expect(html).toContain("View results");
  await expect(Leaderboard(props("99999"))).rejects.toMatchObject({ digest: "NEXT_HTTP_ERROR_FALLBACK;404" });
  await expect(Leaderboard(props("invalid"))).rejects.toMatchObject({ digest: "NEXT_HTTP_ERROR_FALLBACK;404" });
});

it("lets an unverified administrator inspect every problem on the live leaderboard", async () => {
  const { db, admin } = await setup(); getDb.mockReturnValue(db); getViewer.mockResolvedValue(admin);
  getContestCatalog.mockResolvedValue(await db.select().from(contests));
  const html = renderToStaticMarkup(await Leaderboard(props()));
  expect(html).toContain("hard-3");
  expect(html).not.toContain("Verify LeetCode to enter contests");
});
