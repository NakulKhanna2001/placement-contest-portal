"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { campuses, campusLabels, studyYears, yearLabels, hasStudentDetails } from "@/lib/student-profile";
import { postJson } from "../components/api-form";

export function StudentDetailsFields({ campus, studyYear, onCampus, onYear, disabled = false }: {
  campus: string; studyYear: string; onCampus: (value: string) => void; onYear: (value: string) => void; disabled?: boolean;
}) {
  return <div className="two-fields">
    <label>Campus<select name="campus" required value={campus} onChange={event => onCampus(event.target.value)} disabled={disabled}>
      <option value="">Select your campus</option>{campuses.map(value => <option key={value} value={value}>{campusLabels[value]}</option>)}
    </select></label>
    <label>Year of study<select name="studyYear" required value={studyYear} onChange={event => onYear(event.target.value)} disabled={disabled}>
      <option value="">Select your year</option>{studyYears.map(value => <option key={value} value={value}>{yearLabels[value]}</option>)}
    </select></label>
  </div>;
}

export function StudentDetailsForm({ initialCampus, initialYear }: { initialCampus: string | null; initialYear: number | null }) {
  const [campus, setCampus] = useState(initialCampus ?? "");
  const [studyYear, setStudyYear] = useState(initialYear?.toString() ?? "");
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<{ error: boolean; message: string } | null>(null);
  const router = useRouter();
  return <section id="student-details" tabIndex={-1} className="student-details">
    <h2>Your campus and year</h2><p className="muted">Both are required for campus and year standings. These details appear alongside your name on leaderboards. Keep your year up to date.</p>
    <form className="form-stack" onSubmit={async event => {
      event.preventDefault(); setBusy(true); setFeedback(null);
      try {
        const result = await postJson("/api/profile", { campus, studyYear: Number(studyYear) });
        setFeedback({ error: false, message: result.message }); router.refresh();
      } catch (error) { setFeedback({ error: true, message: error instanceof Error ? error.message : "Could not save your details." }); }
      finally { setBusy(false); }
    }}>
      <StudentDetailsFields campus={campus} studyYear={studyYear} onCampus={setCampus} onYear={setStudyYear} disabled={busy} />
      <button disabled={busy || !hasStudentDetails({ campus, studyYear: Number(studyYear) })}>{busy ? "Saving…" : "Save student details"}</button>
      {feedback && <p role="status" className={`notice${feedback.error ? " error" : ""}`}>{feedback.message}</p>}
    </form>
  </section>;
}
