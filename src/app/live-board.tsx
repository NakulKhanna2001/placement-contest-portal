"use client";
import { useEffect, useState } from "react";
import { campuses, campusLabels, studyYears, yearLabels, hasStudentDetails, type Campus } from "@/lib/student-profile";
import { filterLeaderboard } from "@/lib/leaderboard-filters";

export type BoardRow = { userId: number; rank: number; name: string; points: number; hardsSolved: number; campus: Campus | null; studyYear: number | null };
export function BoardTable({ rows }: { rows: BoardRow[] }) {
  const [campus, setCampus] = useState<Campus | "">("");
  const [studyYear, setStudyYear] = useState<number | "">("");
  const filtered = !!campus || !!studyYear;
  const selected = filterLeaderboard(rows, campus, studyYear);
  const scope = [campus ? campusLabels[campus] : "All campuses", studyYear ? yearLabels[studyYear] : "All years"].join(" · ");
  return <div>
    <div className="board-filters">
      <label>Filter by campus<select value={campus} onChange={event => setCampus(event.target.value as Campus | "")}>
        <option value="">All campuses</option>{campuses.map(value => <option key={value} value={value}>{campusLabels[value]}</option>)}
      </select></label>
      <label>Filter by year<select value={studyYear} onChange={event => setStudyYear(event.target.value ? Number(event.target.value) : "")}>
        <option value="">All years</option>{studyYears.map(value => <option key={value} value={value}>{yearLabels[value]}</option>)}
      </select></label>
    </div>
    <div className="board-filter-summary"><p className="status-line" aria-live="polite">{filtered ? `Ranks within ${scope}` : "Overall standings"} · {selected.length} students</p>{filtered && <button className="button-secondary" type="button" onClick={() => { setCampus(""); setStudyYear(""); }}>Clear filters</button>}</div>
    {selected.length ? <div className="table-wrap"><table>
      <caption className="sr-only">{scope} standings</caption>
      <thead><tr><th scope="col">Rank</th><th scope="col">Student</th><th scope="col">Points</th><th scope="col">Hards</th></tr></thead>
      <tbody>{selected.map(row => <tr key={row.userId}>
        <td><span className={row.rank <= 3 ? "rank-top" : ""}>{row.rank}</span>{filtered && <span className="board-profile">Overall #{row.overallRank}</span>}</td>
        <td><span>{row.name}</span><span className="board-profile">{hasStudentDetails(row) ? `${campusLabels[row.campus]} · ${yearLabels[row.studyYear]}` : "Campus/year not set"}</span></td>
        <td><strong>{row.points.toFixed(1)}</strong></td><td>{row.hardsSolved}</td>
      </tr>)}</tbody>
    </table></div> : <div className="empty"><h3>{rows.length ? "No matching students" : "No solves yet"}</h3><p>{rows.length ? "Try another campus or year, or clear the filters." : "Verified submissions will appear here."}</p></div>}
    {rows.some(row => !hasStudentDetails(row)) && <p className="card-footnote">Students with missing details appear in overall standings until they add their campus and year on Account.</p>}
  </div>;
}

export function LiveBoard({ contestId, initial }: { contestId: number; initial: BoardRow[] }) {
  const [snapshot, setSnapshot] = useState<{ contestId: number; rows: BoardRow[] } | null>(null);
  const [failedContestId, setFailedContestId] = useState<number | null>(null);
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
        if (!stopped && controller === requestController) { setSnapshot({ contestId, rows: data.board }); setFailedContestId(null); }
      } catch { if (!stopped && controller === requestController) setFailedContestId(contestId); }
      finally { if (!stopped && controller === requestController) timer = setTimeout(load, 12000); }
    };
    const onSolve = () => { clearTimeout(timer); void load(); };
    timer = setTimeout(load, 12000);
    window.addEventListener("contest:solve", onSolve);
    return () => { stopped = true; controller?.abort(); clearTimeout(timer); window.removeEventListener("contest:solve", onSolve); };
  }, [contestId]);
  return <section className="card leaderboard-card"><div className="section-head"><h2>Leaderboard</h2><span className="live-label"><span className="status-dot" />Live</span></div><p className="status-line">Updates every 12 seconds</p><BoardTable key={contestId} rows={snapshot?.contestId === contestId ? snapshot.rows : initial} />{failedContestId === contestId && <p role="status" className="notice error">Connection interrupted. Showing the last standings; retrying shortly.</p>}</section>;
}
