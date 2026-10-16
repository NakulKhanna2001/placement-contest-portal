import { and, eq, getTableColumns, sql, type SQLWrapper } from "drizzle-orm";
import type { Db } from "@/db";
import { auditLog, batches, contests, problems, reports, solves, users } from "@/db/schema";
import { HttpError } from "@/lib/errors";

type JsonDates<T> = { [K in keyof T]: T[K] extends Date ? string : T[K] extends Date | null ? string | null : T[K] };
type StudentOption = Pick<typeof users.$inferSelect, "id" | "name" | "email">;
type ProblemOption = { id: number; title: string; contestId: number; batchPosition: number; slug: string; difficulty: typeof problems.$inferSelect.difficulty };
type SolveOption = { id: number; userId: number; problemId: number; contestId: number; points: number };

function jsonObject(fields: Record<string, SQLWrapper>) {
  return sql`json_build_object(${sql.join(Object.entries(fields).map(([key, column]) => sql`${key}::text, ${column}`), sql`, `)})`;
}

// Nest column expressions so Drizzle's single-table outer select does not
// remove the qualifications needed by joins inside these subqueries.
const qualified = (column: SQLWrapper) => sql`${column}`;

// One statement avoids six remote round trips / pool connection handshakes.
// The outer role predicate protects the entire result and each list shares the
// same PostgreSQL statement snapshot. This is never cached across requests.
export async function getAdminOverview(db: Db, adminId: number) {
  const [row] = await db.select({
    contests: sql<JsonDates<typeof contests.$inferSelect>[]>`coalesce((
      select json_agg(${jsonObject(getTableColumns(contests))} order by ${qualified(contests.startsAt)} desc)
      from ${contests}
    ), '[]'::json)`,
    students: sql<StudentOption[]>`coalesce((
      select json_agg(${jsonObject({ id: users.id, name: users.name, email: users.email })} order by ${qualified(users.name)})
      from ${users}
    ), '[]'::json)`,
    problems: sql<ProblemOption[]>`coalesce((
      select json_agg(${jsonObject({ id: problems.id, title: problems.title, slug: problems.slug, difficulty: problems.difficulty, contestId: batches.contestId, batchPosition: batches.position })} order by ${qualified(problems.id)})
      from ${problems} inner join ${batches} on ${qualified(problems.batchId)} = ${qualified(batches.id)}
    ), '[]'::json)`,
    solves: sql<SolveOption[]>`coalesce((
      select json_agg(${jsonObject({ id: solves.id, userId: solves.userId, problemId: solves.problemId, contestId: batches.contestId, points: solves.points })} order by ${qualified(solves.id)} desc)
      from ${solves} inner join ${problems} on ${qualified(solves.problemId)} = ${qualified(problems.id)}
      inner join ${batches} on ${qualified(problems.batchId)} = ${qualified(batches.id)}
      where ${qualified(solves.status)} = 'valid'
    ), '[]'::json)`,
    reports: sql<JsonDates<typeof reports.$inferSelect>[]>`coalesce((
      select json_agg(${jsonObject(getTableColumns(reports))} order by ${qualified(reports.createdAt)} desc)
      from ${reports} where ${qualified(reports.status)} = 'pending'
    ), '[]'::json)`,
    audits: sql<JsonDates<typeof auditLog.$inferSelect>[]>`coalesce((
      select json_agg(entry) from (
        select ${jsonObject(getTableColumns(auditLog))} as entry
        from ${auditLog} order by ${qualified(auditLog.id)} desc limit 100
      ) recent
    ), '[]'::json)`,
  }).from(users).where(and(eq(users.id, adminId), eq(users.role, "admin"))).limit(1);
  if (!row) throw new HttpError(403, "Admin access required.");
  return {
    ...row,
    contests: row.contests.map(c => ({ ...c, startsAt: new Date(c.startsAt), endsAt: new Date(c.endsAt) })),
    reports: row.reports.map(r => ({ ...r, createdAt: new Date(r.createdAt), reviewedAt: r.reviewedAt ? new Date(r.reviewedAt) : null })),
    audits: row.audits.map(a => ({ ...a, createdAt: new Date(a.createdAt) })),
  };
}
