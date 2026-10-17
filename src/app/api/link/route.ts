import { z } from "zod";
import { and, eq, isNull, lte, or } from "drizzle-orm";
import { getDb } from "@/db";
import { users } from "@/db/schema";
import { createLeetCodeClient } from "@/leetcode/client";
import { beginLink, confirmLink } from "@/services/verification";
import { currentUser, endpoint, readBody, HttpError } from "@/lib/http";
import { studentDetailsInput } from "@/lib/validation";
const input = z.discriminatedUnion("action", [z.object({ action: z.literal("begin") }), studentDetailsInput.extend({ action: z.literal("confirm"), username: z.string().trim().min(1).max(30) })]);
export function POST(req: Request) { return endpoint(async () => {
  const user = await currentUser();
  const body = await readBody(req, input);
  const db = getDb();
  const now = new Date();
  const claim = await db.update(users).set({ lastLinkAttemptAt: now }).where(and(eq(users.id, user.id), or(isNull(users.lastLinkAttemptAt), lte(users.lastLinkAttemptAt, new Date(+now - 5000))))).returning();
  if (!claim.length) throw new HttpError(429, "Wait five seconds before trying again.");
  if (claim[0].leetcodeUsername) throw new HttpError(409, "Your LeetCode account is already linked.");
  if (body.action === "begin") return Response.json({ token: await beginLink(db, user.id) });
  const result = await confirmLink(db, createLeetCodeClient(), user.id, body.username, now, body);
  return Response.json(result, { status: result.ok ? 200 : 422 });
}); }
