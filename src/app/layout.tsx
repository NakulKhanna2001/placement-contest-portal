import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { signIn, signOut } from "@/auth";
import { getSession } from "@/services/viewer";
import { Navigation, NavItem } from "./components/navigation";
import { AccountControlsSkeleton } from "./components/skeleton";
import { Icon } from "./components/ui-icon";
import { VerificationWelcome } from "./components/verification-welcome";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "NST LC Grind — Weekly LeetCode Contests", template: "%s · NST LC Grind" },
  description: "NST's weekly LeetCode arena. Three hours, timed problem releases, verified solves, and a live leaderboard.",
};

async function AccountControls() {
  const session = await getSession();
  if (!session?.user.id) return <div className="account-controls signed-out">
    <form action={async () => { "use server"; await signIn("google", { redirectTo: "/account" }); }}>
      <button className="header-signin" disabled={!process.env.AUTH_SECRET || !process.env.DATABASE_URL}>Sign in</button>
    </form>
  </div>;
  return <>
    {session.user.role === "admin" && <NavItem href="/admin" label="Admin" />}
    <div className="account-controls">
      <form action={async () => { "use server"; await signOut({ redirectTo: "/" }); }}><button className="signout-button">Sign out</button></form>
    </div>
  </>;
}

async function VerificationOnboarding() {
  const session = await getSession();
  return <VerificationWelcome member={session?.user.id ? { id: session.user.id, leetcodeVerified: session.user.leetcodeVerified } : null} />;
}

// The shell does not await auth or Postgres. Each dynamic region streams within
// its own boundary, so navigation stays usable while the database wakes up.
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="en"><body>
    <a className="skip" href="#content">Skip to content</a>
    <header className="app-header"><div className="header-inner">
      <Link className="brand" href="/" aria-label="NST LC Grind home"><span className="brand-mark">NST</span><span>LC Grind</span></Link>
      <Navigation><Suspense fallback={<AccountControlsSkeleton />}><AccountControls /></Suspense></Navigation>
    </div></header>
    <div className="workspace">
      <div id="content" className="shell" tabIndex={-1}>{children}</div>
      <footer className="site-footer"><span>NST LC Grind</span><div className="footer-links"><Link href="/privacy">Privacy</Link><Link href="/terms">Rules</Link></div><a href="https://leetcode.com" target="_blank" rel="noreferrer">Problems on LeetCode <Icon name="external" size={12} /></a></footer>
    </div>
    <Suspense fallback={null}><VerificationOnboarding /></Suspense>
  </body></html>;
}
