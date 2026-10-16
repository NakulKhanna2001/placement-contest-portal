"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";

export function AutoRefresh({ serverTime, refreshAfterMs = 60000 }: { serverTime: number; refreshAfterMs?: number }) {
  const router = useRouter();
  useEffect(() => {
    // Server-calculated delay: device clock changes never release a batch.
    // Refresh at the next boundary, with a once-a-minute background reconciliation.
    const timer = setTimeout(() => { if (!document.hidden) router.refresh(); }, Math.max(1000, Math.min(refreshAfterMs, 60000)));
    const onVisible = () => { if (!document.hidden) router.refresh(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => { clearTimeout(timer); document.removeEventListener("visibilitychange", onVisible); };
  }, [router, serverTime, refreshAfterMs]);
  return null;
}
