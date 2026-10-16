import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { contests } from "@/db/schema";
import { cachedBoard } from "@/services/cached-board";
import { currentUser, endpoint, HttpError } from "@/lib/http";
export function GET(req: Request) { return endpoint(async () => {
  await currentUser();
  const id = Number(new URL(req.url).searchParams.get("contestId"));
  if (!Number.isSafeInteger(id) || id <= 0) throw new HttpError(400, "Invalid contest ID.");
  const [contest] = await getDb().select().from(contests).where(eq(contests.id, id));
  if (!contest || contest.status === "draft") throw new HttpError(404, "Contest not found.");
  return Response.json({ board: await cachedBoard(id) }, { headers: { "Cache-Control": "private, no-store" } });
}); }
