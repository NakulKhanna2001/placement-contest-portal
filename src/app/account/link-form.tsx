"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { postJson } from "../components/api-form";
import { VerificationGuide } from "../components/verification-guide";
import { StudentDetailsFields } from "./student-details";
import { hasStudentDetails } from "@/lib/student-profile";
export function LinkForm({ initialToken }: { initialToken: string | null }) {
  const [token, setToken] = useState(initialToken);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [copyMessage, setCopyMessage] = useState("");
  const [username, setUsername] = useState("");
  const [campus, setCampus] = useState("");
  const [studyYear, setStudyYear] = useState("");
  const ready = !!username.trim() && hasStudentDetails({ campus, studyYear: Number(studyYear) });
  const router = useRouter();
  async function begin() {
    setBusy(true); setMessage("");
    try { const result = await postJson("/api/link", { action: "begin" }); setToken(result.token); }
    catch (e) { setMessage(e instanceof Error ? e.message : "Could not get a code."); }
    finally { setBusy(false); }
  }
  return <div id="leetcode-verification" tabIndex={-1}><h2>Link your LeetCode account</h2><ol className="rule-list"><li>Get your verification code below.</li><li>Open <a href="https://leetcode.com/settings/profile/" target="_blank" rel="noreferrer">LeetCode profile settings</a>, add the code to <strong>ReadMe</strong>, and save.</li><li>Enter your username, campus, and year, then verify.</li></ol>
    <details className="verification-help"><summary>How to verify — screenshot guide</summary><VerificationGuide /></details>
    {!token ? <button disabled={busy} onClick={begin}>{busy ? "Getting code…" : "Get verification code"}</button> : <><div className="verification-code notice"><code>{token}</code><button type="button" className="button-secondary" onClick={async () => {
      try { await navigator.clipboard.writeText(token); setCopyMessage("Code copied. Paste it into your LeetCode ReadMe and save."); }
      catch { setCopyMessage("Could not copy automatically. Please select and copy the code above."); }
    }}>Copy code</button></div><form className="form-stack" onSubmit={async e => {
    e.preventDefault(); if (!ready || busy) return; setBusy(true); setMessage(""); setCopyMessage("");
    try { await postJson("/api/link", { action: "confirm", username: username.trim(), campus, studyYear: Number(studyYear) }); router.refresh(); }
    catch (e) { setMessage(e instanceof Error ? e.message : "Could not verify your account."); }
    finally { setBusy(false); }
  }}><label>LeetCode username<input name="username" required maxLength={30} placeholder="Your LeetCode username" autoComplete="off" value={username} onChange={event => setUsername(event.target.value)} disabled={busy} /></label>
    <StudentDetailsFields campus={campus} studyYear={studyYear} onCampus={setCampus} onYear={setStudyYear} disabled={busy} />
    <p className="card-footnote">All three fields are required. Your campus and year appear on leaderboards so you can compare your standing with classmates.</p>
    <button disabled={busy || !ready}>{busy ? "Checking profile…" : "Verify account"}</button></form></>}{(message || copyMessage) && <p role="status" className={`notice${message ? " error" : ""}`}>{message || copyMessage}</p>}</div>;
}
