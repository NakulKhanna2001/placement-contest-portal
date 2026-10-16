import { z } from "zod";
import { revalidateTag } from "next/cache";
import { getDb } from "@/db";
import { createLeetCodeClient } from "@/leetcode/client";
import { currentParticipant, endpoint, readBody } from "@/lib/http";
import { checkSubmission } from "@/services/submission-checker";
export function POST(req: Request) { return endpoint(async () => {
  const user = await currentParticipant();
  const { link } = await readBody(req, z.object({ link: z.string().min(1).max(500) }));
  const result = await checkSubmission(getDb(), createLeetCodeClient(), { userId: user.id, link, now: new Date() });
  if (result.ok) revalidateTag("leaderboard", { expire: 0 });
  return Response.json(result, { status: result.ok ? 200 : result.reason === "cooldown" ? 429 : 422 });
}); }
