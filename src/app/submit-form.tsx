"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { postJson } from "./components/api-form";
export function SubmitForm() {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState(false);
  const router = useRouter();
  return <section className="card"><h2>Submit a solve</h2><p className="muted">Paste the link to your accepted LeetCode submission.</p><form className="form-stack" onSubmit={async e => {
    e.preventDefault(); setBusy(true); setError(false); setMessage("");
    try { const r = await postJson("/api/submit", { link: new FormData(e.currentTarget).get("link") }); setMessage(`Verified · ${r.points} points${r.multiplier > 1 ? ` with ${r.multiplier}× early bonus` : ""}.`); window.dispatchEvent(new Event("contest:solve")); router.refresh(); }
    catch (e) { setError(true); setMessage(e instanceof Error ? e.message : "Network error. Please retry."); }
    finally { setBusy(false); }
  }}><label>LeetCode submission link<input type="url" name="link" placeholder="https://leetcode.com/submissions/detail/…" required maxLength={500} /></label><button disabled={busy}>{busy ? "Checking submission…" : "Submit solve"}</button>{message && <p role="status" className={`notice ${error ? "error" : ""}`}>{message}</p>}</form></section>;
}
