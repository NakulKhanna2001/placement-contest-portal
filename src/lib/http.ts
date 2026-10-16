import { z } from "zod";
import { auth } from "@/auth";
import { HttpError } from "./errors";
export { HttpError } from "./errors";
export async function currentUser(admin = false) {
  const user = (await auth())?.user;
  if (!user?.id) throw new HttpError(401, "Sign in with an authorized Google account.");
  if (admin && user.role !== "admin") throw new HttpError(403, "Admin access required.");
  return user;
}
export async function currentParticipant() {
  const user = await currentUser();
  // Auth.js derives this flag from the current database record on every session
  // read, rather than trusting a claim persisted in the JWT or supplied by a client.
  if (user.leetcodeVerified !== true) throw new HttpError(403, "Verify your LeetCode profile on the Account page before entering contests.");
  return user;
}
export async function readBody<T>(req: Request, schema: z.ZodType<T>): Promise<T> {
  if (req.headers.get("origin") && req.headers.get("origin") !== new URL(req.url).origin) throw new HttpError(403, "Invalid request origin.");
  if (!req.headers.get("content-type")?.startsWith("application/json")) throw new HttpError(415, "Expected application/json.");
  if (Number(req.headers.get("content-length")) > 50000) throw new HttpError(413, "Request too large.");
  const reader = req.body?.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  if (reader) {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > 50000) { await reader.cancel(); throw new HttpError(413, "Request too large."); }
      chunks.push(value);
    }
  }
  const body = Buffer.concat(chunks).toString("utf8");
  try { return schema.parse(JSON.parse(body)); }
  catch (e) { throw new HttpError(400, e instanceof z.ZodError ? e.issues.map(i => i.message).join("; ") : "Invalid JSON."); }
}
export async function endpoint(action: () => Promise<Response>) {
  try { return await action(); }
  catch (e) {
    if (e instanceof HttpError) return Response.json({ error: e.message }, { status: e.status });
    console.error("Request failed", e);
    return Response.json({ error: "The request could not be completed. Please try again." }, { status: 503 });
  }
}
