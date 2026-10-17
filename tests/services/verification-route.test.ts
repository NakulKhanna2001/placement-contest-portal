import { afterEach, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
const { auth, getDb, profileBio } = vi.hoisted(() => ({ auth: vi.fn(), getDb: vi.fn(), profileBio: vi.fn() }));
vi.mock("@/auth", () => ({ auth }));
vi.mock("@/db", () => ({ getDb }));
vi.mock("@/leetcode/client", () => ({ createLeetCodeClient: () => ({ profileBio, recentAccepted: async () => [] }) }));
import { POST } from "@/app/api/link/route";
import { createTestDb, closeTestDbs } from "@/db/test-db";
import { users } from "@/db/schema";
import { hasVerifiedLeetCode } from "@/lib/contest-access";
afterEach(async () => { vi.useRealTimers(); vi.clearAllMocks(); await closeTestDbs(); });
const request = (body: unknown) => new Request("https://portal.test/api/link", { method: "POST", headers: { "Content-Type": "application/json", Origin: "https://portal.test" }, body: JSON.stringify(body) });

it("lets an unverified signed-in student complete ownership verification", async () => {
  const db = await createTestDb(); getDb.mockReturnValue(db);
  const [student] = await db.insert(users).values({ email: "student@example.test" }).returning();
  auth.mockResolvedValue({ user: { id: student.id, role: "student", leetcodeVerified: false } });
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-17T09:00:00Z"));
  const request = (body: unknown) => new Request("https://portal.test/api/link", { method: "POST", headers: { "Content-Type": "application/json", Origin: "https://portal.test" }, body: JSON.stringify(body) });
  const beginning = await POST(request({ action: "begin" }));
  expect(beginning.status).toBe(200);
  const { token } = await beginning.json();
  expect(token).toMatch(/^contest-/);
  profileBio.mockResolvedValue(`My profile ${token}`);
  vi.setSystemTime(new Date("2026-10-17T09:00:06Z"));
  const confirmation = await POST(request({ action: "confirm", username: "verified-student", campus: "sonepat", studyYear: 2 }));
  expect(confirmation.status).toBe(200);
  const [saved] = await db.select().from(users).where(eq(users.id, student.id));
  expect(hasVerifiedLeetCode(saved)).toBe(true);
  expect(saved).toMatchObject({ campus: "sonepat", studyYear: 2 });
});

it("requires valid campus and year before checking LeetCode or changing verification", async () => {
  const db = await createTestDb(); getDb.mockReturnValue(db);
  const [student] = await db.insert(users).values({ email: "missing@example.test", verifyToken: "contest-token" }).returning();
  auth.mockResolvedValue({ user: { id: student.id, role: "student" } });
  for (const details of [{}, { campus: "pune" }, { studyYear: 1 }, { campus: "delhi", studyYear: 1 }, { campus: "pune", studyYear: 0 }, { campus: "pune", studyYear: 5 }, { campus: "pune", studyYear: 1.5 }]) {
    expect((await POST(request({ action: "confirm", username: "student", ...details }))).status).toBe(400);
  }
  expect(profileBio).not.toHaveBeenCalled();
  const [saved] = await db.select().from(users).where(eq(users.id, student.id));
  expect(saved).toMatchObject({ campus: null, studyYear: null, leetcodeVerifiedAt: null, lastLinkAttemptAt: null });
});

it("does not save campus or year when ownership verification fails", async () => {
  const db = await createTestDb(); getDb.mockReturnValue(db);
  const [student] = await db.insert(users).values({ email: "wrong-token@example.test", verifyToken: "contest-token" }).returning();
  auth.mockResolvedValue({ user: { id: student.id, role: "student" } });
  profileBio.mockResolvedValue("No ownership code");
  const response = await POST(request({ action: "confirm", username: "student", campus: "bengaluru", studyYear: 3 }));
  expect(response.status).toBe(422);
  const [saved] = await db.select().from(users).where(eq(users.id, student.id));
  expect(saved).toMatchObject({ campus: null, studyYear: null, leetcodeUsername: null, leetcodeVerifiedAt: null });
});
