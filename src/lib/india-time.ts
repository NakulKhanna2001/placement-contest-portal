export const INDIA_TIME_ZONE = "Asia/Kolkata";

const timeOptions: Intl.DateTimeFormatOptions = { timeZone: INDIA_TIME_ZONE, hour: "numeric", minute: "2-digit", hour12: true };
const timeFormatter = new Intl.DateTimeFormat("en-IN", timeOptions);
const dateFormatter = new Intl.DateTimeFormat("en-IN", { ...timeOptions, weekday: "short", day: "numeric", month: "short", year: "numeric" });
const preciseTimeFormatter = new Intl.DateTimeFormat("en-IN", { ...timeOptions, second: "2-digit" });
const preciseDateFormatter = new Intl.DateTimeFormat("en-IN", { ...timeOptions, second: "2-digit", weekday: "short", day: "numeric", month: "short", year: "numeric" });
const inputFormatter = new Intl.DateTimeFormat("en-GB", {
  timeZone: INDIA_TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit",
  hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
});

export function formatIndiaDateTime(value: string | Date, timeOnly = false, seconds = false): string {
  const date = typeof value === "string" ? new Date(value) : value;
  const formatter = seconds ? (timeOnly ? preciseTimeFormatter : preciseDateFormatter) : (timeOnly ? timeFormatter : dateFormatter);
  const label = formatter.format(date).replace(/\s+/g, " ").replace(/\b(am|pm)\b/gi, part => part.toUpperCase());
  return `${label} IST`;
}

export function auditDetailsInIST(details: string): string {
  try {
    return JSON.stringify(JSON.parse(details), (key: string, value: unknown) => {
      if (key.endsWith("At") && typeof value === "string" && /^\d{4}-\d{2}-\d{2}T/.test(value) && Number.isFinite(Date.parse(value))) return formatIndiaDateTime(value, false, true);
      return value;
    }, 2);
  } catch { return details; }
}

export function indiaDateTimeInput(iso: string): string {
  const parts = Object.fromEntries(inputFormatter.formatToParts(new Date(iso)).map(part => [part.type, part.value]));
  const seconds = parts.second === "00" ? "" : `:${parts.second}`;
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}${seconds}`;
}

export function indiaInputToIso(value: string): string {
  const invalid = () => new Error("Enter a valid date and time in IST.");
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?$/.test(value)) throw invalid();
  const date = new Date(`${value}+05:30`);
  if (!Number.isFinite(date.getTime())) throw invalid();
  const secondsPart = (input: string) => input.split(".")[0].length === 16 ? `${input.split(".")[0]}:00` : input.split(".")[0];
  // Reject normalized invalid calendar values, such as February 30.
  if (secondsPart(indiaDateTimeInput(date.toISOString())) !== secondsPart(value)) throw invalid();
  return date.toISOString();
}
