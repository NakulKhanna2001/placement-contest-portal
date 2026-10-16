"use client";
import { useEffect, useState } from "react";

export type BoardRow = { userId: number; rank: number; name: string; points: number; hardsSolved: number };
export function BoardTable({ rows }: { rows: BoardRow[] }) {
  return rows.length ? <div className="table-wrap"><table><thead><tr><th>Rank</th><th>Student</th><th>Points</th><th>Hards</th></tr></thead><tbody>{rows.map(r => <tr key={r.userId}><td><span className={r.rank <= 3 ? "rank-top" : ""}>{r.rank}</span></td><td>{r.name}</td><td><strong>{r.points.toFixed(1)}</strong></td><td>{r.hardsSolved}</td></tr>)}</tbody></table></div> : <div className="empty"><h3>No solves yet</h3><p>Verified submissions will appear here.</p></div>;
}

export function LiveBoard({ contestId, initial }: { contestId: number; initial: BoardRow[] }) {
  const [snapshot, setSnapshot] = useState<{ rows: BoardRow[]; receivedAt: number } | null>(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    let controller: AbortController | null = null;
    const load = async () => {
      if (stopped) return;
      if (document.hidden) { timer = setTimeout(load, 12000); return; }
      controller?.abort();
      const requestController = new AbortController();
      controller = requestController;
      try {
        const res = await fetch(`/api/leaderboard?contestId=${contestId}`, { signal: requestController.signal });
        if (!res.ok) throw new Error("Leaderboard unavailable");
        const data = await res.json();
        if (!stopped && controller === requestController) { setSnapshot({ rows: data.board, receivedAt: Date.now() }); setError(false); }
      } catch { if (!stopped && controller === requestController) setError(true); }
      finally { if (!stopped && controller === requestController) timer = setTimeout(load, 12000); }
    };
    const onSolve = () => { clearTimeout(timer); void load(); };
    timer = setTimeout(load, 12000);
    window.addEventListener("contest:solve", onSolve);
    return () => { stopped = true; controller?.abort(); clearTimeout(timer); window.removeEventListener("contest:solve", onSolve); };
  }, [contestId]);
  return <section className="card leaderboard-card"><div className="section-head"><h2>Leaderboard</h2><span className="live-label"><span className="status-dot" />Live</span></div><p className="status-line">Updates every 12 seconds</p><BoardTable rows={snapshot?.rows ?? initial} />{error && <p role="status" className="notice error">Connection interrupted. Showing the last standings; retrying shortly.</p>}</section>;
}
