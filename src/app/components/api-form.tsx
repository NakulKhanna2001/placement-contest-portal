"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
const messages: Record<string, string> = {
  bad_link: "Paste a valid HTTPS LeetCode submission link.",
  no_contest: "No contest is accepting submission links right now.",
  not_linked: "Verify your LeetCode account on the Account page first.",
  linked_too_late: "Your account was linked after this contest started. You can participate in the next contest.",
  cooldown: "Wait five seconds before submitting another link.",
  not_found: "That accepted submission was not found on your linked account or in the archive. Check the ID, retry shortly, or contact an admin with proof if it is older.",
  not_contest_problem: "This problem is not part of the current contest.",
  outside_window: "The submission was accepted outside its problem’s one-hour window.",
  already_solved: "An equal or earlier solve already counts for this problem, or the solve was revoked by an admin.",
  lookup_failed: "LeetCode is not responding. Try again in a minute; contact an admin with proof if the outage continues.",
  disqualified: "You have been disqualified from this contest. Contact an admin for details.",
  token_missing: "The code was not found in your LeetCode bio. Save the bio, then retry.",
  no_token: "Get your verification code first.",
  user_not_found: "That LeetCode username was not found.",
  username_taken: "That LeetCode account is already linked to another student.",
  already_linked: "Your LeetCode account is already linked.",
  invalid_username: "Enter a valid LeetCode username.",
  duplicate: "You have already reported this participant in this contest.",
  self_report: "You cannot report yourself.",
  contest_not_ended: "Reports open after the contest ends.",
  no_proof: "Include a valid evidence URL and a description.",
  invalid_target: "Choose a participant and problem from this contest’s solve records.",
};
export async function postJson(url: string, body: unknown) {
  const response = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error ?? messages[result.reason] ?? "Request failed. Please try again.");
  return result;
}
export function ApiForm({ endpoint, children, label, transform, success = "Saved." }: {
  endpoint: string; children: React.ReactNode; label: string; transform: (data: FormData) => unknown; success?: string;
}) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState(false);
  const router = useRouter();
  return <form className="form-stack" aria-busy={busy} onSubmit={async e => {
    e.preventDefault(); setBusy(true); setMessage(""); setError(false);
    try { const result = await postJson(endpoint, transform(new FormData(e.currentTarget))); setMessage(result.message ?? success); router.refresh(); }
    catch (e) { setError(true); setMessage(e instanceof Error ? e.message : "Network error. Try again."); }
    finally { setBusy(false); }
  }}>{children}<button disabled={busy} aria-busy={busy}>{busy && <span className="button-spinner" aria-hidden="true" />}{busy ? "Saving…" : label}</button>{message && <p role="status" className={`notice ${error ? "error" : ""}`}>{message}</p>}</form>;
}
