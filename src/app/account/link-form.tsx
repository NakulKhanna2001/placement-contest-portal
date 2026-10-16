"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { postJson } from "../components/api-form";
export function LinkForm({ initialToken }: { initialToken: string | null }) {
  const [token, setToken] = useState(initialToken);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const router = useRouter();
  async function begin() {
    setBusy(true); setMessage("");
    try { const result = await postJson("/api/link", { action: "begin" }); setToken(result.token); }
    catch (e) { setMessage(e instanceof Error ? e.message : "Could not get a code."); }
    finally { setBusy(false); }
  }
  return <div><h2>Link your LeetCode account</h2><ol className="rule-list"><li>Get your verification code below.</li><li>Add it to your <a href="https://leetcode.com/profile/" target="_blank" rel="noreferrer">LeetCode bio</a> and save.</li><li>Enter your username and verify.</li></ol>{!token ? <button disabled={busy} onClick={begin}>{busy ? "Getting code…" : "Get verification code"}</button> : <><p className="notice"><code>{token}</code></p><form className="form-stack" onSubmit={async e => {
    e.preventDefault(); setBusy(true); setMessage("");
    const username = new FormData(e.currentTarget).get("username");
    try { await postJson("/api/link", { action: "confirm", username }); router.refresh(); }
    catch (e) { setMessage(e instanceof Error ? e.message : "Could not verify your account."); }
    finally { setBusy(false); }
  }}><label>LeetCode username<input name="username" required maxLength={30} placeholder="Your LeetCode username" autoComplete="off" /></label><button disabled={busy}>{busy ? "Checking profile…" : "Verify account"}</button></form></>}{message && <p role="status" className="notice error">{message}</p>}</div>;
}
