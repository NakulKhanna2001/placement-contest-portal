import type { Db } from "@/db";
import { auditLog, users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { HttpError } from "@/lib/errors";
export async function writeAudit(db: Db, entry: { actorId: number; action: string; target: string; details?: string; now: Date }) {
  const { now, ...values } = entry;
  await db.insert(auditLog).values({ ...values, createdAt: now });
}
export async function requireAdmin(db: Db, id: number) {
  const [user] = await db.select().from(users).where(eq(users.id, id));
  if (user?.role !== "admin") throw new HttpError(403, "forbidden");
}
