import { asc, eq } from "drizzle-orm";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getSession } from "@/services/viewer";
import { getContestCatalog } from "@/services/contest-catalog";
import { getDb } from "@/db";
import { batches, disqualifications, problems, solves, users } from "@/db/schema";
import { getLeaderboard } from "@/services/leaderboard";
import { visibleProblems } from "@/services/contest";
import { BoardTable } from "../../live-board";
import { PageHeader } from "../../components/page-header";
import { ReportForm } from "../report-form";
import { LocalDateTime } from "../../components/local-date-time";
import { Icon } from "../../components/ui-icon";

export const dynamic = "force-dynamic";
export const metadata = { title: "Contest results" };

export default async function Results({ params }: { params: Promise<{ contestId: string }> }) {
  const contestId = Number((await params).contestId);
  if (!Number.isSafeInteger(contestId) || contestId <= 0 || !process.env.DATABASE_URL) notFound();
  const [session, catalog] = await Promise.all([getSession(), getContestCatalog()]);
  if (!session?.user.id) redirect("/api/auth/signin");
  const contest = catalog.find(c => c.id === contestId);
  if (!contest) notFound();
  const db = getDb(); const now = new Date();
  if (now <= contest.endsAt) return <main>
    <PageHeader title={now < contest.startsAt ? "This contest has not started yet." : "This contest is running."} description="Open the contest page to see its schedule, unlocked problems, and submission form." />
    <p className="muted">Starts <LocalDateTime value={contest.startsAt.toISOString()} /> · Ends <LocalDateTime value={contest.endsAt.toISOString()} /></p>
    <Link className="button" href="/">Open contest</Link>
  </main>;
  const [board, rows, dq, problemList] = await Promise.all([
    getLeaderboard(db, contestId),
    db.select({ id: solves.id, userId: solves.userId, name: users.name, problemId: problems.id, title: problems.title, acceptedAt: solves.acceptedAt, points: solves.points, source: solves.source, status: solves.status }).from(solves).innerJoin(users, eq(solves.userId, users.id)).innerJoin(problems, eq(solves.problemId, problems.id)).innerJoin(batches, eq(problems.batchId, batches.id)).where(eq(batches.contestId, contestId)).orderBy(asc(solves.acceptedAt)),
    db.select().from(disqualifications).where(eq(disqualifications.contestId, contestId)),
    visibleProblems(db, contestId, now),
  ]);
  const participants = new Map<number, { name: string; rows: typeof rows }>();
  for (const row of rows) {
    const participant = participants.get(row.userId) ?? { name: row.name, rows: [] };
    participant.rows.push(row); participants.set(row.userId, participant);
  }
  const disqualified = new Set(dq.map(d => d.userId));
  const provisional = +now <= +contest.endsAt + contest.graceSeconds * 1000;
  const batchPositions = [...new Set(problemList.map(p => p.batchPosition))];
  return <main>
    <PageHeader eyebrow={`Contest ${contest.id}`} title={contest.title} description={provisional ? "Results may change while students submit their remaining links." : "Submissions are closed. The problems remain available for practice."} aside={<span className="badge neutral">{provisional ? "Link grace period" : "Ended"}</span>} />
    <p className="notice">This contest ended <LocalDateTime value={contest.endsAt.toISOString()} />. {provisional ? <>Links are accepted until <LocalDateTime value={new Date(+contest.endsAt + contest.graceSeconds * 1000).toISOString()} />. <Link href="/">Submit remaining links</Link>.</> : "New practice solves will not change these standings."}</p>
    <section className="card">
      <div className="section-head"><h2>Problems</h2><span className="status-line">{problemList.length} problems</span></div>
      {batchPositions.map(position => {
        const list = problemList.filter(p => p.batchPosition === position);
        return <div className="archive-batch" key={position}>
          <h3>Batch {position + 1}</h3>
          <p className="status-line">Original solve window: <LocalDateTime value={list[0].unlockAt.toISOString()} /> — <LocalDateTime value={list[0].closesAt.toISOString()} timeOnly /></p>
          {list.map(p => <div className="problem" key={p.id}><div><a href={`https://leetcode.com/problems/${p.slug}/`} target="_blank" rel="noreferrer">{p.title} <Icon name="external" size={14} /></a><div className="meta"><span className={`badge ${p.difficulty}`}>{p.difficulty}</span></div></div><span className="points">{p.points}<small> pts</small></span></div>)}
        </div>;
      })}
      {!problemList.length && <p className="muted">No problems were configured for this contest.</p>}
    </section>
    <section className="card"><div className="section-head"><h2>{provisional ? "Current standings" : "Final standings"}</h2><span className="status-line">{board.length} ranked participants</span></div><BoardTable rows={board} /></section>
    <div className="section-head"><h2>Solves by participant</h2><span className="status-line">{rows.length} solve records</span></div>
    {[...participants.entries()].map(([id, participant]) => <section className="card" key={id}>
      <div className="section-head"><h2>{participant.name}</h2>{disqualified.has(id) && <span className="badge hard">Disqualified</span>}</div>
      <div className="table-wrap"><table><thead><tr><th>Problem</th><th>Accepted at</th><th>Points</th><th>Status</th></tr></thead><tbody>{participant.rows.map(r => <tr key={r.id}><td>{r.title}</td><td><LocalDateTime value={r.acceptedAt.toISOString()} /></td><td>{r.points}</td><td>{r.status}{r.source === "manual" ? " · admin grant" : ""}</td></tr>)}</tbody></table></div>
      {session.user.id !== id && <ReportForm contestId={contestId} targetUserId={id} problems={participant.rows.map(r => ({ id: r.problemId, title: r.title }))} />}
    </section>)}
  </main>;
}
