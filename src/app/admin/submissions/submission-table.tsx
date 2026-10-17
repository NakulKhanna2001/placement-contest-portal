import type { AdminSubmissionRow } from "@/services/admin-submissions";
import { LocalDateTime } from "../../components/local-date-time";

export function SubmissionTable({ rows }: { rows: AdminSubmissionRow[] }) {
  if (!rows.length) return <div className="empty"><h3>No matching submissions</h3><p>Try another contest, student or status. Saved solves will appear here after verification.</p></div>;
  return <div className="table-wrap admin-submission-scroll" tabIndex={0} role="region" aria-label="Student submission records">
    <table className="admin-submission-table">
      <caption className="sr-only">Student submission records, including revoked solves and manual grants</caption>
      <thead><tr><th scope="col">Student</th><th scope="col">Contest / problem</th><th scope="col">Submission</th><th scope="col">Accepted at (IST)</th><th scope="col">Verified at (IST)</th><th scope="col">Points</th><th scope="col">Status</th><th scope="col">Source / evidence</th></tr></thead>
      <tbody>{rows.map(row => <tr key={row.id}>
        <td><strong>{row.name || "Student"}</strong><span className="board-profile">{row.email}</span>{row.leetcodeUsername && <a className="board-profile" href={`https://leetcode.com/u/${encodeURIComponent(row.leetcodeUsername)}/`} target="_blank" rel="noreferrer">{row.leetcodeUsername}</a>}</td>
        <td><span className="board-profile">{row.contestTitle} · Batch {row.batchPosition + 1}</span><a href={`https://leetcode.com/problems/${row.slug}/`} target="_blank" rel="noreferrer">{row.problemTitle}</a></td>
        <td><span className="board-profile">Solve #{row.id}</span>{row.submissionUrl ? <a href={row.submissionUrl} target="_blank" rel="noreferrer">Open submission #{row.submissionId}</a> : <span className="muted">{row.source === "manual" ? "Manual grant · no submission link" : "Submission link unavailable"}</span>}</td>
        <td><LocalDateTime value={row.acceptedAt.toISOString()} seconds /></td>
        <td><LocalDateTime value={row.verifiedAt.toISOString()} seconds /></td>
        <td><strong>{row.points.toFixed(1)}</strong>{row.multiplier > 1 && <span className="solve-bonus">{row.multiplier}×</span>}{(row.status === "revoked" || row.disqualified) && <span className="board-profile">Not counted</span>}</td>
        <td><span className={`badge ${row.status === "revoked" ? "hard" : ""}`}>{row.status === "revoked" ? "Revoked" : "Valid"}</span>{row.disqualified && <span className="badge hard">Disqualified</span>}</td>
        <td>{row.source === "manual" ? "Admin grant" : "Automatic"}{row.evidenceUrl && <a className="board-profile" href={row.evidenceUrl} target="_blank" rel="noreferrer">View evidence</a>}</td>
      </tr>)}</tbody>
    </table>
  </div>;
}
