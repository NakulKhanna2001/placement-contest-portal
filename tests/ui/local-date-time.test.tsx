// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";
import { LocalDateTime } from "@/app/components/local-date-time";
afterEach(() => { cleanup(); vi.unstubAllEnvs(); });

it("shows the viewer's local time with the UTC instant available as a tooltip", () => {
  vi.stubEnv("TZ", "Asia/Kolkata");
  render(<LocalDateTime value="2026-10-16T09:30:00.000Z" timeOnly />);
  const time = screen.getByTitle("Fri, 16 Oct 2026 09:30:00 GMT");
  expect(time.getAttribute("datetime")).toBe("2026-10-16T09:30:00.000Z");
  expect(time.textContent).toMatch(/3:00|15:00/);
  expect(time.textContent).not.toBe("09:30 UTC");
});

it("uses a deterministic UTC fallback during server rendering", () => {
  vi.stubEnv("TZ", "Asia/Kolkata");
  const html = renderToStaticMarkup(<LocalDateTime value="2026-10-16T09:30:00.000Z" timeOnly />);
  expect(html).toContain("09:30 UTC");
});
