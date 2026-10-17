import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getDb } from "@/db";
import { getViewer } from "@/services/viewer";
import { adminSubmissionFilters, getAdminSubmissions } from "@/services/admin-submissions";
import { PageHeader } from "../../components/page-header";
import { AutoRefresh } from "../../components/auto-refresh";
import { SubmissionTable } from "./submission-table";

export const dynamic = "force-dynamic";
export const metadata = { title: "Student submissions" };

export default async function Submissions({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const viewer = await getViewer();
  if (!viewer) redirect("/api/auth/signin?callbackUrl=/admin/submissions");
  if (viewer.role !== "admin") return <main><PageHeader title="Admin access required" description="Student submission records are available to administrators only." /></main>;
  const query = await searchParams;
  if ([query.contestId, query.userId, query.status, query.page].some(Array.isArray)) notFound();
  const parsed = adminSubmissionFilters.safeParse({
    contestId: query.contestId ? Number(query.contestId) : undefined,
    userId: query.userId ? Number(query.userId) : undefined,
    status: query.status || undefined, page: query.page ? Number(query.page) : undefined,
  });
  if (!parsed.success) notFound();
  const filters = parsed.data;
  const result = await getAdminSubmissions(getDb(), viewer.id, filters);
  const now = new Date();
  const pages = Math.max(1, Math.ceil(result.total / result.pageSize));
  if (result.page > pages) notFound();
  const pageHref = (page: number) => {
    const params = new URLSearchParams({ page: String(page) });
    if (filters.contestId !== undefined) params.set("contestId", String(filters.contestId));
    if (filters.userId !== undefined) params.set("userId", String(filters.userId));
    if (filters.status) params.set("status", filters.status);
    return `/admin/submissions?${params}`;
  };
  return <main data-page-ready="/admin/submissions">
    <AutoRefresh serverTime={+now} refreshAfterMs={30000} />
    <PageHeader title="Student submissions" description="Inspect saved solves during and after contests, including revoked records and manual grants." aside={<Link className="button button-secondary" href="/admin">Back to admin</Link>} />
    <section className="card">
      <form action="/admin/submissions" method="get" className="submission-filters" key={`${filters.contestId ?? ""}:${filters.userId ?? ""}:${filters.status ?? ""}`}>
        <label>Contest<select name="contestId" defaultValue={filters.contestId ?? ""}><option value="">All contests</option>{result.contests.map(c => <option key={c.id} value={c.id}>{c.title}</option>)}</select></label>
        <label>Student<select name="userId" defaultValue={filters.userId ?? ""}><option value="">All students</option>{result.students.map(s => <option key={s.id} value={s.id}>{s.name || "Student"} · {s.email}</option>)}</select></label>
        <label>Status<select name="status" defaultValue={filters.status ?? ""}><option value="">All statuses</option><option value="valid">Valid</option><option value="revoked">Revoked</option></select></label>
        <button type="submit">Filter submissions</button>
        <Link href="/admin/submissions">Clear filters</Link>
      </form>
      <p className="card-footnote">Acceptance time comes from LeetCode; verification time is when the portal saved the solve. Source code is not stored. LeetCode may restrict access to a submission link to its owner.</p>
      <div className="section-head submission-summary"><p className="status-line">{result.total} matching records · Page {result.page} of {pages}</p><span className="status-line">Updates every 30 seconds</span></div>
      <SubmissionTable rows={result.rows} />
      {pages > 1 && <nav className="actions" aria-label="Submission pages">{result.page > 1 && <Link className="button button-secondary" href={pageHref(result.page - 1)}>Previous</Link>}{result.page < pages && <Link className="button button-secondary" href={pageHref(result.page + 1)}>Next</Link>}</nav>}
    </section>
  </main>;
}
