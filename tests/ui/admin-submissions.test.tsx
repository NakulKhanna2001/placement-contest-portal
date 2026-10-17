import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
const { getViewer, getDb } = vi.hoisted(() => ({ getViewer: vi.fn(), getDb: vi.fn() }));
vi.mock("@/services/viewer", () => ({ getViewer }));
vi.mock("@/db", () => ({ getDb }));
vi.mock("@/app/components/auto-refresh", () => ({ AutoRefresh: () => null }));
import Submissions from "@/app/admin/submissions/page";
import { closeTestDbs } from "@/db/test-db";
import { problems, solves } from "@/db/schema";
import { at, setup } from "../helpers";
const props = (query: Record<string, string> = {}) => ({ searchParams: Promise.resolve(query) });
beforeEach(() => { vi.clearAllMocks(); });
afterEach(closeTestDbs);

it("blocks signed-out and student visitors before loading submission data", async () => {
  getViewer.mockResolvedValue(null);
  await expect(Submissions(props())).rejects.toThrow("NEXT_REDIRECT");
  getViewer.mockResolvedValue({ id: 1, role: "student" });
  const html = renderToStaticMarkup(await Submissions(props()));
  expect(html).toContain("Admin access required");
  expect(getDb).not.toHaveBeenCalled();
});

it("lets unverified admins inspect student links, both timestamps and revoked status during the contest", async () => {
  const { db, admin, student, contestId } = await setup(); getDb.mockReturnValue(db); getViewer.mockResolvedValue(admin);
  const [problem] = await db.select().from(problems);
  await db.insert(solves).values({ userId: student.id, problemId: problem.id, submissionId: "123456", acceptedAt: at(10), verifiedAt: at(30), points: 3, multiplier: 1.5, source: "auto", status: "revoked" });
  const html = renderToStaticMarkup(await Submissions(props({ contestId: String(contestId) })));
  expect(html).toContain("Student submissions");
  expect(html).toContain("Asha"); expect(html).toContain("a@c.edu");
  expect(html).toContain('href="https://leetcode.com/submissions/detail/123456/"');
  expect(html).toContain(at(10).toISOString()); expect(html).toContain(at(30).toISOString());
  expect(html).toContain("Revoked"); expect(html).toContain("1.5×");
  expect(html).toContain("LeetCode may restrict access");
  await expect(Submissions(props({ page: "-1" }))).rejects.toMatchObject({ digest: "NEXT_HTTP_ERROR_FALLBACK;404" });
  await expect(Submissions(props({ status: "unknown" }))).rejects.toMatchObject({ digest: "NEXT_HTTP_ERROR_FALLBACK;404" });
});
