import { and, asc, count, desc, eq } from "drizzle-orm";
import { z } from "zod";
import type { Db } from "@/db";
import { batches, contests, disqualifications, problems, solves, users } from "@/db/schema";
import { id, proofUrl } from "@/lib/validation";
import { requireAdmin } from "./audit";

export const adminSubmissionFilters = z.object({
  contestId: id.optional(), userId: id.optional(), status: z.enum(["valid", "revoked"]).optional(),
  page: z.number().int().min(1).max(1000000).default(1),
});
export type AdminSubmissionFilters = z.input<typeof adminSubmissionFilters>;

export async function getAdminSubmissions(db: Db, adminId: number, input: AdminSubmissionFilters = {}) {
  await requireAdmin(db, adminId);
  const filters = adminSubmissionFilters.parse(input);
  const pageSize = 50;
  const where = and(
    filters.contestId === undefined ? undefined : eq(batches.contestId, filters.contestId),
    filters.userId === undefined ? undefined : eq(solves.userId, filters.userId),
    filters.status === undefined ? undefined : eq(solves.status, filters.status),
  );
  const [rows, [total], contestList, students] = await Promise.all([
    db.select({
      id: solves.id, userId: users.id, name: users.name, email: users.email, leetcodeUsername: users.leetcodeUsername,
      contestId: contests.id, contestTitle: contests.title, problemId: problems.id, problemTitle: problems.title, slug: problems.slug, batchPosition: batches.position,
      submissionId: solves.submissionId, acceptedAt: solves.acceptedAt, verifiedAt: solves.verifiedAt,
      points: solves.points, multiplier: solves.multiplier, status: solves.status, source: solves.source,
      evidence: solves.evidence, disqualificationId: disqualifications.id,
    }).from(solves).innerJoin(users, eq(solves.userId, users.id))
      .innerJoin(problems, eq(solves.problemId, problems.id)).innerJoin(batches, eq(problems.batchId, batches.id))
      .innerJoin(contests, eq(batches.contestId, contests.id))
      .leftJoin(disqualifications, and(eq(disqualifications.contestId, contests.id), eq(disqualifications.userId, users.id)))
      .where(where).orderBy(desc(solves.verifiedAt), desc(solves.id)).limit(pageSize).offset((filters.page - 1) * pageSize),
    db.select({ count: count() }).from(solves).innerJoin(problems, eq(solves.problemId, problems.id))
      .innerJoin(batches, eq(problems.batchId, batches.id)).where(where),
    db.select({ id: contests.id, title: contests.title }).from(contests).orderBy(desc(contests.startsAt)),
    db.select({ id: users.id, name: users.name, email: users.email }).from(users).orderBy(asc(users.name), asc(users.id)),
  ]);
  return {
    rows: rows.map(({ evidence, disqualificationId, ...row }) => ({
      ...row, disqualified: disqualificationId !== null,
      submissionUrl: row.submissionId && /^\d+$/.test(row.submissionId) ? `https://leetcode.com/submissions/detail/${row.submissionId}/` : null,
      evidenceUrl: proofUrl.safeParse(evidence).success ? evidence : null,
    })),
    total: total.count, page: filters.page, pageSize, contests: contestList, students,
  };
}
export type AdminSubmissionRow = Awaited<ReturnType<typeof getAdminSubmissions>>["rows"][number];
