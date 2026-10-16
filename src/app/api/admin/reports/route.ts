import { z } from "zod";
import { eq } from "drizzle-orm";
import { revalidateTag } from "next/cache";
import { getDb } from "@/db";
import { reports } from "@/db/schema";
import { currentUser, endpoint, readBody, HttpError } from "@/lib/http";
import { id } from "@/lib/validation";
import { decisionSchema, reviewReport } from "@/services/reports";
export function GET() { return endpoint(async () => {
  await currentUser(true);
  return Response.json(await getDb().select().from(reports).where(eq(reports.status, "pending")));
}); }
export function POST(req: Request) { return endpoint(async () => {
  const user = await currentUser(true);
  const body = await readBody(req, z.object({ reportId: id, decision: decisionSchema }));
  const ok = await reviewReport(getDb(), { ...body, adminId: user.id, now: new Date() });
  if (!ok) throw new HttpError(409, "Report already reviewed or the solve does not match the report.");
  revalidateTag("leaderboard", { expire: 0 });
  return Response.json({ ok, message: "Report reviewed. Leaderboard updated." });
}); }
