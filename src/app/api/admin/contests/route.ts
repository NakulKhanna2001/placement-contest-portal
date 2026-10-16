import { z } from "zod";
import { revalidateTag } from "next/cache";
import { getDb } from "@/db";
import { currentUser, endpoint, readBody, HttpError } from "@/lib/http";
import { contestInput, id } from "@/lib/validation";
import { createContest, publishContest, updateContest } from "@/services/contest";
const input = z.union([
  z.object({ action: z.literal("publish"), contestId: id }).strict(),
  z.object({ action: z.literal("update"), contestId: id, revision: z.number().int().nonnegative(), contest: z.intersection(contestInput, z.object({ status: z.enum(["draft", "scheduled"]) })) }).strict(),
  // Retain the original create payload, but never treat an unknown action as create.
  z.intersection(contestInput, z.object({ action: z.literal("create").optional() })),
]);
export function POST(req: Request) { return endpoint(async () => {
  const user = await currentUser(true); const body = await readBody(req, input); const now = new Date();
  if (body.action === "publish") {
    const ok = await publishContest(getDb(), body.contestId, user.id, now);
    if (!ok) throw new HttpError(409, "Only future draft contests can be published.");
    revalidateTag("contests", { expire: 0 });
    return Response.json({ ok, message: "Contest published." });
  }
  if (body.action === "update") {
    const contestId = await updateContest(getDb(), body.contest, { adminId: user.id, contestId: body.contestId, revision: body.revision, now });
    revalidateTag("contests", { expire: 0 });
    revalidateTag("leaderboard", { expire: 0 });
    return Response.json({ contestId, message: "Contest updated." });
  }
  if (body.startsAt <= now) throw new HttpError(400, "Choose a future start time.");
  const contestId = await createContest(getDb(), body, { adminId: user.id, now });
  revalidateTag("contests", { expire: 0 });
  return Response.json({ contestId, message: `Contest ${contestId} created (${body.status}).` });
}); }
