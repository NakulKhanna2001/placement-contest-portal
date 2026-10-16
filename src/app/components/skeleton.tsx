export function SkeletonLine({ width = "wide", tall = false }: { width?: "wide" | "medium" | "short"; tall?: boolean }) {
  return <div className={`skeleton skeleton-line skeleton-${width}${tall ? " skeleton-tall" : ""}`} />;
}

export function PanelSkeleton({ rows = 4 }: { rows?: number }) {
  return <div className="card skeleton-panel" aria-hidden="true">
    <SkeletonLine width="medium" tall />
    <SkeletonLine width="wide" />
    {Array.from({ length: rows }, (_, i) => <div className="skeleton-row" key={i}><div className="skeleton skeleton-square" /><div className="skeleton-row-text"><SkeletonLine width={i % 2 ? "medium" : "wide"} /><SkeletonLine width="short" /></div><div className="skeleton skeleton-chip" /></div>)}
  </div>;
}

export function ContentSkeleton({ variant = "arena" }: { variant?: "arena" | "account" | "results" | "admin" }) {
  return <div className={`route-skeleton skeleton-${variant}`} role="status" aria-label={`Loading ${variant}`} aria-busy="true">
    <span className="sr-only">Loading {variant}. Your navigation remains available.</span>
    {variant === "admin" && <div className="admin-summary" aria-hidden="true">{[0, 1, 2].map(i => <div className="skeleton skeleton-chip" key={i} />)}</div>}
    {variant === "results" ? <PanelSkeleton rows={5} /> : <div className={variant === "account" ? "profile-layout" : "columns"}>
      {variant === "account" ? <div className="card skeleton-profile" aria-hidden="true">
        <div className="profile-identity"><div className="skeleton skeleton-avatar" /><div><SkeletonLine width="medium" /><SkeletonLine width="wide" /></div><div className="skeleton skeleton-chip" /></div>
        <SkeletonLine width="medium" tall /><SkeletonLine width="wide" /><SkeletonLine width="medium" />
        <div className="skeleton-field"><SkeletonLine width="short" /><div className="skeleton skeleton-input" /></div>
        <div className="skeleton-field"><SkeletonLine width="short" /><div className="skeleton skeleton-input" /></div>
        <div className="skeleton skeleton-button" />
      </div> : <PanelSkeleton rows={4} />}
      {variant !== "account" && <PanelSkeleton rows={2} />}
    </div>}
  </div>;
}

export function PageSkeleton({ variant = "arena" }: { variant?: "arena" | "account" | "results" | "admin" }) {
  return <div className="page-skeleton">
    <div className="skeleton-heading" aria-hidden="true"><SkeletonLine width="medium" tall /><SkeletonLine width="wide" /></div>
    <ContentSkeleton variant={variant} />
  </div>;
}

export function AccountControlsSkeleton() {
  return <div className="account-controls account-placeholder" role="status" aria-label="Loading account controls">
    <div className="skeleton skeleton-chip" aria-hidden="true" />
  </div>;
}
