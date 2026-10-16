import { createTestDb } from "@/db/test-db";
import { users } from "@/db/schema";
import { createContest } from "@/services/contest";
import type { LeetCodeClient } from "@/leetcode/client";
import type { AcceptedSubmission } from "@/lib/types";
export const start = new Date("2026-10-17T10:00:00Z");
export const at = (minutes: number) => new Date(+start + minutes * 60000);
export const link = (id: string) => `https://leetcode.com/submissions/detail/${id}/`;
export const batch = (n: number) => [
  { difficulty: "easy" as const, slug: `easy-${n}-a`, title: "Easy A" },
  { difficulty: "easy" as const, slug: `easy-${n}-b`, title: "Easy B" },
  { difficulty: "medium" as const, slug: `medium-${n}`, title: "Medium" },
  { difficulty: "hard" as const, slug: `hard-${n}`, title: "Hard" },
];
export const fake = (list: AcceptedSubmission[] = [], fail = false): LeetCodeClient => ({ recentAccepted: async () => { if (fail) throw new Error("down"); return list; }, profileBio: async () => "" });
export async function setup() {
  const db = await createTestDb();
  const contestId = await createContest(db, { title: "Saturday Sprint", startsAt: start, batches: [batch(1), batch(2), batch(3)] });
  const [student, other, admin] = await db.insert(users).values([
    { email: "a@c.edu", name: "Asha", leetcodeUsername: "asha", leetcodeVerifiedAt: at(-10) },
    { email: "b@c.edu", name: "Bo", leetcodeUsername: "bo", leetcodeVerifiedAt: at(-10) },
    { email: "admin@c.edu", name: "Admin", role: "admin" as const },
  ]).returning();
  return { db, contestId, student, other, admin };
}
