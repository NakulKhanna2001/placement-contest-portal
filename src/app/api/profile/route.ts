import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { users } from "@/db/schema";
import { hasVerifiedLeetCode } from "@/lib/contest-access";
import { currentUser, endpoint, readBody, HttpError } from "@/lib/http";
import { studentDetailsInput } from "@/lib/validation";

export function POST(req: Request) { return endpoint(async () => {
  const user = await currentUser();
  const details = await readBody(req, studentDetailsInput);
  await getDb().transaction(async tx => {
    const [profile] = await tx.select().from(users).where(eq(users.id, user.id)).for("update");
    if (!hasVerifiedLeetCode(profile)) throw new HttpError(409, "Complete LeetCode verification with your campus and year first.");
    await tx.update(users).set({ campus: details.campus, studyYear: details.studyYear }).where(eq(users.id, user.id));
  });
  return Response.json({ message: "Student details saved. Leaderboard details update shortly." });
}); }
