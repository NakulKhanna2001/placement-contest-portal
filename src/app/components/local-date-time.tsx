import { formatIndiaDateTime } from "@/lib/india-time";

// The portal's local timezone is always India Standard Time, on both server and
// client. Keep the machine-readable instant while showing no UTC fallback/tooltip.
export function LocalDateTime({ value, timeOnly = false, seconds = false }: { value: string; timeOnly?: boolean; seconds?: boolean }) {
  return <time dateTime={value} title={formatIndiaDateTime(value, false, true)}>{formatIndiaDateTime(value, timeOnly, seconds)}</time>;
}
