import { Suspense } from "react";
import { redirect } from "next/navigation";
import Link from "next/link";
import { getViewer } from "@/services/viewer";
import { LinkForm } from "./link-form";
import { PageHeader } from "../components/page-header";
import { ContentSkeleton } from "../components/skeleton";
import { Icon } from "../components/ui-icon";
import { hasVerifiedLeetCode } from "@/lib/contest-access";

export const dynamic = "force-dynamic";
export const metadata = { title: "Account" };

async function AccountDetails() {
  const user = await getViewer();
  if (!user) redirect("/api/auth/signin");
  const verified = hasVerifiedLeetCode(user);
  return <div className="profile-layout" data-page-ready="/account">
    <section className="card profile-card">
      <div className="profile-identity"><span className="avatar avatar-large" aria-hidden="true">{user.name.split(" ").map(p => p[0]).slice(0, 2).join("")}</span><div><h2>{user.name}</h2><p>{user.email}</p></div><span className={`badge ${verified ? "" : "neutral"}`}>{verified ? "Verified" : "Setup needed"}</span></div>
      {verified ? <div className="linked-account"><h2>LeetCode connected</h2><p>Your verified account is <strong>{user.leetcodeUsername}</strong>.</p><Link className="button" href="/">View contests</Link></div> : user.leetcodeUsername ? <p className="notice error">Your linked profile is not marked verified. Contact your contest administrator to restore verification.</p> : <LinkForm initialToken={user.verifyToken} />}
    </section>
    <details className="card"><summary>About account linking</summary><ul className="rule-list"><li>Verify the account you’ll solve with to unlock contest access.</li><li>Finish before a contest starts to submit solves in that contest.</li><li>Your LeetCode username cannot be changed after verification.</li><li>You can remove the code from ReadMe once your account is verified.</li><li>We only read public acceptance records. Your source code stays on LeetCode.</li></ul></details>
  </div>;
}

export default function Account() {
  if (!process.env.DATABASE_URL || !process.env.AUTH_SECRET) return <main data-page-ready="/account"><PageHeader title="Account setup" description="Configure the application to start linking your LeetCode account." /><section className="card"><h2>Connect the application first</h2><p className="muted">The README covers Postgres and Google authentication. Once configured, sign in to verify your LeetCode profile.</p><Link className="inline-link" href="/">Back to contests <Icon name="arrow" size={16} /></Link></section></main>;
  return <main><PageHeader title="Your account" description="Link LeetCode to participate in contests." /><Suspense fallback={<ContentSkeleton variant="account" />}><AccountDetails /></Suspense></main>;
}
