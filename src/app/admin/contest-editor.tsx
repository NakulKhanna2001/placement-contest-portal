"use client";

import { useState } from "react";
import { ApiForm } from "../components/api-form";
import { parseLeetCodeProblemSlug, type ContestEditorData } from "@/lib/contest-form";
import { indiaDateTimeInput, indiaInputToIso } from "@/lib/india-time";

const difficulties = ["easy", "easy", "medium", "hard"] as const;
const emptyBatch = () => difficulties.map(difficulty => ({ difficulty, title: "", slug: "" }));

function ProblemSlugInput({ name, value, onChange }: { name: string; value: string; onChange: (value: string) => void }) {
  return <input name={name} required maxLength={2000} value={value} placeholder="https://leetcode.com/problems/two-sum/" autoCapitalize="none" spellCheck={false}
    ref={input => { input?.setCustomValidity(value && !parseLeetCodeProblemSlug(value) ? "Enter a LeetCode problem URL or a slug such as two-sum (up to 200 characters)." : ""); }}
    onChange={event => onChange(event.target.value)}
    onBlur={() => { const slug = parseLeetCodeProblemSlug(value); if (slug) onChange(slug); }}
    onPaste={event => {
      const input = event.currentTarget;
      const pasted = value.slice(0, input.selectionStart ?? 0) + event.clipboardData.getData("text") + value.slice(input.selectionEnd ?? value.length);
      const slug = parseLeetCodeProblemSlug(pasted);
      if (slug) { event.preventDefault(); onChange(slug); }
    }} />;
}

export function ScheduleForm({ initial, onSaved, onCancel }: {
  initial?: ContestEditorData; onSaved?: () => void; onCancel?: () => void;
}) {
  const initialCount = initial?.batches.length ?? 3;
  const [count, setCount] = useState(initialCount);
  const [draftBatches, setDraftBatches] = useState(() => initial?.batches.map(list => list.map(p => ({ ...p }))) ?? []);
  const initialStart = initial ? indiaDateTimeInput(initial.startsAt) : "";

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
      // Preserve fractional seconds when unchanged; new wall times are always IST.
      startsAt: initial && enteredStart === initialStart ? initial.startsAt : indiaInputToIso(enteredStart),
      status: data.get("status"),
      graceSeconds: Math.round(Number(data.get("grace")) * 60),
      bonusWindowSeconds: Math.round(Number(data.get("bonusWindow")) * 60),
      bonusMultiplier: Number(data.get("bonusMultiplier")),
      batches: Array.from({ length: count }, (_, b) => difficulties.map((difficulty, p) => ({ difficulty, slug: parseLeetCodeProblemSlug(String(data.get(`slug-${b}-${p}`))) ?? data.get(`slug-${b}-${p}`), title: data.get(`title-${b}-${p}`) }))),
    };
    return initial ? { action: "update", contestId: initial.id, revision: initial.revision, contest } : contest;
  }}>
    <div className="two-fields">
      <label>Contest title<input name="title" required maxLength={200} defaultValue={initial?.title ?? ""} placeholder="NST LC Grind #1" /></label>
      <label>Starts at (IST)<input name="startsAt" type="datetime-local" step={1} required defaultValue={initialStart} /></label>
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
        <label>LeetCode problem URL or slug<ProblemSlugInput name={`slug-${b}-${p}`} value={draftBatches[b]?.[p]?.slug ?? ""} onChange={value => editProblem(b, p, "slug", value)} /></label>
      </div>)}
      <p className="card-footnote">Paste the full LeetCode problem URL — we’ll extract the slug automatically. You can also enter a slug such as <code>two-sum</code>.</p>
    </fieldset>)}
  </ApiForm>;
}

export function EditContest({ initial }: { initial: ContestEditorData }) {
  const [editing, setEditing] = useState(false);
  const [saved, setSaved] = useState(false);
  return <div className="contest-editor">
    {editing ? <>
      <h3>Edit contest</h3>
      <p className="muted">All times are in India Standard Time (IST). Choose a future start time before saving.</p>
      <ScheduleForm key={initial.revision} initial={initial} onCancel={() => setEditing(false)} onSaved={() => { setEditing(false); setSaved(true); }} />
    </> : <button type="button" className="button-secondary" onClick={() => { setSaved(false); setEditing(true); }}>Edit contest</button>}
    {saved && <p className="notice" role="status">Contest updated.</p>}
  </div>;
}
