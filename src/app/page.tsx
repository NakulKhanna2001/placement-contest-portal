import Link from "next/link";
import { and, asc, eq } from "drizzle-orm";
import { signIn } from "@/auth";
import { getDb } from "@/db";
import { batches, problems, solves } from "@/db/schema";
import { contestPhase, visibleProblems } from "@/services/contest";
import { getContestCatalog } from "@/services/contest-catalog";
import { getViewer } from "@/services/viewer";
import { cachedBoard } from "@/services/cached-board";
import { SubmitForm } from "./submit-form";
import { LiveBoard } from "./live-board";
import { AutoRefresh } from "./components/auto-refresh";
import { PageHeader } from "./components/page-header";
import { Icon } from "./components/ui-icon";
import { LocalDateTime } from "./components/local-date-time";
import { VerificationRequired } from "./components/verification-required";
import { hasVerifiedLeetCode } from "@/lib/contest-access";
import { FINAL_SOLVE_SECONDS, linkDeadline, solveDeadline } from "@/lib/contest-timing";

export const dynamic = "force-dynamic";

function ContestRules({ bonusMultiplier = 1.5, bonusWindowSeconds = 900, graceSeconds = 600 }: { bonusMultiplier?: number; bonusWindowSeconds?: number; graceSeconds?: number }) {
  return <details className="card contest-rules">
    <summary>Contest rules</summary>
    <p>Each batch has two Easy, one Medium, and one Hard problem. Verify all four solves to unlock the next batch early for yourself, or wait for its scheduled start. All unlocked problems remain scoreable until one minute after the contest ends.</p>
    <h2>Scoring</h2>
    <div className="table-wrap"><table><thead><tr><th>Difficulty</th><th>Base points</th><th>Early solve</th></tr></thead><tbody>
      {[{ difficulty: "Easy", points: 2 }, { difficulty: "Medium", points: 5 }, { difficulty: "Hard", points: 12 }].map(p => <tr key={p.difficulty}><td>{p.difficulty}</td><td>{p.points}</td><td>{Math.round(p.points * bonusMultiplier * 10) / 10}</td></tr>)}
    </tbody></table></div>
    <p className="card-footnote">Earn {bonusMultiplier}× points for eligible acceptances through {bonusWindowSeconds / 60} minutes after each batch’s original scheduled start, including early-access solves. Later acceptances earn base points until the common solve deadline. You can submit links until {Math.max(graceSeconds, FINAL_SOLVE_SECONDS) / 60} minutes after the contest ends.</p>
    <p className="card-footnote">Rankings use total points, then Hard problems solved, then earliest last solve. LeetCode’s acceptance time determines your score.</p>
  </details>;
}

function GettingStarted() {
  return <section className="card getting-started">
    <h2>How it works</h2>
    <ol className="step-list">
      <li><span className="step-number">1</span><div><strong>Link LeetCode</strong><p>Verify your account to join, even during a live contest.</p></div></li>
      <li><span className="step-number">2</span><div><strong>Solve the problems</strong><p>Each batch opens hourly, or early when you verify all four solves in the previous batch.</p></div></li>
      <li><span className="step-number">3</span><div><strong>Submit your links</strong><p>Paste accepted submission links to earn points.</p></div></li>
    </ol>
  </section>;
}

export default async function Home() {
  const configured = !!process.env.DATABASE_URL && !!process.env.AUTH_SECRET;
  const viewer = await getViewer();
  if (!viewer) return <main data-page-ready="/">
    <section className="welcome">
      <h1>Weekly LeetCode contests</h1>
      <p className="intro">Practice with NST. Solve on LeetCode, submit your accepted links, and see how you rank.</p>
      <p className="contest-format">3 hours <span>·</span> 12 problems <span>·</span> Every Saturday</p>
      <div className="actions"><form action={async () => { "use server"; await signIn("google", { redirectTo: "/account" }); }}><button disabled={!configured}>Sign in with Google</button></form><Link className="secondary-link" href="/results">View results</Link></div>
    </section>
    <GettingStarted />
    <ContestRules />
    {!configured && <section className="notice setup-notice"><Icon name="admin" /><div><h2>Finish local setup</h2><p>Add your Postgres and Google OAuth settings to <code>.env.local</code>, then run <code>npm run db:migrate</code>. The README has the complete setup.</p></div></section>}
  </main>;

  const adminPreview = viewer.role === "admin";
  if (!adminPreview && !hasVerifiedLeetCode(viewer)) return <VerificationRequired />;
  const catalog = await getContestCatalog();
  const now = new Date();
  const contest = catalog.find(c => c.startsAt <= now && now <= linkDeadline(c));
  if (!contest) {
    const next = catalog.filter(c => c.startsAt > now).sort((a, b) => +a.startsAt - +b.startsAt)[0];
    const recent = catalog.filter(c => solveDeadline(c) < now).slice(0, 3);
    return <main data-page-ready="/">
      <AutoRefresh serverTime={+now} refreshAfterMs={next ? +next.startsAt - +now + 1000 : 60000} />
      <PageHeader title="Contests" description="Find the next contest and get ready to participate." />
      <section className="card next-contest">
        <h2>{next?.title ?? "No contest scheduled yet"}</h2>
        <p className="muted">{next ? <><LocalDateTime value={next.startsAt.toISOString()} /> · {Math.round((+next.endsAt - +next.startsAt) / 3600000)} {+next.endsAt - +next.startsAt === 3600000 ? "hour" : "hours"}</> : "Check back soon for the next contest."}</p>
        {!viewer.leetcodeUsername && <p>Link your LeetCode account to participate.</p>}
        <div className="actions">
          {!viewer.leetcodeUsername && <Link className="button" href="/account">Link LeetCode</Link>}
          {viewer.role === "admin" && <Link className={`button ${viewer.leetcodeUsername ? "" : "button-secondary"}`} href="/admin">Schedule a contest</Link>}
          {viewer.leetcodeUsername && viewer.role !== "admin" && <Link className="button button-secondary" href="/account">View account</Link>}
        </div>
        {viewer.leetcodeUsername && <p className="account-readiness"><Icon name="check" size={16} />LeetCode connected: {viewer.leetcodeUsername}</p>}
      </section>
      <ContestRules />
      <section className="card"><div className="section-head"><h2>Recent contests</h2><Link className="inline-link" href="/results">All results <Icon name="arrow" size={15} /></Link></div>
        {recent.length ? recent.map(c => <Link className="archive-row" href={`/results/${c.id}`} key={c.id}><div><strong>{c.title}</strong><span><LocalDateTime value={c.startsAt.toISOString()} /></span></div><Icon name="arrow" /></Link>) : <div className="empty-inline"><Icon name="results" /><p>Completed contests will appear here after the first round.</p></div>}
      </section>
    </main>;
  }

  const db = getDb();
  const [list, batchList, mySolves, board] = await Promise.all([
    visibleProblems(db, contest.id, now, viewer.id),
    db.select().from(batches).where(eq(batches.contestId, contest.id)).orderBy(asc(batches.position)),
    db.select({ problemId: solves.problemId, points: solves.points, status: solves.status }).from(solves)
      .innerJoin(problems, eq(solves.problemId, problems.id)).innerJoin(batches, eq(problems.batchId, batches.id))
      .where(and(eq(solves.userId, viewer.id), eq(batches.contestId, contest.id))),
    cachedBoard(contest.id),
  ]);
  const grace = contestPhase(contest, now) === "grace";
  const closesAt = solveDeadline(contest);
  const linksCloseAt = linkDeadline(contest);
  const nextBoundary = [...batchList.map(b => +b.unlockAt), +contest.endsAt, +closesAt, +linksCloseAt].filter(t => t >= +now).sort((a, b) => a - b)[0];
  return <main data-page-ready="/">
    <AutoRefresh serverTime={+now} refreshAfterMs={nextBoundary ? nextBoundary - +now + 1000 : 60000} />
    <PageHeader title={contest.title} description="Solve on LeetCode, then submit your accepted link below." aside={<span className="badge"><span className="status-dot" />{grace ? "Accepting links" : now > contest.endsAt ? "Final scoring minute" : "Live contest"}</span>} />
    <div className="stats">
      <div className="stat"><span>Solve deadline · all problems</span><strong><LocalDateTime value={closesAt.toISOString()} timeOnly /></strong></div>
      <div className="stat"><span>Link deadline</span><strong><LocalDateTime value={linksCloseAt.toISOString()} timeOnly /></strong></div>
      <div className="stat"><span>Bonus cutoff: scheduled start + {contest.bonusWindowSeconds / 60} min</span><strong>{contest.bonusMultiplier}× <small>bonus</small></strong></div>
      <div className="stat highlight"><span>Your score</span><strong>{board.find(r => r.userId === viewer.id)?.points ?? 0}<small>pts</small></strong></div>
    </div>
    <div className="columns"><div>
      {adminPreview && <p className="notice">Admin preview: all batch problems are visible. Scored submissions still require LeetCode verification and normal batch eligibility.</p>}
      {hasVerifiedLeetCode(viewer) ? <SubmitForm /> : <p className="muted"><Link href="/account">Verify LeetCode</Link> if you also want to submit solves.</p>}
      {batchList.map(b => {
        const batchProblems = list.filter(p => p.batchPosition === b.position);
        const locked = batchProblems.length === 0;
        const early = !adminPreview && !locked && b.unlockAt > now;
        return <section className={`card batch-card ${locked ? "locked" : ""}`} key={b.id}>
        <div className="section-head"><div><h2>Batch {b.position + 1}</h2><p className="status-line">Scheduled opening: <LocalDateTime value={b.unlockAt.toISOString()} timeOnly /> · Solve until <LocalDateTime value={closesAt.toISOString()} timeOnly /></p><p className="status-line">Bonus until <LocalDateTime value={new Date(+b.unlockAt + contest.bonusWindowSeconds * 1000).toISOString()} timeOnly /></p></div><span className={`badge ${closesAt < now || locked ? "neutral" : ""}`}>{locked ? "Locked" : closesAt < now ? "Closed" : adminPreview && b.unlockAt > now ? "Admin preview" : early ? "Early access" : "Open"}</span></div>
        {early && <p className="notice">All four solves in the previous batch are verified. You can start now; the original bonus cutoff and common solve deadline above apply.</p>}
        {locked ? <div className="locked-message"><Icon name="lock" /><p>Verify all four solves in Batch {b.position} to unlock early.<br /><span>Otherwise, problems appear at the scheduled start.</span></p></div> : batchProblems.map(p => {
          const solved = mySolves.find(s => s.problemId === p.id);
          return <div className="problem" key={p.id}><div><a href={`https://leetcode.com/problems/${p.slug}/`} target="_blank" rel="noreferrer">{p.title} <Icon name="external" size={14} /></a><div className="meta"><span className={`badge ${p.difficulty}`}>{p.difficulty}</span>{solved && <span>{solved.status === "valid" ? `✓ Verified · ${solved.points} pts` : "Solve revoked"}</span>}</div></div><span className="points">{p.points}<small> pts</small></span></div>;
        })}
      </section>; })}
    </div><aside><LiveBoard contestId={contest.id} initial={board} /><p><Link className="inline-link" href={`/leaderboard?contestId=${contest.id}`}>View full leaderboard and solve times <Icon name="arrow" size={16} /></Link></p><ContestRules bonusMultiplier={contest.bonusMultiplier} bonusWindowSeconds={contest.bonusWindowSeconds} graceSeconds={contest.graceSeconds} />{grace && <Link className="inline-link" href={`/results/${contest.id}`}>View current results <Icon name="arrow" size={16} /></Link>}</aside></div>
  </main>;
}
