import type { ReactNode } from "react";
import { PageHeader } from "./page-header";

export function VerificationGate({ action }: { action: ReactNode }) {
  return <main data-verification-required="true">
    <PageHeader title="Verify LeetCode to enter contests" description="Your Google sign-in is complete. Verify your LeetCode profile to unlock contest access." />
    <section className="card narrow">
      <h2>One quick step before you join</h2>
      <p>Complete the verification steps on your Account page. Once verified, you can open contest problems, view standings, and take part.</p>
      {action}
      <p className="card-footnote">You can verify and join during a live contest. The same problem windows and submission deadline apply.</p>
    </section>
  </main>;
}
