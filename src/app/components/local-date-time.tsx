"use client";

import { useMemo, useSyncExternalStore } from "react";
const subscribe = () => () => {};

export function LocalDateTime({ value, timeOnly = false }: { value: string; timeOnly?: boolean }) {
  const date = new Date(value);
  const formatter = useMemo(() => new Intl.DateTimeFormat(undefined, {
    ...(timeOnly ? {} : { weekday: "short", day: "numeric", month: "short", year: "numeric" } as const),
    hour: "numeric", minute: "2-digit", timeZoneName: "short",
  }), [timeOnly]);
  // SSR and the first hydration pass share UTC text. The browser then uses its
  // own timezone without changing the underlying instant or any server gates.
  const label = useSyncExternalStore(subscribe, () => formatter.format(date), () => timeOnly ? `${date.toISOString().slice(11, 16)} UTC` : date.toUTCString());
  return <time dateTime={value} title={date.toUTCString()}>{label}</time>;
}
