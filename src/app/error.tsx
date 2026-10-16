"use client";
export default function ErrorPage({ reset }: { reset: () => void }) { return <main className="narrow card"><h1>We couldn’t load this page.</h1><p>Check your connection and try again. If you’re setting up locally, confirm the database is available and migrations have run.</p><button onClick={reset}>Try again</button></main>; }
