import { z } from "zod";
import { getDb } from "@/db";
import { currentParticipant, endpoint, readBody } from "@/lib/http";
import { id, text, proofUrl } from "@/lib/validation";
import { fileReport } from "@/services/reports";
export function POST(req: Request) { return endpoint(async () => {
  const user = await currentParticipant();
  const body = await readBody(req, z.object({ contestId: id, targetUserId: id, problemId: id.nullable(), proofUrl, description: text }));
  const result = await fileReport(getDb(), { ...body, reporterId: user.id, now: new Date() });
  return Response.json(result, { status: result.ok ? 200 : 422 });
}); }
