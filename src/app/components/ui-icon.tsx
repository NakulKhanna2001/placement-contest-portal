import type { ReactNode } from "react";

const paths: Record<string, ReactNode> = {
  arena: <><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" /></>,
  results: <><path d="M8 3h8v6a4 4 0 0 1-8 0V3Z" /><path d="M8 5H4v3a4 4 0 0 0 4 4m8-7h4v3a4 4 0 0 1-4 4m-4 1v6m-4 2h8" /></>,
  account: <><circle cx="12" cy="8" r="4" /><path d="M4 21v-2a8 8 0 0 1 16 0v2" /></>,
  admin: <><path d="m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6l8-3Z" /><path d="m8 12 3 3 5-6" /></>,
  arrow: <><path d="M5 12h14m-6-6 6 6-6 6" /></>,
  external: <><path d="M13 4h7v7m0-7L10 14" /><path d="M10 4H4v16h16v-6" /></>,
  clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
  check: <path d="m5 12 4 4L19 6" />,
  lock: <><rect x="5" y="10" width="14" height="11" rx="2" /><path d="M8 10V7a4 4 0 0 1 8 0v3m-4 5v2" /></>,
  logout: <><path d="M9 4H4v16h5m5-12 4 4-4 4m-6-4h13" /></>,
  code: <><path d="m7 7-5 5 5 5m10-10 5 5-5 5m-4-13-2 20" /></>,
};

export function Icon({ name, size = 20 }: { name: keyof typeof paths; size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>;
}
