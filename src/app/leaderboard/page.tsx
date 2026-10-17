import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getDb } from "@/db";
import { getViewer } from "@/services/viewer";
import { getContestCatalog } from "@/services/contest-catalog";
import { getLeaderboardDetails } from "@/services/leaderboard";
import { contestPhase } from "@/services/contest";
import { hasVerifiedLeetCode } from "@/lib/contest-access";
import { linkDeadline, solveDeadline } from "@/lib/contest-timing";
import { PageHeader } from "../components/page-header";
import { LocalDateTime } from "../components/local-date-time";
import { VerificationRequired } from "../components/verification-required";
import { AutoRefresh } from "../components/auto-refresh";
import { LiveBoard } from "../live-board";

export const dynamic = "force-dynamic";
export const metadata = { title: "Leaderboard" };

export default async function Leaderboard({ searchParams }: { searchParams: Promise<{ contestId?: string | string[] }> }) {
  const viewer = await getViewer();
  if (!viewer) redirect("/api/auth/signin?callbackUrl=/leaderboard");
  if (viewer.role !== "admin" && !hasVerifiedLeetCode(viewer)) return <VerificationRequired />;
  const { contestId } = await searchParams;
  const catalog = await getContestCatalog();
  const now = new Date();
  if (contestId !== undefined && (typeof contestId !== "string" || !Number.isSafeInteger(Number(contestId)) || Number(contestId) <= 0)) notFound();
  const contest = contestId !== undefined ? catalog.find(c => c.id === Number(contestId))
    : catalog.find(c => c.startsAt <= now && now <= linkDeadline(c))
      ?? catalog.filter(c => c.startsAt <= now).sort((a, b) => +b.startsAt - +a.startsAt)[0]
      ?? catalog.filter(c => c.startsAt > now).sort((a, b) => +a.startsAt - +b.startsAt)[0];
  if (!contest && contestId !== undefined) notFound();
  if (!contest) return <main data-page-ready="/leaderboard"><PageHeader title="Leaderboard" description="Problem-by-problem standings will appear once a contest is scheduled." /><Link href="/">View contests</Link></main>;
  const details = await getLeaderboardDetails(getDb(), contest.id, viewer.id, now);
  const phase = contestPhase(contest, now);
  return <main data-page-ready="/leaderboard">
    <AutoRefresh serverTime={+now} />
    <PageHeader title="Leaderboard" description={contest.title} aside={<span className="badge neutral">{phase === "live" ? "Live contest" : phase === "grace" ? "Link grace period" : phase === "scheduled" ? "Upcoming" : "Ended"}</span>} />
    <form action="/leaderboard" method="get" className="standings-picker">
      <label>Contest<select name="contestId" defaultValue={contest.id} key={contest.id}>{catalog.map(c => <option key={c.id} value={c.id}>{c.title}</option>)}</select></label>
      <button type="submit">View standings</button>
      <Link href={now > solveDeadline(contest) ? `/results/${contest.id}` : "/"}>{now > solveDeadline(contest) ? "View results" : "Open contest"}</Link>
    </form>
    <p className="muted">Contest start: <LocalDateTime value={contest.startsAt.toISOString()} />. Each column is one problem; B1.A means Batch 1, problem A.</p>
    {viewer.role === "admin" && <p className="notice">Admin preview: all problem names and links are visible, including unreleased batches. <Link href={`/admin/submissions?contestId=${contest.id}`}>Inspect student submissions</Link></p>}
    <LiveBoard key={contest.id} contestId={contest.id} initial={details.board} details={{ problems: details.problems, startsAt: details.startsAt }} />
  </main>;
}
