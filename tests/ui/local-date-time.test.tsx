// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";
import { LocalDateTime } from "@/app/components/local-date-time";
afterEach(() => { cleanup(); vi.unstubAllEnvs(); });

it.each(["Asia/Kolkata", "UTC", "America/New_York"])("shows only IST regardless of the viewer timezone %s", zone => {
  vi.stubEnv("TZ", zone);
  const { container } = render(<LocalDateTime value="2026-10-16T09:30:00.000Z" timeOnly />);
  const time = container.querySelector("time")!;
  expect(time.getAttribute("datetime")).toBe("2026-10-16T09:30:00.000Z");
  expect(time.textContent).toBe("3:00 PM IST");
  expect(time.title).toContain("IST");
  expect(time.title).not.toMatch(/GMT|UTC/);
});

it("renders IST immediately on the server without a UTC fallback", () => {
  vi.stubEnv("TZ", "UTC");
  const html = renderToStaticMarkup(<LocalDateTime value="2026-10-16T09:30:00.000Z" timeOnly />);
  expect(html).toContain("3:00 PM IST");
  expect(html).not.toMatch(/GMT|UTC/);
});
