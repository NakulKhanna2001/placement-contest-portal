import { timingSafeEqual } from "node:crypto";
import { getDb } from "@/db";
import { createLeetCodeClient } from "@/leetcode/client";
import { snapshotAll } from "@/services/snapshotter";
import { endpoint } from "@/lib/http";
export const maxDuration = 300;
export function GET(req: Request) { return endpoint(async () => {
  const secret = process.env.CRON_SECRET;
  const actual = Buffer.from(req.headers.get("authorization") ?? "");
  const expected = Buffer.from(`Bearer ${secret}`);
  if (!secret || actual.length !== expected.length || !timingSafeEqual(actual, expected)) return Response.json({ error: "unauthorized" }, { status: 401 });
  const result = await snapshotAll(getDb(), createLeetCodeClient(), new Date());
  console.info("snapshot", result);
  return Response.json(result);
}); }
