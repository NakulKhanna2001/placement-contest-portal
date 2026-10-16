import type { ReactNode } from "react";

export function PageHeader({ eyebrow, title, description, aside }: {
  eyebrow?: string; title: string; description?: string; aside?: ReactNode;
}) {
  return <header className="page-heading">
    <div>{eyebrow && <span className="eyebrow">{eyebrow}</span>}<h1>{title}</h1>{description && <p className="intro">{description}</p>}</div>
    {aside && <div className="heading-aside">{aside}</div>}
  </header>;
}
