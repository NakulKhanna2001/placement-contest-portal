"use client";

import Link, { useLinkStatus } from "next/link";
import { usePathname } from "next/navigation";
import { useState, type ReactNode } from "react";

function LinkFeedback({ label }: { label: string }) {
  const { pending } = useLinkStatus();
  return <>
    <span className="nav-pending" data-pending={pending} aria-hidden="true" />
    {pending && <span className="sr-only" role="status">Loading {label.toLowerCase()}…</span>}
  </>;
}

export function NavItem({ href, label }: { href: string; label: string }) {
  const pathname = usePathname();
  const [intent, setIntent] = useState(false);
  const active = href === "/" ? pathname === href : pathname.startsWith(href);
  return <Link
    href={href}
    className="nav-link"
    aria-label={label}
    aria-current={active ? "page" : undefined}
    prefetch={intent && href !== "/" ? true : undefined}
    onMouseEnter={() => setIntent(true)}
    onFocus={() => setIntent(true)}
  >
    <span>{label}</span><LinkFeedback label={label} />
  </Link>;
}

export function Navigation({ children }: { children: ReactNode }) {
  return <nav className="navigation" aria-label="Main navigation">
    <NavItem href="/" label="Contests" />
    <NavItem href="/leaderboard" label="Leaderboard" />
    <NavItem href="/results" label="Results" />
    <NavItem href="/account" label="Account" />
    {children}
  </nav>;
}
