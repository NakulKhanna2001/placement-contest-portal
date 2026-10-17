"use client";
import { useEffect, useState } from "react";
import { campuses, campusLabels, studyYears, yearLabels, hasStudentDetails, type Campus } from "@/lib/student-profile";
import { filterLeaderboard } from "@/lib/leaderboard-filters";
import { elapsedSolveTime, type BoardDetails, type ProblemColumn, type ProblemSolve } from "@/lib/leaderboard-details";
import { formatIndiaDateTime } from "@/lib/india-time";
import { LocalDateTime } from "./components/local-date-time";

export type BoardRow = { userId: number; rank: number; name: string; points: number; hardsSolved: number; campus: Campus | null; studyYear: number | null; solves?: ProblemSolve[] };
export function BoardTable({ rows, details }: { rows: BoardRow[]; details?: BoardDetails }) {
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
    {!!details && <p className="card-footnote">Counted accepted solves only. Purple cells mark bonus solves; green cells mark regular solves. Each solved cell shows points, elapsed time since contest start, and LeetCode acceptance time in IST. A dash means no counted solve. Locked problem names stay hidden until you unlock that batch.</p>}
    {selected.length || details ? <div className={`table-wrap ${details ? "standings-scroll" : ""}`} tabIndex={details ? 0 : undefined} role={details ? "region" : undefined} aria-label={details ? "Problem-by-problem standings; scroll to see every batch" : undefined}><table className={details ? "standings-table" : undefined}>
      <caption className="sr-only">{scope} standings</caption>
      <thead><tr><th scope="col">Rank</th><th scope="col">Student</th><th scope="col">Points</th><th scope="col">Hards</th>{details && <th scope="col">Solved</th>}{details?.problems.map(column => <th scope="col" key={column.id} className="standings-problem">
        {column.problem ? <a href={`https://leetcode.com/problems/${column.problem.slug}/`} target="_blank" rel="noreferrer"><strong>{column.label}</strong><span className="problem-column-title">{column.problem.title}</span><span className={`badge ${column.problem.difficulty}`}>{column.problem.difficulty} · {column.problem.points} pts</span></a> : <><strong>{column.label}</strong><span className="problem-column-title">Locked</span></>}
      </th>)}</tr></thead>
      <tbody>{selected.map(row => <tr key={row.userId}>
        <td><span className={row.rank <= 3 ? "rank-top" : ""}>{row.rank}</span>{filtered && <span className="board-profile">Overall #{row.overallRank}</span>}</td>
        <td><span>{row.name}</span><span className="board-profile">{hasStudentDetails(row) ? `${campusLabels[row.campus]} · ${yearLabels[row.studyYear]}` : "Campus/year not set"}</span></td>
        <td><strong>{row.points.toFixed(1)}</strong></td><td>{row.hardsSolved}</td>
        {details && <td>{row.solves?.length ?? 0}</td>}
        {details?.problems.map(column => {
          const solve = row.solves?.find(s => s.problemId === column.id);
          return <td key={column.id} className={solve ? `standings-solved${solve.multiplier > 1 ? " standings-bonus" : ""}` : "standings-unsolved"}>
            {solve ? <div title={`Verified on portal: ${formatIndiaDateTime(solve.verifiedAt, false, true)}`}>
              <strong><span aria-label="Accepted">✓</span> {solve.points.toFixed(1)}</strong>
              {solve.multiplier > 1 && <span className="solve-bonus">{solve.multiplier}×</span>}
              <span className="solve-elapsed">{elapsedSolveTime(solve.acceptedAt, details.startsAt)}</span>
              <span className="solve-clock"><LocalDateTime value={solve.acceptedAt} timeOnly seconds /></span>
              {solve.source === "manual" && <span className="board-profile">Admin grant</span>}
            </div> : <span aria-label="No counted solve">—</span>}
          </td>;
        })}
      </tr>)}</tbody>
    </table></div> : null}
    {!selected.length && <div className="empty"><h3>{rows.length ? "No matching students" : "No solves yet"}</h3><p>{rows.length ? "Try another campus or year, or clear the filters." : "Verified submissions will appear here."}</p></div>}
    {rows.some(row => !hasStudentDetails(row)) && <p className="card-footnote">Students with missing details appear in overall standings until they add their campus and year on Account.</p>}
  </div>;
}

export function LiveBoard({ contestId, initial, details }: { contestId: number; initial: BoardRow[]; details?: BoardDetails }) {
  const detailed = !!details;
  const [snapshot, setSnapshot] = useState<{ contestId: number; detailed: boolean; rows: BoardRow[]; problems?: ProblemColumn[] } | null>(null);
  const [failedKey, setFailedKey] = useState<string | null>(null);
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
        const res = await fetch(`/api/leaderboard?contestId=${contestId}${detailed ? "&details=1" : ""}`, { signal: requestController.signal });
        if (!res.ok) throw new Error("Leaderboard unavailable");
        const data = await res.json();
        if (!stopped && controller === requestController) { setSnapshot({ contestId, detailed, rows: data.board, problems: data.problems }); setFailedKey(null); }
      } catch { if (!stopped && controller === requestController) setFailedKey(`${contestId}:${detailed}`); }
      finally { if (!stopped && controller === requestController) timer = setTimeout(load, 12000); }
    };
    const onSolve = () => { clearTimeout(timer); void load(); };
    timer = setTimeout(load, 12000);
    window.addEventListener("contest:solve", onSolve);
    return () => { stopped = true; controller?.abort(); clearTimeout(timer); window.removeEventListener("contest:solve", onSolve); };
  }, [contestId, detailed]);
  const current = snapshot?.contestId === contestId && snapshot.detailed === detailed ? snapshot : null;
  return <section className="card leaderboard-card"><div className="section-head"><h2>{detailed ? "Problem-by-problem standings" : "Leaderboard"}</h2><span className="live-label"><span className="status-dot" />Live updates</span></div><p className="status-line">Updates every 12 seconds</p><BoardTable key={`${contestId}:${detailed}`} rows={current?.rows ?? initial} details={details ? { ...details, problems: current?.problems ?? details.problems } : undefined} />{failedKey === `${contestId}:${detailed}` && <p role="status" className="notice error">Connection interrupted. Showing the last standings; retrying shortly.</p>}</section>;
}
