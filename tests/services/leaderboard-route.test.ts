import { afterEach, expect, it, vi } from "vitest";
const { auth, getDb } = vi.hoisted(() => ({ auth: vi.fn(), getDb: vi.fn() }));
vi.mock("@/auth", () => ({ auth }));
vi.mock("@/db", () => ({ getDb }));
vi.mock("@/services/cached-board", () => ({ cachedBoard: async () => [] }));
import { GET } from "@/app/api/leaderboard/route";
import { checkSubmission } from "@/services/submission-checker";
import { closeTestDbs } from "@/db/test-db";
import { at, batch, fake, link, setup } from "../helpers";
afterEach(async () => { vi.useRealTimers(); vi.clearAllMocks(); await closeTestDbs(); });

it("returns private detailed standings using the authenticated viewer, not a supplied user ID", async () => {
  const { db, student, other, contestId } = await setup();
  getDb.mockReturnValue(db);
  for (const [i, p] of batch(1).entries()) await checkSubmission(db, fake([{ id: String(i + 1), slug: p.slug, acceptedAt: at(5 + i) }]), { userId: student.id, link: link(String(i + 1)), now: at(6 + i) });
  vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(at(30));
  const request = new Request(`https://portal.test/api/leaderboard?contestId=${contestId}&details=1&userId=${student.id}`);
  auth.mockResolvedValue({ user: { id: other.id, leetcodeVerified: true } });
  let response = await GET(request);
  expect(response.status).toBe(200);
  expect(response.headers.get("Cache-Control")).toBe("private, no-store");
  let data = await response.json();
  expect(data.problems.filter((p: { problem: unknown }) => p.problem)).toHaveLength(4);
  expect(data.board[0].solves).toHaveLength(4);
  auth.mockResolvedValue({ user: { id: student.id, leetcodeVerified: true } });
  response = await GET(request); data = await response.json();
  expect(data.problems.filter((p: { problem: unknown }) => p.problem)).toHaveLength(8);
  expect((await GET(new Request("https://portal.test/api/leaderboard?contestId=invalid&details=1"))).status).toBe(400);
});

it("allows unverified admins to read all problem columns without a student verification bypass", async () => {
  const { db, admin, contestId } = await setup(); getDb.mockReturnValue(db);
  vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(at(30));
  auth.mockResolvedValue({ user: { id: admin.id, role: "admin", leetcodeVerified: false } });
  const response = await GET(new Request(`https://portal.test/api/leaderboard?contestId=${contestId}&details=1`));
  expect(response.status).toBe(200);
  const data = await response.json();
  expect(data.problems.filter((p: { problem: unknown }) => p.problem)).toHaveLength(12);
});
