import Link from "next/link";
import { Suspense } from "react";
import { getContestCatalog } from "@/services/contest-catalog";
import { PageHeader } from "../components/page-header";
import { ContentSkeleton } from "../components/skeleton";
import { Icon } from "../components/ui-icon";

export const dynamic = "force-dynamic";
export const metadata = { title: "Results" };

async function ResultsList() {
  const now = new Date();
  const list = process.env.DATABASE_URL ? (await getContestCatalog()).filter(c => c.endsAt < now) : [];
  return <div data-page-ready="/results">
    {list.length ? <section className="card archive-card">
      {list.map(c => <Link className="archive-row" href={`/results/${c.id}`} key={c.id}>
        <div className="archive-title"><strong>{c.title}</strong><span>{c.startsAt.toUTCString()}</span></div>
        <span className="badge neutral">{+now > +c.endsAt + c.graceSeconds * 1000 ? "Final" : "Provisional"}</span><Icon name="arrow" size={18} />
      </Link>)}
      <p className="card-footnote">Standings may change following admin review.</p>
    </section> : <section className="card empty-state"><h2>No results yet</h2><p>Results will appear here after the first contest ends.</p><Link className="button button-secondary" href="/">View contests</Link></section>}
  </div>;
}

export default function ResultsIndex() {
  return <main><PageHeader title="Results" description="View past contests, rankings, and verified solves." /><Suspense fallback={<ContentSkeleton variant="results" />}><ResultsList /></Suspense></main>;
}
