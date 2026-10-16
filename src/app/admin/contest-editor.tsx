"use client";

import { useState } from "react";
import { ApiForm } from "../components/api-form";
import { localDateTimeInput, type ContestEditorData } from "@/lib/contest-form";

const difficulties = ["easy", "easy", "medium", "hard"] as const;
const emptyBatch = () => difficulties.map(difficulty => ({ difficulty, title: "", slug: "" }));

export function ScheduleForm({ initial, onSaved, onCancel }: {
  initial?: ContestEditorData; onSaved?: () => void; onCancel?: () => void;
}) {
  const initialCount = initial?.batches.length ?? 3;
  const [count, setCount] = useState(initialCount);
  const [draftBatches, setDraftBatches] = useState(() => initial?.batches.map(list => list.map(p => ({ ...p }))) ?? []);
  // Edit forms mount only after the client-side Edit click, avoiding an SSR
  // timezone mismatch when the server is in UTC and the admin is elsewhere.
  const initialStart = initial ? localDateTimeInput(initial.startsAt) : "";

  function editProblem(batch: number, problem: number, field: "title" | "slug", value: string) {
    setDraftBatches(previous => {
      const next = [...previous];
      while (next.length <= batch) next.push(emptyBatch());
      next[batch] = next[batch].map((p, i) => i === problem ? { ...p, [field]: value } : p);
      return next;
    });
  }

  return <ApiForm endpoint="/api/admin/contests" label={initial ? "Save changes" : "Save contest"} onSuccess={onSaved} onCancel={onCancel} transform={data => {
    const enteredStart = String(data.get("startsAt"));
    const contest = {
      title: data.get("title"),
      // Preserve the original instant if unchanged, including fractional seconds
      // and ambiguous local times during a daylight-saving clock transition.
      startsAt: initial && enteredStart === initialStart ? initial.startsAt : new Date(enteredStart).toISOString(),
      status: data.get("status"),
      graceSeconds: Math.round(Number(data.get("grace")) * 60),
      bonusWindowSeconds: Math.round(Number(data.get("bonusWindow")) * 60),
      bonusMultiplier: Number(data.get("bonusMultiplier")),
      batches: Array.from({ length: count }, (_, b) => difficulties.map((difficulty, p) => ({ difficulty, slug: data.get(`slug-${b}-${p}`), title: data.get(`title-${b}-${p}`) }))),
    };
    return initial ? { action: "update", contestId: initial.id, revision: initial.revision, contest } : contest;
  }}>
    <div className="two-fields">
      <label>Contest title<input name="title" required maxLength={200} defaultValue={initial?.title ?? ""} placeholder="NST LC Grind #1" /></label>
      <label>Starts at (your local time)<input name="startsAt" type="datetime-local" step={1} required defaultValue={initialStart} /></label>
    </div>
    <div className="two-fields">
      <label>Status<select name="status" defaultValue={initial?.status ?? "scheduled"}><option value="scheduled">Scheduled — visible to students</option><option value="draft">Draft — admins only</option></select></label>
      <label>Hourly batches<input name="batchCount" type="number" min={1} max={12} required defaultValue={initialCount} onChange={e => setCount(Math.max(1, Math.min(12, Number(e.target.value) || 1)))} /></label>
    </div>
    <div className="two-fields">
      <label>Early bonus window (minutes)<input type="number" name="bonusWindow" min={0} max={60} step="any" defaultValue={(initial?.bonusWindowSeconds ?? 900) / 60} required /></label>
      <label>Early multiplier<input type="number" name="bonusMultiplier" min={1} max={10} step="any" defaultValue={initial?.bonusMultiplier ?? 1.5} required /></label>
      <label>Link grace (minutes)<input type="number" name="grace" min={0} max={60} step="any" defaultValue={(initial?.graceSeconds ?? 600) / 60} required /></label>
    </div>
    {Array.from({ length: count }, (_, b) => <fieldset key={b}>
      <legend>Batch {b + 1} · unlocks at +{b}:00</legend>
      {difficulties.map((difficulty, p) => <div className="two-fields problem-fields" key={p}>
        <label>{difficulty} · title<input name={`title-${b}-${p}`} required maxLength={200} value={draftBatches[b]?.[p]?.title ?? ""} onChange={e => editProblem(b, p, "title", e.target.value)} placeholder="Problem title" /></label>
        <label>LeetCode slug<input name={`slug-${b}-${p}`} required pattern="[a-z0-9]+(-[a-z0-9]+)*" maxLength={200} value={draftBatches[b]?.[p]?.slug ?? ""} onChange={e => editProblem(b, p, "slug", e.target.value)} placeholder="two-sum" /></label>
      </div>)}
      <p className="card-footnote">Use the slug only, for example <code>two-sum</code>, not the full URL.</p>
    </fieldset>)}
  </ApiForm>;
}

export function EditContest({ initial }: { initial: ContestEditorData }) {
  const [editing, setEditing] = useState(false);
  const [saved, setSaved] = useState(false);
  return <div className="contest-editor">
    {editing ? <>
      <h3>Edit contest</h3>
      <p className="muted">Times are shown in your local timezone. Choose a future start time before saving.</p>
      <ScheduleForm key={initial.revision} initial={initial} onCancel={() => setEditing(false)} onSaved={() => { setEditing(false); setSaved(true); }} />
    </> : <button type="button" className="button-secondary" onClick={() => { setSaved(false); setEditing(true); }}>Edit contest</button>}
    {saved && <p className="notice" role="status">Contest updated.</p>}
  </div>;
}
