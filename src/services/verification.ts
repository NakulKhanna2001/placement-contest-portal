import { randomBytes } from "node:crypto";
import { and, eq, isNull, sql } from "drizzle-orm";
import type { Db } from "@/db";
import { users } from "@/db/schema";
import type { LeetCodeClient } from "@/leetcode/client";
export async function beginLink(db: Db, userId: number): Promise<string> {
  return db.transaction(async tx => {
    const [me] = await tx.select().from(users).where(eq(users.id, userId)).for("update");
    if (!me || me.leetcodeUsername) throw new Error("already_linked");
    if (me.verifyToken) return me.verifyToken;
    const token = `contest-${randomBytes(16).toString("hex")}`;
    await tx.update(users).set({ verifyToken: token }).where(eq(users.id, userId));
    return token;
  });
}
export type LinkResult = { ok: true; username: string } | { ok: false; reason: "no_token" | "user_not_found" | "token_missing" | "username_taken" | "already_linked" | "invalid_username" };
export async function confirmLink(db: Db, client: LeetCodeClient, userId: number, username: string, now: Date): Promise<LinkResult> {
  const name = username.trim().toLowerCase();
  if (!/^[a-z0-9_-]{1,30}$/.test(name)) return { ok: false, reason: "invalid_username" };
  const [me] = await db.select().from(users).where(eq(users.id, userId));
  if (me?.leetcodeUsername) return { ok: false, reason: "already_linked" };
  if (!me?.verifyToken) return { ok: false, reason: "no_token" };
  const [taken] = await db.select().from(users).where(sql`lower(${users.leetcodeUsername}) = ${name}`);
  if (taken) return { ok: false, reason: "username_taken" };
  const bio = await client.profileBio(name);
  if (bio === null) return { ok: false, reason: "user_not_found" };
  if (!bio.includes(me.verifyToken)) return { ok: false, reason: "token_missing" };
  try {
    const changed = await db.update(users).set({ leetcodeUsername: name, leetcodeVerifiedAt: now, verifyToken: null })
      .where(and(eq(users.id, userId), isNull(users.leetcodeUsername), eq(users.verifyToken, me.verifyToken))).returning();
    return changed.length ? { ok: true, username: name } : { ok: false, reason: "already_linked" };
  } catch (error) {
    const cause = error instanceof Error ? error.cause : null;
    if ((cause as { code?: string })?.code === "23505") return { ok: false, reason: "username_taken" };
    throw error;
  }
}
