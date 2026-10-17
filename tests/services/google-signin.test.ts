import type { NextAuthConfig } from "next-auth";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
const { state, getDb } = vi.hoisted(() => ({ state: { config: null as NextAuthConfig | null }, getDb: vi.fn() }));
vi.mock("next-auth", () => ({ default: (config: NextAuthConfig) => {
  state.config = config;
  return { handlers: {}, auth: vi.fn(), signIn: vi.fn(), signOut: vi.fn() };
} }));
vi.mock("@/db", () => ({ getDb }));
import "@/auth";
import { createTestDb, closeTestDbs } from "@/db/test-db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";

beforeEach(() => {
  vi.stubEnv("ALLOW_ALL_GOOGLE_ACCOUNTS", "true");
  vi.stubEnv("ALLOWED_EMAIL_DOMAIN", "college.edu");
  vi.stubEnv("ALLOWED_EMAILS", "owner@gmail.com");
  vi.stubEnv("ADMIN_EMAILS", "owner@gmail.com, second@college.edu, third@example.org");
  vi.stubEnv("ADDITIONAL_ADMIN_EMAILS", "");
});
afterEach(async () => { vi.unstubAllEnvs(); await closeTestDbs(); });

const login = (email: string, verified: boolean, provider = "google") => state.config!.callbacks!.signIn!({
  user: { id: "provider-user", email },
  account: { provider, type: "oidc", providerAccountId: "provider-user" },
  profile: { email, email_verified: verified, name: "Test participant", role: "admin" },
});

it("persists public Google users as students regardless of a role in their profile", async () => {
  const db = await createTestDb(); getDb.mockReturnValue(db);
  expect(await login("NewStudent@another.edu", true)).toBe(true);
  expect((await db.select().from(users))[0]).toMatchObject({ email: "newstudent@another.edu", role: "student" });
});

it("supports multiple configured admins and resynchronizes roles on the next login", async () => {
  const db = await createTestDb(); getDb.mockReturnValue(db);
  for (const email of ["owner@gmail.com", "SECOND@college.edu", "third@example.org"]) expect(await login(email, true)).toBe(true);
  expect((await db.select().from(users)).every(u => u.role === "admin")).toBe(true);
  vi.stubEnv("ADMIN_EMAILS", "owner@gmail.com");
  expect(await login("second@college.edu", true)).toBe(true);
  const rows = await db.select().from(users);
  expect(rows).toHaveLength(3);
  expect(rows.find(u => u.email === "second@college.edu")?.role).toBe("student");
});

it("appoints an unregistered additional admin on first verified Google login while retaining existing admins", async () => {
  const db = await createTestDb(); getDb.mockReturnValue(db);
  vi.stubEnv("ADDITIONAL_ADMIN_EMAILS", "new-admin@gmail.com");
  expect(await login("new-admin@gmail.com", false)).toBe(false);
  expect(await db.select().from(users)).toEqual([]);
  for (const email of ["new-admin@gmail.com", "owner@gmail.com", "second@college.edu"]) {
    expect(await login(email, true)).toBe(true);
    expect((await db.select().from(users).where(eq(users.email, email)))[0]).toMatchObject({ role: "admin", leetcodeVerifiedAt: null });
  }
  expect(await login("ordinary-student@gmail.com", true)).toBe(true);
  expect((await db.select().from(users).where(eq(users.email, "ordinary-student@gmail.com")))[0].role).toBe("student");
});

it("does not create accounts for unverified email or a different provider", async () => {
  const db = await createTestDb(); getDb.mockReturnValue(db);
  expect(await login("student@gmail.com", false)).toBe(false);
  expect(await login("student@gmail.com", true, "other-provider")).toBe(false);
  expect(await db.select().from(users)).toEqual([]);
});

it("derives LeetCode verification from the current database record, never a supplied session flag", async () => {
  const db = await createTestDb(); getDb.mockReturnValue(db);
  await login("student@gmail.com", true);
  const callback = state.config!.callbacks!.session!;
  // Auth.js types this callback as an adapter/JWT intersection. Exercise the
  // actual JWT runtime shape, including an intentionally untrusted input flag.
  const readSession = async () => callback({
    session: { user: { email: "student@gmail.com", leetcodeVerified: true }, expires: "2030-01-01T00:00:00Z" },
    token: { email: "student@gmail.com", leetcodeVerified: true },
  } as unknown as Parameters<typeof callback>[0]);
  expect((await readSession()).user).toMatchObject({ leetcodeVerified: false, role: "student" });
  await db.update(users).set({ leetcodeUsername: "verified-student", leetcodeVerifiedAt: new Date() }).where(eq(users.email, "student@gmail.com"));
  expect((await readSession()).user).toMatchObject({ leetcodeVerified: true });
  await db.update(users).set({ leetcodeVerifiedAt: null }).where(eq(users.email, "student@gmail.com"));
  expect((await readSession()).user).toMatchObject({ leetcodeVerified: false });
});
