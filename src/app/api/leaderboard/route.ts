import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { contests } from "@/db/schema";
import { cachedBoard } from "@/services/cached-board";
import { currentContestViewer, endpoint, HttpError } from "@/lib/http";
import { getLeaderboardDetails } from "@/services/leaderboard";
export function GET(req: Request) { return endpoint(async () => {
  const viewer = await currentContestViewer();
  const params = new URL(req.url).searchParams;
  const id = Number(params.get("contestId"));
  if (!Number.isSafeInteger(id) || id <= 0) throw new HttpError(400, "Invalid contest ID.");
  if (params.get("details") === "1") return Response.json(await getLeaderboardDetails(getDb(), id, viewer.id, new Date()), { headers: { "Cache-Control": "private, no-store" } });
  const [contest] = await getDb().select().from(contests).where(eq(contests.id, id));
  if (!contest || contest.status === "draft") throw new HttpError(404, "Contest not found.");
  return Response.json({ board: await cachedBoard(id) }, { headers: { "Cache-Control": "private, no-store" } });
}); }
