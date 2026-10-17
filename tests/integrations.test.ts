import { afterEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb, closeTestDbs } from "@/db/test-db";
import { users } from "@/db/schema";
import { createLeetCodeClient } from "@/leetcode/client";
import { isAllowedEmail } from "@/lib/auth-rules";
import { beginLink, confirmLink } from "@/services/verification";
afterEach(closeTestDbs);
const now = new Date("2026-10-17T09:00:00Z");
const details = { campus: "pune" as const, studyYear: 1 };
describe("external boundaries", () => {
  it("accepts only an exact, nonempty college email domain", () => {
    expect(isAllowedEmail("A@College.edu", "college.edu")).toBe(true);
    for (const email of [null, "a@college.edu.evil.com", "a@@college.edu", "a@", "a@gmail.com"]) expect(isAllowedEmail(email, "college.edu")).toBe(false);
    expect(isAllowedEmail("a@", "")).toBe(false);
  });
  it("maps LeetCode responses and rejects malformed or failed responses", async () => {
    const client = (body: unknown, status = 200) => createLeetCodeClient(async () => new Response(JSON.stringify(body), { status }));
    expect(await client({ data: { recentAcSubmissionList: [{ id: "1", titleSlug: "two-sum", timestamp: "1792224000" }] } }).recentAccepted("a")).toEqual([{ id: "1", slug: "two-sum", acceptedAt: new Date(1792224000000) }]);
    expect(await client({ data: { matchedUser: null }, errors: [{ message: "That user does not exist." }] }).profileBio("missing")).toBeNull();
    expect(await client({ data: { matchedUser: { profile: { aboutMe: "hi" } } } }).profileBio("a")).toBe("hi");
    await expect(client({}, 503).recentAccepted("a")).rejects.toThrow("503");
    await expect(client({ errors: [{ message: "Throttled" }] }).recentAccepted("a")).rejects.toThrow();
    await expect(client({ data: { recentAcSubmissionList: [{ id: "x", timestamp: "bad" }] } }).recentAccepted("a")).rejects.toThrow();
  });
  it("enforces ownership, case-insensitive uniqueness, and immutable linking", async () => {
    const db = await createTestDb();
    const [a, b] = await db.insert(users).values([{ email: "a@c.edu" }, { email: "b@c.edu" }]).returning();
    let bio = "";
    const client = { recentAccepted: async () => [], profileBio: async () => bio };
    expect(await confirmLink(db, client, a.id, "Asha", now, details)).toMatchObject({ reason: "no_token" });
    bio = await beginLink(db, a.id);
    expect(await confirmLink(db, client, a.id, "Asha", now, details)).toEqual({ ok: true, username: "asha" });
    expect(await confirmLink(db, client, a.id, "different", now, details)).toMatchObject({ reason: "already_linked" });
    bio = await beginLink(db, b.id);
    expect(await confirmLink(db, client, b.id, "ASHA", now, details)).toMatchObject({ reason: "username_taken" });
    bio = "wrong token";
    expect(await confirmLink(db, client, b.id, "bo", now, details)).toMatchObject({ reason: "token_missing" });
    expect((await db.select().from(users).where(eq(users.id, a.id)))[0].leetcodeVerifiedAt).toEqual(now);
    await expect(db.insert(users).values({ email: "c@c.edu", leetcodeUsername: "ASHA" })).rejects.toThrow();
  });
});
