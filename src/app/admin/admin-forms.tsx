"use client";
import { useState } from "react";
import { ApiForm } from "../components/api-form";
import { indiaInputToIso } from "@/lib/india-time";
type Option = { id: number; label: string };
function Options({ options }: { options: Option[] }) { return options.map(o => <option key={o.id} value={o.id}>{o.label}</option>); }
export { EditContest, ScheduleForm } from "./contest-editor";
export function PublishForm({ contestId }: { contestId: number }) { return <ApiForm endpoint="/api/admin/contests" label="Publish draft" transform={() => ({ action: "publish", contestId })}><span className="muted">Problems stay hidden until their batch unlocks.</span></ApiForm>; }
export function GrantForm({ students, problems }: { students: Option[]; problems: Option[] }) {
  return <ApiForm endpoint="/api/admin/grants" label="Grant solve(s)" transform={data => ({ action: "grant", userIds: data.getAll("userIds").map(Number), problemId: Number(data.get("problemId")), acceptedAt: indiaInputToIso(String(data.get("acceptedAt"))), reason: data.get("reason"), evidence: data.get("evidence") })}><label>Students (select multiple for an outage)<select name="userIds" multiple required size={5}><Options options={students} /></select></label><label>Problem<select name="problemId" required><Options options={problems} /></select></label><label>Accepted at (IST)<input name="acceptedAt" type="datetime-local" step={1} required /></label><label>Reason<input name="reason" required maxLength={2000} /></label><label>Evidence URL<input type="url" name="evidence" required placeholder="https://…" /></label></ApiForm>;
}
export function RevokeForm({ solves }: { solves: Option[] }) { return <ApiForm endpoint="/api/admin/grants" label="Revoke solve" transform={data => ({ action: "revoke", solveId: Number(data.get("solveId")), reason: data.get("reason") })}><label>Solve<select name="solveId" required><Options options={solves} /></select></label><label>Reason<input name="reason" required maxLength={2000} /></label></ApiForm>; }
export function RescoreForm({ contests }: { contests: Option[] }) { return <ApiForm endpoint="/api/admin/grants" label="Recalculate points" transform={data => ({ action: "rescore", contestId: Number(data.get("contestId")), reason: data.get("reason") })}><label>Contest<select name="contestId" required><Options options={contests} /></select></label><label>Reason<input name="reason" required maxLength={2000} /></label></ApiForm>; }
export function ReviewForm({ reportId, solves }: { reportId: number; solves: Option[] }) {
  const [kind, setKind] = useState("dismiss");
  return <ApiForm endpoint="/api/admin/reports" label="Save decision" transform={data => ({ reportId, decision: kind === "revoke_solve" ? { kind, solveId: Number(data.get("solveId")) } : kind === "disqualify" ? { kind, reason: data.get("reason") } : { kind } })}><label>Decision<select value={kind} onChange={e => setKind(e.target.value)}><option value="dismiss">Dismiss report</option><option value="revoke_solve">Uphold · revoke a solve</option><option value="disqualify">Uphold · disqualify from contest</option></select></label>{kind === "revoke_solve" && <label>Reported student’s solve<select name="solveId" required><Options options={solves} /></select></label>}{kind === "disqualify" && <label>Reason<input name="reason" required maxLength={2000} /></label>}</ApiForm>;
}
