import { afterEach, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
const { auth, getDb } = vi.hoisted(() => ({ auth: vi.fn(), getDb: vi.fn() }));
vi.mock("@/auth", () => ({ auth }));
vi.mock("@/db", () => ({ getDb }));
import { POST } from "@/app/api/profile/route";
import { createTestDb, closeTestDbs } from "@/db/test-db";
import { users } from "@/db/schema";
afterEach(async () => { vi.clearAllMocks(); await closeTestDbs(); });
const request = (body: unknown) => new Request("https://portal.test/api/profile", { method: "POST", headers: { "Content-Type": "application/json", Origin: "https://portal.test" }, body: JSON.stringify(body) });

it("lets existing verified members complete or correct only their own campus/year", async () => {
  const db = await createTestDb(); getDb.mockReturnValue(db);
  const verifiedAt = new Date("2026-10-17T09:00:00Z");
  const [student, other] = await db.insert(users).values([
    { email: "legacy@example.test", leetcodeUsername: "legacy", leetcodeVerifiedAt: verifiedAt },
    { email: "other@example.test" },
  ]).returning();
  auth.mockResolvedValue({ user: { id: student.id, role: "student" } });
  const response = await POST(request({ campus: "pune", studyYear: 3, userId: other.id, leetcodeUsername: "changed", role: "admin" }));
  expect(response.status).toBe(200);
  expect((await db.select().from(users).where(eq(users.id, student.id)))[0]).toMatchObject({ campus: "pune", studyYear: 3, leetcodeUsername: "legacy", leetcodeVerifiedAt: verifiedAt, role: "student" });
  expect((await db.select().from(users).where(eq(users.id, other.id)))[0]).toMatchObject({ campus: null, studyYear: null });
  expect((await POST(request({ campus: "hyderabad", studyYear: 4 }))).status).toBe(200);
});

it("requires sign-in, real ownership verification, and valid profile choices", async () => {
  auth.mockResolvedValue(null);
  expect((await POST(request({ campus: "pune", studyYear: 1 }))).status).toBe(401);
  const db = await createTestDb(); getDb.mockReturnValue(db);
  const [student] = await db.insert(users).values({ email: "unverified@example.test" }).returning();
  auth.mockResolvedValue({ user: { id: student.id, role: "student", leetcodeVerified: true } });
  expect((await POST(request({ campus: "pune", studyYear: 1 }))).status).toBe(409);
  expect((await POST(request({ campus: "unknown", studyYear: 5 }))).status).toBe(400);
  expect((await POST(request({ campus: "pune" }))).status).toBe(400);
});
