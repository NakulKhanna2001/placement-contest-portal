import { z } from "zod";
import { revalidateTag } from "next/cache";
import { getDb } from "@/db";
import { currentUser, endpoint, readBody, HttpError } from "@/lib/http";
import { contestInput, id } from "@/lib/validation";
import { createContest, publishContest } from "@/services/contest";
const input = z.union([z.object({ action: z.literal("publish"), contestId: id }), contestInput]);
export function POST(req: Request) { return endpoint(async () => {
  const user = await currentUser(true); const body = await readBody(req, input); const now = new Date();
  if ("action" in body) {
    const ok = await publishContest(getDb(), body.contestId, user.id, now);
    if (!ok) throw new HttpError(409, "Only future draft contests can be published.");
    revalidateTag("contests", { expire: 0 });
    return Response.json({ ok, message: "Contest published." });
  }
  if (body.startsAt <= now) throw new HttpError(400, "Choose a future start time.");
  const contestId = await createContest(getDb(), body, { adminId: user.id, now });
  revalidateTag("contests", { expire: 0 });
  return Response.json({ contestId, message: `Contest ${contestId} created (${body.status}).` });
}); }
