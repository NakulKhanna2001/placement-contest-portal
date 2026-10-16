import { z } from "zod";
import { revalidateTag } from "next/cache";
import { getDb } from "@/db";
import { currentUser, endpoint, readBody, HttpError } from "@/lib/http";
import { id, text, proofUrl } from "@/lib/validation";
import { grantSolve, revokeSolve, rescoreContest } from "@/services/grants";
const schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("grant"), userIds: z.array(id).min(1).max(100), problemId: id, acceptedAt: z.coerce.date(), reason: text, evidence: proofUrl }),
  z.object({ action: z.literal("revoke"), solveId: id, reason: text }),
  z.object({ action: z.literal("rescore"), contestId: id, reason: text }),
]);
export function POST(req: Request) { return endpoint(async () => {
  const user = await currentUser(true); const body = await readBody(req, schema); const db = getDb(); const now = new Date();
  let message: string;
  if (body.action === "revoke") {
    if (!await revokeSolve(db, { ...body, adminId: user.id, now })) throw new HttpError(404, "Valid solve not found.");
    message = "Solve revoked.";
  } else if (body.action === "rescore") {
    message = `${await rescoreContest(db, { ...body, adminId: user.id, now })} solves rescored.`;
  } else {
    const results = [];
    for (const userId of new Set(body.userIds)) results.push({ userId, ...await grantSolve(db, { ...body, userId, adminId: user.id, now }) });
    revalidateTag("leaderboard", { expire: 0 });
    return Response.json({ results, message: results.map(r => `Student ${r.userId}: ${r.ok ? `${r.points} points granted` : r.reason.replaceAll("_", " ")}`).join(". ") });
  }
  revalidateTag("leaderboard", { expire: 0 });
  return Response.json({ ok: true, message });
}); }
