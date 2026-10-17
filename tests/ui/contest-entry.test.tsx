import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
const { getViewer, getContestCatalog, getDb } = vi.hoisted(() => ({ getViewer: vi.fn(), getContestCatalog: vi.fn(), getDb: vi.fn() }));
vi.mock("@/db", () => ({ getDb }));
vi.mock("@/services/cached-board", () => ({ cachedBoard: async () => [] }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("@/services/viewer", () => ({ getViewer }));
vi.mock("@/services/contest-catalog", () => ({ getContestCatalog }));
vi.mock("@/auth", () => ({ signIn: vi.fn() }));
vi.mock("@/app/components/auto-refresh", () => ({ AutoRefresh: () => null }));
import Home from "@/app/page";
import { closeTestDbs } from "@/db/test-db";
import { contests } from "@/db/schema";
import { eq } from "drizzle-orm";
import { at, batch, fake, link, setup } from "../helpers";
import { checkSubmission } from "@/services/submission-checker";
beforeEach(() => { vi.clearAllMocks(); getContestCatalog.mockResolvedValue([]); });
afterEach(async () => { vi.useRealTimers(); await closeTestDbs(); });

it.each(["student"])("requires a verified LeetCode profile before %s contest entry", async role => {
  getViewer.mockResolvedValue({ id: 1, role, leetcodeUsername: "pending-name", leetcodeVerifiedAt: null });
  const html = renderToStaticMarkup(await Home());
  expect(html).toContain("Verify LeetCode to enter contests");
  expect(html).toContain('href="/account"');
  expect(html).not.toContain("https://leetcode.com/problems/");
  expect(html).not.toContain("Leaderboard");
  expect(getContestCatalog).not.toHaveBeenCalled();
});

it("lets an unverified admin preview all batches without exposing a submission form", async () => {
  const { db, admin } = await setup();
  getDb.mockReturnValue(db); getViewer.mockResolvedValue(admin);
  getContestCatalog.mockResolvedValue(await db.select().from(contests));
  vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(at(30));
  const html = renderToStaticMarkup(await Home());
  expect(html.match(/href="https:\/\/leetcode.com\/problems\//g)).toHaveLength(12);
  expect(html).toContain("Admin preview");
  expect(html).not.toContain("All four solves in the previous batch are verified");
  expect(html).not.toContain("Submit a solve");
  expect(html).not.toContain("Verify LeetCode to enter contests");
});
it("allows a verified participant to open the contest area", async () => {
  getViewer.mockResolvedValue({ id: 1, role: "student", leetcodeUsername: "verified", leetcodeVerifiedAt: new Date() });
  const html = renderToStaticMarkup(await Home());
  expect(html).toContain("No contest scheduled yet");
  expect(html).not.toContain("Verify LeetCode to enter contests");
});

it.each([-10, 30])("shows the live submission form for a profile verified at minute %i", async verifiedMinute => {
  const { db, student } = await setup();
  getDb.mockReturnValue(db);
  getViewer.mockResolvedValue({ ...student, leetcodeVerifiedAt: at(verifiedMinute) });
  getContestCatalog.mockResolvedValue(await db.select().from(contests));
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(at(40));
  const html = renderToStaticMarkup(await Home());
  expect(html).toContain("Submit a solve");
  expect(html).toContain('name="link"');
  expect(html).not.toContain("You can participate in the next contest");
});

it("shows early batch problems and the scheduled bonus deadline only to the finisher", async () => {
  const { db, student, other } = await setup();
  getDb.mockReturnValue(db);
  getContestCatalog.mockResolvedValue(await db.select().from(contests));
  for (const [i, p] of batch(1).entries()) {
    expect(await checkSubmission(db, fake([{ id: String(i + 1), slug: p.slug, acceptedAt: at(5 + i) }]), { userId: student.id, link: link(String(i + 1)), now: at(6 + i) })).toMatchObject({ ok: true });
  }
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(at(30));
  getViewer.mockResolvedValue(student);
  const html = renderToStaticMarkup(await Home());
  expect(html).toContain("/problems/hard-2/");
  expect(html).not.toContain("/problems/hard-3/");
  expect(html).toContain("Early access");
  expect(html).toContain("Bonus until");
  expect(html).toContain(at(75).toISOString());
  expect(html).toContain("✓ Verified");
  getViewer.mockResolvedValue(other);
  const otherHtml = renderToStaticMarkup(await Home());
  expect(otherHtml).not.toContain("/problems/hard-2/");
  expect(otherHtml).not.toContain("Early access");
});

it.each([90, 181])("keeps prior batches open at minute %i and shows the common solve deadline", async minute => {
  const { db, student, contestId } = await setup();
  await db.update(contests).set({ graceSeconds: 0 }).where(eq(contests.id, contestId));
  getDb.mockReturnValue(db); getViewer.mockResolvedValue(student);
  getContestCatalog.mockResolvedValue(await db.select().from(contests));
  vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(at(minute));
  const html = renderToStaticMarkup(await Home());
  expect(html).toContain("Submit a solve");
  expect(html).toContain("Solve deadline");
  expect(html).toContain(at(181).toISOString());
  expect(html).toContain("/problems/hard-1/");
  expect(html).not.toContain(">Closed<");
});
