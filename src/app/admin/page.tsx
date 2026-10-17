import { Suspense } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getViewer } from "@/services/viewer";
import { getDb } from "@/db";
import { getAdminOverview } from "@/services/admin-overview";
import { EditContest, GrantForm, PublishForm, RescoreForm, ReviewForm, RevokeForm, ScheduleForm } from "./admin-forms";
import type { ContestEditorData } from "@/lib/contest-form";
import { PageHeader } from "../components/page-header";
import { ContentSkeleton } from "../components/skeleton";
import { Icon } from "../components/ui-icon";
import { LocalDateTime } from "../components/local-date-time";
import { auditDetailsInIST } from "@/lib/india-time";
import { solveDeadline } from "@/lib/contest-timing";

export const dynamic = "force-dynamic";
export const metadata = { title: "Admin" };

async function AdminWorkspace() {
  const user = await getViewer();
  if (!user) redirect("/api/auth/signin");
  if (user.role !== "admin") return <section className="card empty-state"><Icon name="lock" size={28} /><h2>Admin access required.</h2><p>Contest management is available to authorized administrators.</p></section>;
  const db = getDb();
  const { contests: cs, students, problems: ps, solves: ss, reports: pending, audits } = await getAdminOverview(db, user.id);
  const studentNames = new Map(students.map(s => [s.id, s.name]));
  const problemNames = new Map(ps.map(p => [p.id, p.title]));
  const contestNames = new Map(cs.map(c => [c.id, c.title]));
  const studentName = (id: number) => studentNames.get(id) ?? `Student ${id}`;
  const problemName = (id: number) => problemNames.get(id) ?? `Problem ${id}`;
  const contestName = (id: number) => contestNames.get(id) ?? `Contest ${id}`;
  const solveOption = (s: typeof ss[number]) => ({ id: s.id, label: `#${s.id} · ${studentName(s.userId)} · ${problemName(s.problemId)} · ${s.points} pts` });
  const now = new Date();
  const editorData = (contest: typeof cs[number]): ContestEditorData => {
    const difficultyOrder = { easy: 0, medium: 1, hard: 2 };
    const lists: ContestEditorData["batches"] = [];
    const ordered = ps.filter(p => p.contestId === contest.id).sort((a, b) => a.batchPosition - b.batchPosition || difficultyOrder[a.difficulty] - difficultyOrder[b.difficulty] || a.id - b.id);
    for (const p of ordered) (lists[p.batchPosition] ??= []).push({ difficulty: p.difficulty, title: p.title, slug: p.slug });
    return { id: contest.id, revision: contest.revision, title: contest.title, startsAt: contest.startsAt.toISOString(), status: contest.status, graceSeconds: contest.graceSeconds, bonusWindowSeconds: contest.bonusWindowSeconds, bonusMultiplier: contest.bonusMultiplier, batches: lists };
  };

  return <div className="admin-workspace" data-page-ready="/admin">
    <div className="admin-summary">
      <span>{cs.filter(c => c.status === "scheduled" && solveDeadline(c) >= now).length} scheduled</span>
      <span>{cs.filter(c => c.status === "draft").length} drafts</span>
      <span>{pending.length} reports to review</span>
    </div>
    <div className="columns admin-columns"><div>
      <section className="card"><div className="section-head"><h2>Contest scheduling</h2><Icon name="arena" /></div>
        <details className="create-contest-details"><summary>Create a new contest <span>+</span></summary><p className="muted">Batches release hourly. All problems share a solve deadline one minute after the scheduled contest end. Enter all times in India Standard Time (IST).</p><ScheduleForm /></details>
        <h3 className="subsection-title">Scheduled & draft contests</h3>
        {cs.map(c => <details className="contest-details" key={c.id}>
          <summary><span>{c.title}</span><span className="badge neutral">{c.status === "draft" ? "Draft" : solveDeadline(c) < now ? "Ended" : c.startsAt > now ? "Scheduled" : "Live"}</span></summary>
          <p className="muted">#{c.id} · <LocalDateTime value={c.startsAt.toISOString()} /></p>
          <p><Link className="inline-link" href={`/admin/submissions?contestId=${c.id}`}>View student submissions</Link></p>
          <details><summary>View all contest problems</summary><p className="muted">Admin preview includes every batch, even before release.</p>{ps.filter(p => p.contestId === c.id).sort((a, b) => a.batchPosition - b.batchPosition || a.id - b.id).map(p => <div className="problem" key={p.id}><div><a href={`https://leetcode.com/problems/${p.slug}/`} target="_blank" rel="noreferrer">{p.title} <Icon name="external" size={14} /></a><div className="meta"><span>Batch {p.batchPosition + 1}</span><span className={`badge ${p.difficulty}`}>{p.difficulty}</span></div></div></div>)}</details>
          {c.status === "draft" || c.startsAt > now ? <EditContest initial={editorData(c)} /> : <p className="muted">Editing is locked because this contest has started.</p>}
          {c.status === "draft" && c.startsAt > now && <PublishForm contestId={c.id} />}
          {c.status === "draft" && c.startsAt <= now && <p className="card-footnote">Edit the start time before publishing this draft.</p>}
        </details>)}
        {!cs.length && <div className="empty-inline"><Icon name="clock" /><p>No contests yet. Create a draft to prepare your first round.</p></div>}
      </section>
      <section className="card"><div className="section-head"><h2>Report queue</h2><span className="badge neutral">{pending.length} pending</span></div>
        {!pending.length && <p className="muted">No reports need review.</p>}
        {pending.map(r => <article className="report-row" key={r.id}>
          <h3>#{r.id} · {studentName(r.targetUserId)}</h3><p className="status-line">{contestName(r.contestId)} · reported by {studentName(r.reporterId)}{r.problemId && ` · ${problemName(r.problemId)}`}</p>
          <p className="preserve-lines">{r.description}</p><p><a className="inline-link" href={r.proofUrl} target="_blank" rel="noopener noreferrer">Open evidence <Icon name="external" size={14} /></a></p>
          <ReviewForm reportId={r.id} solves={ss.filter(s => s.userId === r.targetUserId && s.contestId === r.contestId && (r.problemId === null || s.problemId === r.problemId)).map(solveOption)} />
        </article>)}
      </section>
    </div><aside>
      <section className="card"><details><summary>Grant a solve manually</summary><p className="muted">For outages or verified exceptions. Include evidence and the original acceptance time.</p><GrantForm students={students.map(s => ({ id: s.id, label: `${s.name} · ${s.email}` }))} problems={ps.filter(p => cs.some(c => c.id === p.contestId && c.status === "scheduled")).map(p => ({ id: p.id, label: `${contestName(p.contestId)} · ${p.title}` }))} /></details></section>
      <section className="card"><details><summary>Revoke a solve</summary><p className="muted">Remove its points while preserving the record.</p><RevokeForm solves={ss.map(solveOption)} /></details></section>
      <section className="card"><details><summary>Rescore a contest</summary><p className="muted">Recompute points from the recorded times. Revoked solves stay revoked.</p><RescoreForm contests={cs.map(c => ({ id: c.id, label: c.title }))} /></details></section>
    </aside></div>
    <details className="card audit-card"><summary>Recent admin activity</summary><p className="muted">The latest 100 changes. Full history is retained in the database.</p>
      {audits.length ? <div className="table-wrap"><table><thead><tr><th>When (IST)</th><th>Admin</th><th>Action / target</th><th>Details</th></tr></thead><tbody>{audits.map(a => <tr key={a.id}><td><LocalDateTime value={a.createdAt.toISOString()} seconds /></td><td>{a.actorId ? studentName(a.actorId) : "System"}</td><td>{a.action}<br /><span className="muted">{a.target}</span></td><td><details><summary>View</summary><pre>{a.details ? auditDetailsInIST(a.details) : "No additional details"}</pre></details></td></tr>)}</tbody></table></div> : <div className="empty-inline"><Icon name="admin" /><p>No administrative changes recorded yet.</p></div>}
    </details>
  </div>;
}

export default function Admin() {
  const configured = !!process.env.DATABASE_URL && !!process.env.AUTH_SECRET;
  return <main><PageHeader title="Admin" description="Schedule contests and review reports." aside={<Link className="button button-secondary" href="/admin/submissions">Student submissions</Link>} />
    {configured ? <Suspense fallback={<ContentSkeleton variant="admin" />}><AdminWorkspace /></Suspense> : <section className="card"><h2>Set up the application first.</h2><p className="muted">See the README for database and authentication configuration.</p></section>}
  </main>;
}
