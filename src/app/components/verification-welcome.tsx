"use client";

import { useEffect, useId, useRef } from "react";
import { VerificationGuide } from "./verification-guide";

type Member = { id: number; leetcodeVerified: boolean };

export function VerificationWelcome({ member }: { member: Member | null }) {
  if (!member || member.leetcodeVerified) return null;
  return <WelcomeDialog key={member.id} userId={member.id} />;
}

function WelcomeDialog({ userId }: { userId: number }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const titleId = useId();
  const descriptionId = useId();
  const storageKey = `nst-lc-grind:verification-welcome:${userId}`;

  useEffect(() => {
    const element = dialog.current;
    if (!element) return;
    try { if (sessionStorage.getItem(storageKey) === "dismissed") return; }
    catch { /* Storage restrictions must not prevent account setup. */ }
    element.showModal();
    heading.current?.focus();
    return () => element.close();
  }, [storageKey]);

  function dismiss() {
    try { sessionStorage.setItem(storageKey, "dismissed"); }
    catch { /* Closing still works without storage. */ }
    dialog.current?.close();
  }

  return <dialog ref={dialog} className="verification-welcome" aria-labelledby={titleId} aria-describedby={descriptionId} onCancel={event => { event.preventDefault(); dismiss(); }}>
    <div className="welcome-dialog-header">
      <h2 id={titleId} ref={heading} tabIndex={-1}>Welcome to NST LC Grind</h2>
      <button type="button" className="button-secondary" onClick={dismiss} aria-label="Close welcome guide">Close</button>
    </div>
    <div className="welcome-dialog-body">
      <p id={descriptionId}><strong>Verify your LeetCode profile to unlock contest access.</strong> This one-time step confirms the account you’ll solve with.</p>
      <p className="muted">Finish before a contest starts. Follow the steps below; you can reopen this guide on your Account page anytime.</p>
      <VerificationGuide />
    </div>
    <div className="welcome-dialog-footer">
      <a className="button" href="/account#leetcode-verification" onClick={dismiss}>Start verification</a>
      <span className="muted">Required before entering contests</span>
    </div>
  </dialog>;
}
