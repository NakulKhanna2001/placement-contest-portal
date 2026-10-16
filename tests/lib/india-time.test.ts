import { afterEach, expect, it, vi } from "vitest";
import { auditDetailsInIST, formatIndiaDateTime, indiaDateTimeInput, indiaInputToIso } from "@/lib/india-time";
afterEach(() => vi.unstubAllEnvs());

it.each(["UTC", "America/New_York", "Asia/Kolkata"])("uses IST for display and form input in host timezone %s", zone => {
  vi.stubEnv("TZ", zone);
  const iso = "2026-10-16T09:30:00.000Z";
  expect(formatIndiaDateTime(iso, true)).toBe("3:00 PM IST");
  expect(indiaDateTimeInput(iso)).toBe("2026-10-16T15:00");
  expect(indiaInputToIso("2026-10-16T15:00")).toBe(iso);
});
it("handles the IST day boundary and preserves seconds", () => {
  expect(indiaInputToIso("2026-10-17T00:15:30")).toBe("2026-10-16T18:45:30.000Z");
  expect(indiaDateTimeInput("2026-10-16T18:45:30.000Z")).toBe("2026-10-17T00:15:30");
});
it.each(["", "not-a-date", "2026-02-30T15:00", "2026-10-16T25:00", "2026-10-16T15:00Z"])("rejects invalid or offset-bearing wall times: %s", value => {
  expect(() => indiaInputToIso(value)).toThrow();
});
it("formats audit timestamps in IST without altering evidence or reason text", () => {
  const iso = "2026-10-16T09:30:01.000Z";
  const source = JSON.stringify({ before: { acceptedAt: iso }, reason: iso, evidence: "https://example.com/proof" });
  const displayed = JSON.parse(auditDetailsInIST(source));
  expect(displayed.before.acceptedAt).toContain("3:00:01 PM IST");
  expect(displayed.reason).toBe(iso);
  expect(displayed.evidence).toBe("https://example.com/proof");
  expect(auditDetailsInIST("Plain audit note")).toBe("Plain audit note");
});
