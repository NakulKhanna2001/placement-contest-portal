import { asc, eq } from "drizzle-orm";
import { notFound, redirect } from "next/navigation";
import { getSession } from "@/services/viewer";
import { getContestCatalog } from "@/services/contest-catalog";
import { getDb } from "@/db";
import { batches, disqualifications, problems, solves, users } from "@/db/schema";
import { getLeaderboard } from "@/services/leaderboard";
import { BoardTable } from "../../live-board";
import { PageHeader } from "../../components/page-header";
import { ReportForm } from "../report-form";

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
  if (now <= contest.endsAt) return <main><PageHeader eyebrow="RESULTS" title="This round is still in progress." description={`Results and reporting open after ${contest.endsAt.toUTCString()}.`} /></main>;
  const [board, rows, dq] = await Promise.all([
    getLeaderboard(db, contestId),
    db.select({ id: solves.id, userId: solves.userId, name: users.name, problemId: problems.id, title: problems.title, acceptedAt: solves.acceptedAt, points: solves.points, source: solves.source, status: solves.status }).from(solves).innerJoin(users, eq(solves.userId, users.id)).innerJoin(problems, eq(solves.problemId, problems.id)).innerJoin(batches, eq(problems.batchId, batches.id)).where(eq(batches.contestId, contestId)).orderBy(asc(solves.acceptedAt)),
    db.select().from(disqualifications).where(eq(disqualifications.contestId, contestId)),
  ]);
  const participants = new Map<number, { name: string; rows: typeof rows }>();
  for (const row of rows) {
    const participant = participants.get(row.userId) ?? { name: row.name, rows: [] };
    participant.rows.push(row); participants.set(row.userId, participant);
  }
  const disqualified = new Set(dq.map(d => d.userId));
  const provisional = +now <= +contest.endsAt + contest.graceSeconds * 1000;
  return <main>
    <PageHeader eyebrow={`Contest ${contest.id}`} title={contest.title} description={provisional ? "Results may change while students submit their remaining links." : "Submissions are closed. Admin reviews may still adjust standings."} aside={<span className="badge neutral">{provisional ? "Provisional" : "Final standings"}</span>} />
    <section className="card"><div className="section-head"><h2>{provisional ? "Current standings" : "Final standings"}</h2><span className="status-line">{board.length} ranked participants</span></div><BoardTable rows={board} /></section>
    <div className="section-head"><h2>Solves by participant</h2><span className="status-line">{rows.length} solve records</span></div>
    {[...participants.entries()].map(([id, participant]) => <section className="card" key={id}>
      <div className="section-head"><h2>{participant.name}</h2>{disqualified.has(id) && <span className="badge hard">Disqualified</span>}</div>
      <div className="table-wrap"><table><thead><tr><th>Problem</th><th>Accepted at (UTC)</th><th>Points</th><th>Status</th></tr></thead><tbody>{participant.rows.map(r => <tr key={r.id}><td>{r.title}</td><td className="mono">{r.acceptedAt.toISOString()}</td><td>{r.points}</td><td>{r.status}{r.source === "manual" ? " · admin grant" : ""}</td></tr>)}</tbody></table></div>
      {session.user.id !== id && <ReportForm contestId={contestId} targetUserId={id} problems={participant.rows.map(r => ({ id: r.problemId, title: r.title }))} />}
    </section>)}
  </main>;
}
